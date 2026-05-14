import { ref, get, update, set, runTransaction } from "firebase/database";
import { db } from "./firebase";
import { SUBSCRIPTION_PLANS } from "../../constants/subscriptionPlans";

/* ======================================================
   CONSTANTS
====================================================== */

const GST_RATE = 0.18;
const CESS_RATE = 0.00; // 0% for now, can be adjusted
const GRACE_PERIOD_DAYS = 7;
const RENEWAL_REMINDER_DAYS = [30, 15, 7, 3, 1];

// Subscription status types
const SUBSCRIPTION_STATUS = {
  ACTIVE: "active",
  EXPIRED: "expired",
  CANCELLED: "cancelled",
  SUSPENDED: "suspended",
  TRIAL: "trial",
  GRACE_PERIOD: "grace_period"
};

/* ======================================================
   GST & PRICE CALCULATIONS
====================================================== */

const calculatePlanPrice = (basePrice, options = {}) => {
  const { includeCess = false, discountPercent = 0 } = options;
  
  // Apply discount if any
  const discountedPrice = basePrice * (1 - discountPercent / 100);
  
  // Calculate GST
  const gstAmount = Math.round(discountedPrice * GST_RATE);
  
  // Calculate Cess if applicable
  const cessAmount = includeCess ? Math.round(discountedPrice * CESS_RATE) : 0;
  
  const totalAmount = discountedPrice + gstAmount + cessAmount;
  
  return {
    basePrice: Math.round(basePrice),
    discountedPrice: Math.round(discountedPrice),
    discountPercent,
    gstAmount,
    cessAmount,
    totalAmount: Math.round(totalAmount),
    gstRate: GST_RATE * 100,
    cessRate: CESS_RATE * 100
  };
};

/* ======================================================
   HELPER FUNCTIONS
====================================================== */

const getPlanFromKey = (planKey) => {
  if (Array.isArray(SUBSCRIPTION_PLANS)) {
    return SUBSCRIPTION_PLANS.find(p => p.id === planKey || p.name === planKey);
  }
  return SUBSCRIPTION_PLANS[planKey];
};

const calculateExpiryDate = (startDate, durationDays) => {
  const expiry = new Date(startDate);
  expiry.setDate(expiry.getDate() + durationDays);
  return expiry.getTime();
};

const getDaysRemaining = (expiryDate) => {
  const now = Date.now();
  if (now >= expiryDate) return 0;
  return Math.ceil((expiryDate - now) / (24 * 60 * 60 * 1000));
};

const getSubscriptionStatusMessage = (status, daysRemaining = 0) => {
  const messages = {
    [SUBSCRIPTION_STATUS.ACTIVE]: `Active. ${daysRemaining} days remaining`,
    [SUBSCRIPTION_STATUS.EXPIRED]: "Subscription expired. Please renew to continue services.",
    [SUBSCRIPTION_STATUS.CANCELLED]: "Subscription cancelled. Reactivate to resume services.",
    [SUBSCRIPTION_STATUS.SUSPENDED]: "Subscription suspended due to payment issues.",
    [SUBSCRIPTION_STATUS.TRIAL]: `Trial period. ${daysRemaining} days remaining`,
    [SUBSCRIPTION_STATUS.GRACE_PERIOD]: `Grace period. ${daysRemaining} days remaining to renew`
  };
  return messages[status] || "Subscription status unknown";
};

/* ======================================================
   CHECK SUBSCRIPTION STATUS (ENHANCED)
====================================================== */

