// src/utils/subscriptionUtils.js

import { getPlanDetails, getStatusInfo, getDaysUntilExpiry } from "../constants/subscriptionPlans";

// Validate subscription
export const validateSubscription = (userData) => {
  if (!userData) {
    return {
      isValid: false,
      reason: "No user data found",
      status: "error"
    };
  }
  
  const planId = userData.plan;
  const expiryDate = userData.planExpiry;
  
  if (!planId) {
    return {
      isValid: false,
      reason: "No active plan selected",
      status: "error",
      action: "choose_plan"
    };
  }
  
  const plan = getPlanDetails(planId);
  
  if (!plan) {
    return {
      isValid: false,
      reason: "Invalid plan selected",
      status: "error",
      action: "contact_support"
    };
  }
  
  if (!expiryDate) {
    return {
      isValid: false,
      reason: "No expiry date found",
      status: "error",
      action: "contact_support"
    };
  }
  
  const now = new Date();
  const expiry = new Date(expiryDate);
  const daysUntilExpiry = getDaysUntilExpiry(expiryDate);
  
  if (expiry < now) {
    return {
      isValid: false,
      reason: "Your subscription has expired",
      status: "expired",
      action: "renew",
      daysUntilExpiry
    };
  }
  
  if (daysUntilExpiry <= 7) {
    return {
      isValid: true,
      reason: `Your subscription will expire in ${daysUntilExpiry} days`,
      status: "warning",
      action: "renew",
      daysUntilExpiry,
      plan
    };
  }
  
  return {
    isValid: true,
    reason: "Subscription is active",
    status: "active",
    action: null,
    daysUntilExpiry,
    plan
  };
};

// Check feature access based on plan
export const hasFeatureAccess = (userPlan, feature) => {
  const plan = getPlanDetails(userPlan);
  
  if (!plan) return false;
  
  const featureMap = {
    // Basic features
    billing: ["BASIC", "PRO", "ENTERPRISE"],
    inventory: ["BASIC", "PRO", "ENTERPRISE"],
    basicReports: ["BASIC", "PRO", "ENTERPRISE"],
    
    // Pro features
    employeeManagement: ["PRO", "ENTERPRISE"],
    advancedReports: ["PRO", "ENTERPRISE"],
    gstReports: ["PRO", "ENTERPRISE"],
    profitLoss: ["PRO", "ENTERPRISE"],
    
    // Enterprise features
    multiStore: ["ENTERPRISE"],
    apiAccess: ["ENTERPRISE"],
    customIntegration: ["ENTERPRISE"],
    whiteLabel: ["ENTERPRISE"],
    prioritySupport: ["ENTERPRISE"]
  };
  
  const allowedPlans = featureMap[feature];
  return allowedPlans ? allowedPlans.includes(plan.basePlan || plan.id) : false;
};

// Get plan limits
export const getPlanLimits = (planId) => {
  const limits = {
    BASIC: {
      maxProducts: 500,
      maxStaff: 3,
      maxStores: 1,
      maxCustomers: 1000,
      maxBillsPerMonth: 1000,
      storageGB: 1,
      supportLevel: "email"
    },
    PRO: {
      maxProducts: "unlimited",
      maxStaff: 10,
      maxStores: 1,
      maxCustomers: "unlimited",
      maxBillsPerMonth: 5000,
      storageGB: 5,
      supportLevel: "priority"
    },
    ENTERPRISE: {
      maxProducts: "unlimited",
      maxStaff: "unlimited",
      maxStores: "unlimited",
      maxCustomers: "unlimited",
      maxBillsPerMonth: "unlimited",
      storageGB: 20,
      supportLevel: "dedicated"
    }
  };
  
  const basePlan = planId?.includes("YEARLY") ? planId.replace("_YEARLY", "") : planId;
  return limits[basePlan] || limits.BASIC;
};

// Check if usage is within limits
export const checkUsageLimit = (userPlan, resource, currentUsage) => {
  const limits = getPlanLimits(userPlan);
  const limit = limits[resource];
  
  if (limit === "unlimited") return { isAllowed: true, remaining: "unlimited" };
  
  const remaining = limit - currentUsage;
  const isAllowed = remaining >= 0;
  
  return {
    isAllowed,
    remaining: Math.max(0, remaining),
    limit,
    currentUsage,
    percentageUsed: (currentUsage / limit) * 100
  };
};

// Generate invoice for subscription
export const generateInvoice = (user, plan, paymentDetails) => {
  const invoiceNumber = `INV-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
  
  const subtotal = plan.price;
  const gst = subtotal * 0.18;
  const total = subtotal + gst;
  
  return {
    invoiceNumber,
    date: new Date().toISOString(),
    customer: {
      name: user.name,
      email: user.email,
      shopId: user.shopId
    },
    plan: {
      id: plan.id,
      name: plan.name,
      duration: plan.duration,
      price: plan.price
    },
    billing: {
      subtotal,
      gst,
      total
    },
    payment: paymentDetails,
    status: "paid"
  };
};

// Send subscription reminder
export const shouldSendReminder = (expiryDate, lastReminderSent) => {
  if (!expiryDate) return false;
  
  const daysUntilExpiry = getDaysUntilExpiry(expiryDate);
  const reminderDays = [30, 15, 7, 3, 1];
  
  if (!reminderDays.includes(daysUntilExpiry)) return false;
  
  if (lastReminderSent) {
    const lastReminderDate = new Date(lastReminderSent);
    const today = new Date();
    const daysSinceLastReminder = Math.floor((today - lastReminderDate) / (1000 * 60 * 60 * 24));
    
    // Don't send reminder if sent in last 24 hours
    if (daysSinceLastReminder < 1) return false;
  }
  
  return true;
};

// Auto-renew subscription check
export const shouldAutoRenew = (user, paymentMethod) => {
  if (!user.autoRenew) return false;
  if (!paymentMethod || paymentMethod.status !== "active") return false;
  
  const expiryDate = user.planExpiry;
  if (!expiryDate) return false;
  
  const daysUntilExpiry = getDaysUntilExpiry(expiryDate);
  
  // Auto-renew 3 days before expiry
  return daysUntilExpiry <= 3;
};