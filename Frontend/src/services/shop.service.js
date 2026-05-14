import { ref, set, get, push, update, remove, query, orderByChild, equalTo } from "firebase/database";
import { db } from "./firebase";

/* ======================================================
   CONSTANTS & DEFAULTS
====================================================== */

const SUBSCRIPTION_PLANS = {
  trial: {
    name: "Trial",
    duration: 7, // days
    features: ["basic_pos", "inventory", "reports"],
    price: 0,
    maxEmployees: 3,
    maxProducts: 100,
    storageLimit: 100 // MB
  },
  basic: {
    name: "Basic",
    duration: 30,
    features: ["basic_pos", "inventory", "reports", "customer_management"],
    price: 499,
    maxEmployees: 5,
    maxProducts: 500,
    storageLimit: 500
  },
  professional: {
    name: "Professional",
    duration: 30,
    features: ["basic_pos", "inventory", "reports", "customer_management", "accounting", "api_access"],
    price: 999,
    maxEmployees: 15,
    maxProducts: 2000,
    storageLimit: 2000
  },
  enterprise: {
    name: "Enterprise",
    duration: 30,
    features: ["basic_pos", "inventory", "reports", "customer_management", "accounting", "api_access", "multi_branch", "custom_integration"],
    price: 2499,
    maxEmployees: -1, // unlimited
    maxProducts: -1, // unlimited
    storageLimit: 10000
  }
};

const DEFAULT_SHOP_SETTINGS = {
  currency: "INR",
  timezone: "Asia/Kolkata",
  invoicePrefix: "INV",
  lowStockAlert: 5,
  enableCustomerEmail: false,
  enableCustomerSMS: false,
  autoBackup: false,
  backupFrequency: "daily"
};

const pickFirstText = (...values) => {
  const value = values.find(
    (item) => typeof item === "string" && item.trim().length > 0
  );

  return value ? value.trim() : "";
};

export const getShopDisplayName = (shopData = {}, fallback = "Unnamed Shop") => {
  const info = shopData.info || {};
  const nestedSettings = info.settings || {};
  const rootSettings = shopData.settings || {};

  return pickFirstText(
    nestedSettings.companyName,
    nestedSettings.shopName,
    info.companyName,
    info.shopName,
    rootSettings.companyName,
    rootSettings.shopName,
    shopData.companyName,
    shopData.shopName,
    fallback
  );
};

export const normalizeShopRecord = (shopId, shopData = {}) => {
  const info = shopData.info || {};
  const nestedSettings = info.settings || {};
  const rootSettings = shopData.settings || {};
  const subscription = info.subscription || shopData.subscription || {};

  return {
    id: shopId,
    name: getShopDisplayName(shopData, shopId),
    ownerEmail: pickFirstText(info.ownerEmail, info.email, rootSettings.shopEmail),
    ownerName: pickFirstText(info.ownerName, rootSettings.ownerName),
    phone: pickFirstText(info.ownerPhone, info.phone, rootSettings.shopPhone),
    status: info.status || shopData.status || "active",
    subscription,
    createdAt: info.createdAt || shopData.createdAt,
    updatedAt: info.updatedAt || shopData.updatedAt,
    settings: { ...rootSettings, ...nestedSettings },
    statistics: shopData.statistics || {}
  };
};

export const getShopOptionLabel = (shop) => {
  if (!shop?.id) return "Unknown Shop";
  const name = pickFirstText(shop.name, shop.companyName, "Unnamed Shop");
  return `${name} (${shop.id})`;
};

/* ======================================================
   VALIDATION FUNCTIONS
====================================================== */