export const checkSubscriptionStatus = async (shopId) => {
  if (!shopId) {
    return {
      status: SUBSCRIPTION_STATUS.EXPIRED,
      expired: true,
      message: "Invalid shop ID"
    };
  }

  const subRef = ref(db, `shops/${shopId}/info/subscription`);
  const snap = await get(subRef);

  if (!snap.exists()) {
    return {
      status: SUBSCRIPTION_STATUS.EXPIRED,
      expired: true,
      message: "No subscription found. Please activate a plan.",
      plan: null,
      daysRemaining: 0
    };
  }

  const sub = snap.val();
  const now = Date.now();
  const daysRemaining = getDaysRemaining(sub.expiryDate);
  
  // Check if subscription is in grace period
  const isInGracePeriod = sub.status === SUBSCRIPTION_STATUS.ACTIVE && 
                          now > sub.expiryDate && 
                          now <= sub.expiryDate + (GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);
  
  // Auto-update expired subscriptions
  if (sub.status === SUBSCRIPTION_STATUS.ACTIVE && now > sub.expiryDate) {
    const newStatus = isInGracePeriod ? SUBSCRIPTION_STATUS.GRACE_PERIOD : SUBSCRIPTION_STATUS.EXPIRED;
    
    await update(subRef, { 
      status: newStatus,
      expiredAt: now,
      updatedAt: now
    });
    
    // Create notification for shop owner
    await createSubscriptionNotification(shopId, newStatus, daysRemaining);
    
    return {
      ...sub,
      status: newStatus,
      expired: true,
      inGracePeriod: isInGracePeriod,
      daysRemaining: isInGracePeriod ? GRACE_PERIOD_DAYS - Math.ceil((now - sub.expiryDate) / (24 * 60 * 60 * 1000)) : 0,
      message: getSubscriptionStatusMessage(newStatus, daysRemaining)
    };
  }
  
  // Check if renewal reminders are needed
  if (sub.status === SUBSCRIPTION_STATUS.ACTIVE && daysRemaining <= 30) {
    await sendRenewalReminders(shopId, sub, daysRemaining);
  }
  
  return {
    ...sub,
    expired: sub.status !== SUBSCRIPTION_STATUS.ACTIVE,
    daysRemaining: daysRemaining > 0 ? daysRemaining : 0,
    message: getSubscriptionStatusMessage(sub.status, daysRemaining),
    requiresAttention: sub.status !== SUBSCRIPTION_STATUS.ACTIVE,
    gracePeriodEnds: sub.status === SUBSCRIPTION_STATUS.GRACE_PERIOD ? sub.expiryDate + (GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000) : null
  };
};

/* ======================================================
   ACTIVATE PLAN (ENHANCED)
====================================================== */

export const activatePlan = async (shopId, planKey, options = {}) => {
  if (!shopId) throw new Error("Shop ID missing");
  if (!planKey) throw new Error("Plan key missing");

  const plan = getPlanFromKey(planKey);
  if (!plan) {
    throw new Error(`Invalid subscription plan: ${planKey}`);
  }

  const now = Date.now();
  const durationDays = plan.durationDays || 30;
  const expiryDate = calculateExpiryDate(now, durationDays);
  
  // Calculate pricing with potential discounts
  const pricing = calculatePlanPrice(plan.price, {
    discountPercent: options.discountPercent || 0,
    includeCess: options.includeCess || false
  });

  // Get current subscription for comparison
  const currentSub = await getSubscriptionDetails(shopId);
  
  const subscriptionData = {
    planKey: plan.id || planKey,
    planName: plan.name,
    planFeatures: plan.features || [],
    maxEmployees: plan.maxEmployees || -1,
    maxProducts: plan.maxProducts || -1,
    storageLimit: plan.storageLimit || 100,
    
    basePrice: pricing.basePrice,
    discountedPrice: pricing.discountedPrice,
    discountPercent: pricing.discountPercent,
    gstAmount: pricing.gstAmount,
    cessAmount: pricing.cessAmount,
    totalAmount: pricing.totalAmount,
    gstRate: pricing.gstRate,
    
    startDate: now,
    expiryDate,
    status: SUBSCRIPTION_STATUS.ACTIVE,
    autoRenew: options.autoRenew || false,
    
    paymentMethod: options.paymentMethod || null,
    transactionId: options.transactionId || null,
    
    createdAt: currentSub ? currentSub.createdAt : now,
    updatedAt: now,
    updatedBy: options.userId || "system",
    
    previousPlan: currentSub ? {
      planKey: currentSub.planKey,
      expiredAt: currentSub.expiryDate
    } : null
  };

  // Use transaction to prevent race conditions
  const subRef = ref(db, `shops/${shopId}/info/subscription`);
  
  const result = await runTransaction(subRef, (current) => {
    if (current && current.status === SUBSCRIPTION_STATUS.ACTIVE && current.expiryDate > now) {
      // Check if extending existing subscription
      if (options.extendExisting) {
        const newExpiry = calculateExpiryDate(current.expiryDate, durationDays);
        subscriptionData.startDate = current.startDate;
        subscriptionData.expiryDate = newExpiry;
        subscriptionData.previousPlan = {
          planKey: current.planKey,
          extendedFrom: current.expiryDate
        };
      }
    }
    return subscriptionData;
  });

  if (!result.committed) {
    throw new Error("Failed to activate subscription due to concurrent update");
  }

  // Create invoice for the subscription
  await createSubscriptionInvoice(shopId, subscriptionData, options);

  // Create notification
  await createSubscriptionNotification(shopId, SUBSCRIPTION_STATUS.ACTIVE, durationDays);

  // Log activation
  await logSubscriptionAction(shopId, "activate", {
    planKey,
    totalAmount: pricing.totalAmount,
    durationDays
  });

  return subscriptionData;
};