const validateShopData = (data) => {
  const errors = [];

  if (!data.companyName || data.companyName.trim().length < 2) {
    errors.push("Company name must be at least 2 characters");
  }

  if (data.ownerEmail && !isValidEmail(data.ownerEmail)) {
    errors.push("Invalid owner email format");
  }

  if (data.gstNumber && !isValidGST(data.gstNumber)) {
    errors.push("Invalid GST number format");
  }

  if (data.phone && !isValidPhone(data.phone)) {
    errors.push("Invalid phone number");
  }

  if (data.panNumber && !isValidPAN(data.panNumber)) {
    errors.push("Invalid PAN number format");
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const isValidPhone = (phone) => /^[0-9]{10}$/.test(phone);
const isValidGST = (gst) => /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gst);
const isValidPAN = (pan) => /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(pan);

/* ======================================================
   CREATE SHOP (ENHANCED)
====================================================== */

export const createShop = async ({
  companyName,
  ownerEmail,
  ownerName,
  ownerPhone,
  gstNumber = "",
  panNumber = "",
  address = "",
  city = "",
  state = "",
  pincode = "",
  ownerUid
}) => {
  if (!ownerUid) throw new Error("Invalid user");
  if (!companyName) throw new Error("Company name required");

  // Validate shop data
  const validation = validateShopData({ companyName, ownerEmail, gstNumber, panNumber, phone: ownerPhone });
  if (!validation.isValid) {
    throw new Error(`Invalid shop data: ${validation.errors.join(", ")}`);
  }

  // Check if user already has a shop
  const userSnap = await get(ref(db, `users/${ownerUid}`));
  if (userSnap.exists() && userSnap.val().shopId) {
    throw new Error("User already linked to a shop");
  }

  // Check if email already registered
  const emailQuery = query(ref(db, "shops"), orderByChild("info/ownerEmail"), equalTo(ownerEmail));
  const emailSnap = await get(emailQuery);
  if (emailSnap.exists()) {
    throw new Error("Email already registered with another shop");
  }

  const shopRef = push(ref(db, "shops"));
  const shopId = shopRef.key;
  const now = Date.now();

  const shopData = {
    info: {
      companyName: companyName.trim(),
      ownerEmail: ownerEmail?.toLowerCase(),
      ownerName: ownerName || "",
      ownerPhone: ownerPhone || "",
      gstNumber: gstNumber || "",
      panNumber: panNumber || "",
      address: address || "",
      city: city || "",
      state: state || "",
      pincode: pincode || "",
      createdAt: now,
      createdBy: ownerUid,
      updatedAt: now,
      status: "active",
      subscription: {
        plan: "trial",
        startDate: now,
        expiryDate: now + SUBSCRIPTION_PLANS.trial.duration * 24 * 60 * 60 * 1000,
        status: "active",
        autoRenew: false
      },
      settings: { ...DEFAULT_SHOP_SETTINGS }
    },
    employees: {},
    products: {},
    bills: {},
    buyers: {},
    accounting: {
      ledgers: {},
      journals: {}
    },
    statistics: {
      totalSales: 0,
      totalCustomers: 0,
      totalProducts: 0,
      totalEmployees: 1,
      lastUpdated: now
    }
  };

  // Create shop
  await set(ref(db, `shops/${shopId}`), shopData);

  // Update user
  await update(ref(db, `users/${ownerUid}`), {
    shopId,
    role: "admin",
    email: ownerEmail?.toLowerCase(),
    name: ownerName,
    phone: ownerPhone,
    updatedAt: now
  });

  // Create audit log
  await logShopAction(shopId, ownerUid, "create", {
    companyName,
    shopId
  });

  // Create welcome notification
  await createWelcomeNotification(shopId, ownerUid);

  return {
    shopId,
    companyName,
    subscription: shopData.info.subscription
  };
};

/* ======================================================
   FETCH ALL SHOPS (ENHANCED)
====================================================== */

export const fetchAllShops = async (filters = {}) => {
  const snap = await get(ref(db, "shops"));

  if (!snap.exists()) return [];

  let shops = [];

  snap.forEach((child) => {
    shops.push(normalizeShopRecord(child.key, child.val()));
  });

  // Apply filters
  if (filters.status) {
    shops = shops.filter(shop => shop.status === filters.status);
  }

  if (filters.subscriptionPlan) {
    shops = shops.filter(shop => shop.subscription?.plan === filters.subscriptionPlan);
  }

  if (filters.search) {
    const searchLower = filters.search.toLowerCase();
    shops = shops.filter(shop => 
      shop.name.toLowerCase().includes(searchLower) ||
      shop.ownerEmail.toLowerCase().includes(searchLower) ||
      shop.ownerName.toLowerCase().includes(searchLower) ||
      shop.id.toLowerCase().includes(searchLower)
    );
  }

  // Sort shops
  shops.sort((a, b) => {
    if (filters.sortBy === "name") {
      return a.name.localeCompare(b.name);
    }
    return (b.createdAt || 0) - (a.createdAt || 0);
  });

  return shops;
};

/* ======================================================
   GET SHOP INFO (ENHANCED)
====================================================== */

export const getShopInfo = async (shopId, includeStatistics = false) => {
  if (!shopId) return null;

  const snap = await get(ref(db, `shops/${shopId}`));
  if (!snap.exists()) return null;

  const shop = snap.val();
  const info = shop.info || {};

  const result = {
    ...info,
    id: shopId,
    settings: info.settings || DEFAULT_SHOP_SETTINGS
  };

  if (includeStatistics) {
    result.statistics = await getShopStatistics(shopId);
  }

  return result;
};

/* ======================================================
   UPDATE SHOP INFO (ENHANCED)
====================================================== */

export const updateShopInfo = async (shopId, data, currentUser) => {
  if (!shopId) throw new Error("Invalid shop");
  if (!currentUser) throw new Error("Unauthorized");

  if (!["admin", "superadmin"].includes(currentUser.role)) {
    throw new Error("Permission denied. Only admin or superadmin can update shop info");
  }

  // Validate update data
  const validation = validateShopData(data);
  if (!validation.isValid) {
    throw new Error(`Invalid update data: ${validation.errors.join(", ")}`);
  }

  const updateData = {
    ...data,
    updatedAt: Date.now(),
    updatedBy: currentUser.uid
  };

  await update(ref(db, `shops/${shopId}/info`), updateData);

  // Log action
  await logShopAction(shopId, currentUser.uid, "update", Object.keys(data));

  return {
    success: true,
    updatedFields: Object.keys(data)
  };
};

/* ======================================================
   DELETE SHOP (SOFT DELETE)
====================================================== */

export const deleteShop = async (shopId, userId, permanent = false) => {
  if (!shopId) throw new Error("Invalid shop");
  if (!userId) throw new Error("User ID required");

  if (permanent) {
    // Check if user has permission (superadmin only)
    const userSnap = await get(ref(db, `users/${userId}`));
    if (userSnap.val()?.role !== "superadmin") {
      throw new Error("Only superadmin can permanently delete shops");
    }

    // Permanent deletion
    await remove(ref(db, `shops/${shopId}`));
    
    // Remove shop reference from users
    const usersQuery = query(ref(db, "users"), orderByChild("shopId"), equalTo(shopId));
    const usersSnap = await get(usersQuery);
    usersSnap.forEach((child) => {
      update(ref(db, `users/${child.key}`), { shopId: null, role: null });
    });
  } else {
    // Soft delete - mark as inactive
    await update(ref(db, `shops/${shopId}/info`), {
      status: "deleted",
      deletedAt: Date.now(),
      deletedBy: userId
    });
  }

  await logShopAction(shopId, userId, permanent ? "permanent_delete" : "soft_delete");

  return { success: true };
};

/* ======================================================
   SUBSCRIPTION MANAGEMENT
====================================================== */

export const updateSubscription = async (shopId, plan, userId, autoRenew = false) => {
  if (!SUBSCRIPTION_PLANS[plan]) {
    throw new Error(`Invalid plan. Available: ${Object.keys(SUBSCRIPTION_PLANS).join(", ")}`);
  }

  const now = Date.now();
  const planDetails = SUBSCRIPTION_PLANS[plan];
  const expiryDate = now + planDetails.duration * 24 * 60 * 60 * 1000;

  const updateData = {
    plan,
    startDate: now,
    expiryDate,
    status: "active",
    autoRenew,
    updatedAt: now,
    updatedBy: userId
  };

  await update(ref(db, `shops/${shopId}/info/subscription`), updateData);

  // Create invoice for subscription
  await createSubscriptionInvoice(shopId, plan, planDetails.price);

  await logShopAction(shopId, userId, "subscription_update", { plan, autoRenew });

  return updateData;
};

export const checkSubscriptionStatus = async (shopId) => {
  const shop = await getShopInfo(shopId);
  if (!shop || !shop.subscription) return { isValid: false, reason: "No subscription found" };

  const { subscription } = shop;
  const now = Date.now();

  if (subscription.status !== "active") {
    return { isValid: false, reason: `Subscription ${subscription.status}` };
  }

  if (now > subscription.expiryDate) {
    if (subscription.autoRenew) {
      // Auto-renew subscription
      await updateSubscription(shopId, subscription.plan, "system", true);
      return { isValid: true, renewed: true };
    }
    return { isValid: false, reason: "Subscription expired" };
  }

  const daysLeft = Math.ceil((subscription.expiryDate - now) / (24 * 60 * 60 * 1000));
  return { isValid: true, daysLeft, plan: subscription.plan };
};

/* ======================================================
   SHOP STATISTICS
====================================================== */

export const getShopStatistics = async (shopId) => {
  const shopRef = ref(db, `shops/${shopId}`);
  const snap = await get(shopRef);
  
  if (!snap.exists()) return null;
  
  const shop = snap.val();
  
  const statistics = {
    totalSales: 0,
    totalCustomers: 0,
    totalProducts: 0,
    totalEmployees: 0,
    totalBills: 0,
    todaySales: 0,
    monthlySales: 0,
    yearlySales: 0,
    ...shop.statistics
  };
  
  // Calculate today's sales
  const today = new Date().toDateString();
  const billsSnap = await get(ref(db, `shops/${shopId}/bills`));
  if (billsSnap.exists()) {
    let todayTotal = 0;
    let monthlyTotal = 0;
    let yearlyTotal = 0;
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    billsSnap.forEach((child) => {
      const bill = child.val();
      const billDate = new Date(bill.createdAt);
      
      if (billDate.toDateString() === today) {
        todayTotal += bill.totalAmount || 0;
      }
      
      if (billDate.getMonth() === currentMonth && billDate.getFullYear() === currentYear) {
        monthlyTotal += bill.totalAmount || 0;
      }
      
      if (billDate.getFullYear() === currentYear) {
        yearlyTotal += bill.totalAmount || 0;
      }
    });
    
    statistics.todaySales = todayTotal;
    statistics.monthlySales = monthlyTotal;
    statistics.yearlySales = yearlyTotal;
    statistics.totalBills = billsSnap.size;
  }
  
  // Update counts
  const productsSnap = await get(ref(db, `shops/${shopId}/products`));
  statistics.totalProducts = productsSnap.exists() ? productsSnap.size : 0;
  
  const employeesSnap = await get(ref(db, `shops/${shopId}/employees`));
  statistics.totalEmployees = employeesSnap.exists() ? employeesSnap.size : 0;
  
  const buyersSnap = await get(ref(db, `shops/${shopId}/buyers`));
  statistics.totalCustomers = buyersSnap.exists() ? buyersSnap.size : 0;
  
  // Update statistics in database
  await update(ref(db, `shops/${shopId}/statistics`), {
    ...statistics,
    lastUpdated: Date.now()
  });
  
  return statistics;
};

/* ======================================================
   SHOP PERFORMANCE METRICS
====================================================== */

export const getShopPerformance = async (shopId, period = "month") => {
  const billsSnap = await get(ref(db, `shops/${shopId}/bills`));
  if (!billsSnap.exists()) return null;
  
  const now = Date.now();
  const periodMs = period === "month" ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
  const startDate = now - periodMs;
  
  let totalRevenue = 0;
  let totalProfit = 0;
  let totalTransactions = 0;
  const dailyData = {};
  
  billsSnap.forEach((child) => {
    const bill = child.val();
    if (bill.createdAt >= startDate) {
      totalRevenue += bill.totalAmount || 0;
      totalProfit += bill.totalProfit || 0;
      totalTransactions++;
      
      const date = new Date(bill.createdAt).toDateString();
      if (!dailyData[date]) {
        dailyData[date] = { revenue: 0, profit: 0, count: 0 };
      }
      dailyData[date].revenue += bill.totalAmount || 0;
      dailyData[date].profit += bill.totalProfit || 0;
      dailyData[date].count++;
    }
  });
  
  return {
    period,
    totalRevenue,
    totalProfit,
    totalTransactions,
    averageTransactionValue: totalTransactions > 0 ? totalRevenue / totalTransactions : 0,
    profitMargin: totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0,
    dailyBreakdown: Object.entries(dailyData).map(([date, data]) => ({ date, ...data })),
    timestamp: now
  };
};

/* ======================================================
   HELPER FUNCTIONS
====================================================== */

const createWelcomeNotification = async (shopId, userId) => {
  const notificationRef = push(ref(db, `shops/${shopId}/notifications`));
  await set(notificationRef, {
    title: "Welcome to Virevo! 🎉",
    message: "Your shop has been successfully created. Start by adding products and staff members.",
    type: "success",
    read: false,
    createdAt: Date.now(),
    userId
  });
};

const createSubscriptionInvoice = async (shopId, plan, amount) => {
  const invoiceRef = push(ref(db, `shops/${shopId}/invoices`));
  await set(invoiceRef, {
    type: "subscription",
    plan,
    amount,
    status: "paid",
    createdAt: Date.now(),
    dueDate: Date.now() + 7 * 24 * 60 * 60 * 1000
  });
};

const logShopAction = async (shopId, userId, action, details = {}) => {
  try {
    const logRef = push(ref(db, `shops/${shopId}/logs`));
    await set(logRef, {
      action,
      userId,
      details,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error("Failed to log shop action:", error);
  }
};

/* ======================================================
   SHOP ANALYTICS
====================================================== */

export const getShopAnalytics = async (shopId, startDate, endDate) => {
  const billsSnap = await get(ref(db, `shops/${shopId}/bills`));
  if (!billsSnap.exists()) return null;
  
  const start = startDate ? new Date(startDate).getTime() : Date.now() - 30 * 24 * 60 * 60 * 1000;
  const end = endDate ? new Date(endDate).getTime() : Date.now();
  
  let totalRevenue = 0;
  let totalProfit = 0;
  let totalDiscount = 0;
  let totalTax = 0;
  const paymentMethods = {
    cash: 0,
    upi: 0,
    card: 0
  };
  
  billsSnap.forEach((child) => {
    const bill = child.val();
    if (bill.createdAt >= start && bill.createdAt <= end) {
      totalRevenue += bill.totalAmount || 0;
      totalProfit += bill.totalProfit || 0;
      totalDiscount += bill.discount || 0;
      totalTax += bill.gstTotal || 0;
      
      if (bill.paymentMode && paymentMethods[bill.paymentMode] !== undefined) {
        paymentMethods[bill.paymentMode] += bill.totalAmount || 0;
      }
    }
  });
  
  return {
    period: { start, end },
    totalRevenue,
    totalProfit,
    totalDiscount,
    totalTax,
    paymentMethods,
    profitMargin: totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0,
    averageDailyRevenue: totalRevenue / 30 // Approximate
  };
};

/* ======================================================
   EXPORT FUNCTIONS
====================================================== */

export {
  SUBSCRIPTION_PLANS,
  DEFAULT_SHOP_SETTINGS,
  validateShopData
};