/* ======================================================
   RENEW SUBSCRIPTION
====================================================== */

export const renewSubscription = async (shopId, options = {}) => {
  if (!shopId) throw new Error("Shop ID missing");
  
  const currentSub = await getSubscriptionDetails(shopId);
  if (!currentSub) {
    throw new Error("No active subscription found to renew");
  }
  
  const plan = getPlanFromKey(currentSub.planKey);
  if (!plan) {
    throw new Error("Plan configuration not found");
  }
  
  const now = Date.now();
  const durationDays = plan.durationDays || 30;
  
  // Calculate new expiry date based on current expiry or now
  const baseDate = currentSub.expiryDate > now ? currentSub.expiryDate : now;
  const newExpiryDate = calculateExpiryDate(baseDate, durationDays);
  
  // Calculate pricing
  const pricing = calculatePlanPrice(plan.price, {
    discountPercent: options.discountPercent || (currentSub.autoRenew ? 5 : 0), // 5% discount for auto-renewal
    includeCess: options.includeCess || false
  });
  
  const renewalData = {
    ...currentSub,
    expiryDate: newExpiryDate,
    totalAmount: pricing.totalAmount,
    gstAmount: pricing.gstAmount,
    updatedAt: now,
    lastRenewedAt: now,
    renewalCount: (currentSub.renewalCount || 0) + 1,
    status: SUBSCRIPTION_STATUS.ACTIVE
  };
  
  // If payment is pending, mark as pending renewal
  if (options.paymentPending) {
    renewalData.status = SUBSCRIPTION_STATUS.SUSPENDED;
    renewalData.paymentDueDate = now + 7 * 24 * 60 * 60 * 1000;
  }
  
  await set(ref(db, `shops/${shopId}/info/subscription`), renewalData);
  
  // Create renewal invoice
  await createSubscriptionInvoice(shopId, renewalData, { ...options, isRenewal: true });
  
  await logSubscriptionAction(shopId, "renew", {
    previousExpiry: currentSub.expiryDate,
    newExpiry: newExpiryDate,
    amount: pricing.totalAmount
  });
  
  return renewalData;
};

/* ======================================================
   CANCEL SUBSCRIPTION
====================================================== */

export const cancelSubscription = async (shopId, userId, reason = "") => {
  if (!shopId) throw new Error("Shop ID missing");
  
  const subRef = ref(db, `shops/${shopId}/info/subscription`);
  const sub = await getSubscriptionDetails(shopId);
  
  if (!sub) {
    throw new Error("No subscription found");
  }
  
  const cancellationData = {
    status: SUBSCRIPTION_STATUS.CANCELLED,
    cancelledAt: Date.now(),
    cancelledBy: userId,
    cancellationReason: reason,
    validUntil: sub.expiryDate, // Service continues until expiry date
    updatedAt: Date.now()
  };
  
  await update(subRef, cancellationData);
  
  await createSubscriptionNotification(shopId, SUBSCRIPTION_STATUS.CANCELLED);
  await logSubscriptionAction(shopId, "cancel", { reason });
  
  return cancellationData;
};

/* ======================================================
   GET SUBSCRIPTION DETAILS (ENHANCED)
====================================================== */

export const getSubscriptionDetails = async (shopId) => {
  if (!shopId) return null;

  const snap = await get(ref(db, `shops/${shopId}/info/subscription`));
  if (!snap.exists()) return null;

  const subscription = snap.val();
  
  // Add computed fields
  const now = Date.now();
  const daysRemaining = getDaysRemaining(subscription.expiryDate);
  
  return {
    ...subscription,
    daysRemaining: daysRemaining > 0 ? daysRemaining : 0,
    isExpired: now > subscription.expiryDate && subscription.status === SUBSCRIPTION_STATUS.ACTIVE,
    isActive: subscription.status === SUBSCRIPTION_STATUS.ACTIVE && now <= subscription.expiryDate,
    canRenew: subscription.status !== SUBSCRIPTION_STATUS.CANCELLED,
    percentageUsed: subscription.expiryDate > subscription.startDate 
      ? ((now - subscription.startDate) / (subscription.expiryDate - subscription.startDate)) * 100
      : 0
  };
};

/* ======================================================
   EXTEND SUBSCRIPTION (ENHANCED)
====================================================== */

export const extendSubscription = async (shopId, extraDays, userId, reason = "Manual extension") => {
  if (!shopId) throw new Error("Shop ID missing");
  if (!extraDays || extraDays <= 0) throw new Error("Invalid extension days");

  const subRef = ref(db, `shops/${shopId}/info/subscription`);
  const snap = await get(subRef);

  if (!snap.exists()) {
    throw new Error("Subscription not found");
  }

  const sub = snap.val();
  const now = Date.now();
  
  // Calculate new expiry date
  const baseDate = sub.expiryDate && sub.expiryDate > now ? sub.expiryDate : now;
  const newExpiry = calculateExpiryDate(baseDate, extraDays);
  
  // Calculate prorated cost if needed
  const plan = getPlanFromKey(sub.planKey);
  const dailyRate = plan ? plan.price / (plan.durationDays || 30) : 0;
  const extensionCost = dailyRate * extraDays;
  const extensionGST = extensionCost * GST_RATE;
  
  await update(subRef, {
    expiryDate: newExpiry,
    status: SUBSCRIPTION_STATUS.ACTIVE,
    extendedAt: now,
    extendedBy: userId,
    extensionDays: extraDays,
    extensionCost: extensionCost,
    extensionGST: extensionGST,
    updatedAt: now
  });

  await logSubscriptionAction(shopId, "extend", {
    extraDays,
    newExpiry,
    reason
  });

  return {
    newExpiry,
    extraDays,
    extensionCost,
    extensionGST,
    totalCost: extensionCost + extensionGST
  };
};

/* ======================================================
   GET SUBSCRIPTION HISTORY
====================================================== */

export const getSubscriptionHistory = async (shopId, limit = 50) => {
  if (!shopId) return [];
  
  const historyRef = ref(db, `shops/${shopId}/subscriptionHistory`);
  const snap = await get(historyRef);
  
  if (!snap.exists()) return [];
  
  const history = [];
  snap.forEach((child) => {
    history.push({
      id: child.key,
      ...child.val()
    });
  });
  
  return history
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit);
};

/* ======================================================
   CHECK FEATURE ACCESS
====================================================== */

export const checkFeatureAccess = async (shopId, feature) => {
  const subscription = await getSubscriptionDetails(shopId);
  
  if (!subscription || subscription.status !== SUBSCRIPTION_STATUS.ACTIVE) {
    return false;
  }
  
  const plan = getPlanFromKey(subscription.planKey);
  if (!plan || !plan.features) {
    return false;
  }
  
  return plan.features.includes(feature);
};

/* ======================================================
   CHECK USAGE LIMITS
====================================================== */

export const checkUsageLimits = async (shopId, type, currentValue) => {
  const subscription = await getSubscriptionDetails(shopId);
  
  if (!subscription || subscription.status !== SUBSCRIPTION_STATUS.ACTIVE) {
    return { allowed: false, limit: 0, current: currentValue };
  }
  
  const plan = getPlanFromKey(subscription.planKey);
  let limit = -1; // -1 means unlimited
  
  switch(type) {
    case 'employees':
      limit = plan.maxEmployees || -1;
      break;
    case 'products':
      limit = plan.maxProducts || -1;
      break;
    case 'storage':
      limit = plan.storageLimit || 100;
      break;
    default:
      limit = -1;
  }
  
  const allowed = limit === -1 || currentValue <= limit;
  
  return {
    allowed,
    limit: limit === -1 ? 'unlimited' : limit,
    current: currentValue,
    percentageUsed: limit !== -1 ? (currentValue / limit) * 100 : 0
  };
};

/* ======================================================
   NOTIFICATION HELPERS
====================================================== */

const createSubscriptionNotification = async (shopId, status, daysRemaining = 0) => {
  const notificationRef = ref(db, `shops/${shopId}/notifications/${Date.now()}`);
  
  let title, message, type;
  
  switch(status) {
    case SUBSCRIPTION_STATUS.ACTIVE:
      title = "Subscription Activated ✅";
      message = `Your subscription is now active for ${daysRemaining} days.`;
      type = "success";
      break;
    case SUBSCRIPTION_STATUS.EXPIRED:
      title = "Subscription Expired ⚠️";
      message = "Your subscription has expired. Please renew to continue using all features.";
      type = "error";
      break;
    case SUBSCRIPTION_STATUS.GRACE_PERIOD:
      title = "Subscription Grace Period ⏰";
      message = `Your subscription is in grace period. Please renew within ${GRACE_PERIOD_DAYS} days to avoid service interruption.`;
      type = "warning";
      break;
    case SUBSCRIPTION_STATUS.CANCELLED:
      title = "Subscription Cancelled 📝";
      message = "Your subscription has been cancelled. Service will continue until the expiry date.";
      type = "info";
      break;
    default:
      return;
  }
  
  await set(notificationRef, {
    title,
    message,
    type,
    read: false,
    createdAt: Date.now(),
    status
  });
};

const sendRenewalReminders = async (shopId, subscription, daysRemaining) => {
  // Check if reminder already sent for this threshold
  const remindersRef = ref(db, `shops/${shopId}/renewalReminders`);
  const snap = await get(remindersRef);
  const sentReminders = snap.exists() ? snap.val() : {};
  
  for (const reminderDay of RENEWAL_REMINDER_DAYS) {
    if (daysRemaining === reminderDay && !sentReminders[reminderDay]) {
      // Send reminder notification
      const notificationRef = ref(db, `shops/${shopId}/notifications/${Date.now()}`);
      await set(notificationRef, {
        title: "Subscription Renewal Reminder 🔔",
        message: `Your subscription will expire in ${daysRemaining} days. Renew now to continue uninterrupted service.`,
        type: "warning",
        read: false,
        createdAt: Date.now(),
        action: "renew",
        daysRemaining
      });
      
      // Mark reminder as sent
      await set(ref(db, `shops/${shopId}/renewalReminders/${reminderDay}`), {
        sentAt: Date.now(),
        daysRemaining
      });
    }
  }
};

const createSubscriptionInvoice = async (shopId, subscription, options = {}) => {
  const invoiceRef = push(ref(db, `shops/${shopId}/invoices`));
  const invoiceNumber = `INV-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  
  await set(invoiceRef, {
    invoiceNumber,
    type: options.isRenewal ? "renewal" : "subscription",
    planName: subscription.planName,
    amount: subscription.totalAmount,
    basePrice: subscription.basePrice,
    gstAmount: subscription.gstAmount,
    status: options.paymentPending ? "pending" : "paid",
    createdAt: Date.now(),
    dueDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
    paymentMethod: options.paymentMethod || null,
    transactionId: options.transactionId || null,
    isRenewal: options.isRenewal || false
  });
};

const logSubscriptionAction = async (shopId, action, details) => {
  try {
    const logRef = push(ref(db, `shops/${shopId}/subscriptionLogs`));
    await set(logRef, {
      action,
      details,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error("Failed to log subscription action:", error);
  }
};

/* ======================================================
   GET SUBSCRIPTION ANALYTICS
====================================================== */

export const getSubscriptionAnalytics = async (shopId) => {
  const history = await getSubscriptionHistory(shopId, 100);
  
  if (history.length === 0) return null;
  
  const analytics = {
    totalPaid: 0,
    averagePayment: 0,
    renewals: 0,
    cancellations: 0,
    extensions: 0,
    paymentMethods: {},
    monthlyTrend: {}
  };
  
  history.forEach(entry => {
    if (entry.details?.amount) {
      analytics.totalPaid += entry.details.amount;
    }
    
    switch(entry.action) {
      case 'renew':
        analytics.renewals++;
        break;
      case 'cancel':
        analytics.cancellations++;
        break;
      case 'extend':
        analytics.extensions++;
        break;
    }
    
    if (entry.details?.paymentMethod) {
      analytics.paymentMethods[entry.details.paymentMethod] = 
        (analytics.paymentMethods[entry.details.paymentMethod] || 0) + 1;
    }
    
    // Monthly trend
    const date = new Date(entry.timestamp);
    const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
    analytics.monthlyTrend[monthKey] = (analytics.monthlyTrend[monthKey] || 0) + (entry.details?.amount || 0);
  });
  
  analytics.averagePayment = analytics.totalPaid / history.length;
  
  return analytics;
};

/* ======================================================
   EXPORTS
====================================================== */

export {
  SUBSCRIPTION_STATUS,
  GST_RATE,
  GRACE_PERIOD_DAYS,
  calculatePlanPrice,
  getPlanFromKey,
  getSubscriptionStatus as getSubscriptionStatusLegacy
};