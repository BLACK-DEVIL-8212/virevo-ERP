import { ref, get, update, set, runTransaction } from "firebase/database";
import { db } from "./firebase";

/* =========================
   CONSTANTS & DEFAULTS
========================= */

const DEFAULT_SETTINGS = {
  // Shop Information
  shopName: "",
  shopEmail: "",
  shopPhone: "",
  shopAddress: "",
  shopLogo: null,
  gstNumber: "",
  panNumber: "",
  
  // Business Settings
  currency: "INR",
  currencySymbol: "₹",
  timezone: "Asia/Kolkata",
  dateFormat: "DD/MM/YYYY",
  timeFormat: "12h",
  
  // Invoice Settings
  invoicePrefix: "INV",
  invoiceNumberStart: 1,
  invoiceFooter: "Thank you for your business!",
  invoiceTerms: "Goods once sold cannot be returned",
  showGSTOnInvoice: true,
  showHSNOnInvoice: true,
  
  // Tax Settings
  defaultGST: 18,
  enableGST: true,
  taxCalculationMethod: "inclusive", // inclusive or exclusive
  
  // Inventory Settings
  lowStockAlert: 5,
  enableStockTracking: true,
  autoReorderStock: false,
  reorderThreshold: 10,
  
  // Notification Settings
  emailNotifications: true,
  smsNotifications: false,
  lowStockEmailAlert: true,
  dailySalesReport: false,
  
  // Printer Settings
  autoPrintBill: false,
  printerType: "thermal", // thermal, laser, dotmatrix
  printCopyCount: 1,
  
  // Payment Settings
  acceptedPayments: ["cash", "upi", "card"],
  upiId: "",
  bankAccountName: "",
  bankAccountNumber: "",
  bankIfscCode: "",
  
  // Discount Settings
  maxDiscountPercent: 10,
  requireApprovalForDiscount: true,
  approvalRole: "manager",
  
  // Security Settings
  sessionTimeout: 30, // minutes
  maxLoginAttempts: 5,
  requireStrongPassword: true,
  twoFactorAuth: false,
  
  // Backup Settings
  autoBackup: false,
  backupFrequency: "daily", // daily, weekly, monthly
  backupRetentionDays: 30,
  
  // POS Settings
  enableCustomerSearch: true,
  enableIMEIScanning: true,
  enableBarcodeScanning: true,
  defaultPaymentMode: "cash",
  
  // Reports Settings
  defaultReportPeriod: "monthly",
  autoGenerateReports: false,
  reportEmailRecipients: [],
  
  // Integration Settings
  enableWhatsAppIntegration: false,
  whatsAppBusinessNumber: "",
  enableEmailIntegration: false,
  smtpSettings: null,
  
  createdAt: null,
  updatedAt: null,
  updatedBy: null
};

const VALID_CURRENCIES = {
  INR: { symbol: "₹", name: "Indian Rupee" },
  USD: { symbol: "$", name: "US Dollar" },
  EUR: { symbol: "€", name: "Euro" },
  GBP: { symbol: "£", name: "British Pound" },
  AED: { symbol: "د.إ", name: "UAE Dirham" }
};

const VALID_TIMEZONES = [
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "America/New_York",
  "Europe/London",
  "Australia/Sydney"
];

/* =========================
   VALIDATION FUNCTIONS
========================= */

const validateSettings = (settings) => {
  const errors = [];
  const warnings = [];

  // Shop information validation
  if (settings.shopEmail && !isValidEmail(settings.shopEmail)) {
    errors.push("Invalid shop email format");
  }

  if (settings.shopPhone && !isValidPhone(settings.shopPhone)) {
    errors.push("Invalid shop phone number");
  }

  if (settings.gstNumber && !isValidGST(settings.gstNumber)) {
    warnings.push("Invalid GST number format");
  }

  if (settings.panNumber && !isValidPAN(settings.panNumber)) {
    warnings.push("Invalid PAN number format");
  }

  // Tax validation
  if (settings.defaultGST && (settings.defaultGST < 0 || settings.defaultGST > 100)) {
    errors.push("Default GST must be between 0 and 100");
  }

  // Currency validation
  if (settings.currency && !VALID_CURRENCIES[settings.currency]) {
    errors.push(`Invalid currency. Must be one of: ${Object.keys(VALID_CURRENCIES).join(", ")}`);
  }

  // Timezone validation
  if (settings.timezone && !VALID_TIMEZONES.includes(settings.timezone)) {
    warnings.push(`Timezone ${settings.timezone} may not be supported`);
  }

  // Discount validation
  if (settings.maxDiscountPercent && (settings.maxDiscountPercent < 0 || settings.maxDiscountPercent > 100)) {
    errors.push("Maximum discount must be between 0 and 100");
  }

  // Invoice validation
  if (settings.invoicePrefix && !/^[A-Z0-9]{2,10}$/.test(settings.invoicePrefix)) {
    errors.push("Invoice prefix must be 2-10 alphanumeric characters");
  }

  // Payment validation
  if (settings.acceptedPayments && !Array.isArray(settings.acceptedPayments)) {
    errors.push("Accepted payments must be an array");
  }

  if (settings.upiId && !/^[\w.-]+@[\w.-]+$/.test(settings.upiId)) {
    errors.push("Invalid UPI ID format");
  }

  if (settings.bankAccountNumber && !/^\d{9,18}$/.test(settings.bankAccountNumber)) {
    errors.push("Invalid bank account number");
  }

  if (settings.bankIfscCode && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(settings.bankIfscCode)) {
    errors.push("Invalid IFSC code format");
  }

  // Security validation
  if (settings.sessionTimeout && (settings.sessionTimeout < 5 || settings.sessionTimeout > 480)) {
    errors.push("Session timeout must be between 5 and 480 minutes");
  }

  if (settings.maxLoginAttempts && (settings.maxLoginAttempts < 1 || settings.maxLoginAttempts > 10)) {
    errors.push("Max login attempts must be between 1 and 10");
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
};

const isValidEmail = (email) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

const isValidPhone = (phone) => {
  return /^[0-9]{10}$/.test(phone);
};

const isValidGST = (gst) => {
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gst);
};

const isValidPAN = (pan) => {
  return /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(pan);
};

/* =========================
   GET SHOP SETTINGS (ENHANCED)
========================= */

export const getShopSettings = async (shopId, mergeWithDefaults = true) => {
  if (!shopId) {
    console.warn("No shop ID provided for getShopSettings");
    return mergeWithDefaults ? { ...DEFAULT_SETTINGS } : null;
  }

  try {
    const shopRef = ref(db, `shops/${shopId}`);
    const snapshot = await get(shopRef);

    if (!snapshot.exists()) {
      return mergeWithDefaults ? { ...DEFAULT_SETTINGS } : null;
    }

    const shop = snapshot.val() || {};
    const info = shop.info || {};
    const infoSettings = info.settings || {};
    const rootSettings = shop.settings || {};

    let settings = {
      companyName: info.companyName || info.shopName || "",
      address: info.address || "",
      city: info.city || "",
      pincode: info.pincode || "",
      gstin: info.gstin || info.gstNumber || "",
      phone: info.phone || info.ownerPhone || "",
      shopEmail: info.email || info.ownerEmail || "",
      ...rootSettings,
      ...infoSettings
    };
    
    // Merge with defaults if requested
    if (mergeWithDefaults) {
      settings = { ...DEFAULT_SETTINGS, ...settings };
    }
    
    // Ensure updatedAt exists
    if (!settings.updatedAt) {
      settings.updatedAt = settings.createdAt || Date.now();
    }
    
    return settings;
  } catch (error) {
    console.error("Error fetching shop settings:", error);
    return mergeWithDefaults ? { ...DEFAULT_SETTINGS } : null;
  }
};

/* =========================
   SAVE / UPDATE SETTINGS (ENHANCED)
========================= */

export const saveShopSettings = async (shopId, data, userId = null) => {
  if (!shopId) throw new Error("Shop ID missing");
  if (!data || typeof data !== "object") throw new Error("Settings data required");

  // Validate settings
  const validation = validateSettings(data);
  if (!validation.isValid) {
    throw new Error(`Invalid settings: ${validation.errors.join(", ")}`);
  }

  // Log warnings but don't block saving
  if (validation.warnings.length > 0) {
    console.warn("Settings warnings:", validation.warnings);
  }

  const settingsRef = ref(db, `shops/${shopId}/info/settings`);
  const timestamp = Date.now();

  // Get current settings for comparison
  const currentSettings = await getShopSettings(shopId, false);
  
  // Prepare update data
  const updateData = {
    ...data,
    updatedAt: timestamp,
    updatedBy: userId || "system"
  };

  // Add createdAt if this is first time
  if (!currentSettings) {
    updateData.createdAt = timestamp;
    updateData.createdBy = userId || "system";
  }

  // Use transaction to prevent concurrent updates
  const result = await runTransaction(settingsRef, (current) => {
    if (current === null) {
      return updateData;
    }
    return { ...current, ...updateData };
  });

  if (!result.committed) {
    throw new Error("Failed to save settings due to concurrent update");
  }

  const infoUpdates = {};
  if (data.companyName !== undefined) infoUpdates.companyName = data.companyName;
  if (data.address !== undefined) infoUpdates.address = data.address;
  if (data.city !== undefined) infoUpdates.city = data.city;
  if (data.pincode !== undefined) infoUpdates.pincode = data.pincode;
  if (data.phone !== undefined) infoUpdates.phone = data.phone;
  if (data.gstin !== undefined) infoUpdates.gstin = data.gstin;
  if (Object.keys(infoUpdates).length > 0) {
    await update(ref(db, `shops/${shopId}/info`), {
      ...infoUpdates,
      updatedAt: timestamp,
      updatedBy: userId || "system"
    });
  }

  // Log settings change
  await logSettingsChange(shopId, userId, currentSettings, data);

  // Apply settings changes that need immediate effect
  await applySettingsChanges(shopId, data, currentSettings);

  return {
    success: true,
    updatedFields: Object.keys(data),
    timestamp,
    warnings: validation.warnings
  };
};

/* =========================
   UPDATE SPECIFIC SETTINGS
========================= */

export const updateShopSettings = async (shopId, updates, userId = null) => {
  if (!shopId) throw new Error("Shop ID missing");
  if (!updates || Object.keys(updates).length === 0) {
    throw new Error("No updates provided");
  }

  const currentSettings = await getShopSettings(shopId);
  const updatedSettings = { ...currentSettings, ...updates };
  
  return saveShopSettings(shopId, updatedSettings, userId);
};

/* =========================
   RESET SETTINGS TO DEFAULT
========================= */

export const resetShopSettings = async (shopId, userId = null) => {
  if (!shopId) throw new Error("Shop ID missing");

  const confirmation = await runTransaction(ref(db, `shops/${shopId}/info/settings`), () => {
    return {
      ...DEFAULT_SETTINGS,
      createdAt: Date.now(),
      createdBy: userId || "system",
      updatedAt: Date.now(),
      updatedBy: userId || "system",
      resetAt: Date.now(),
      resetBy: userId || "system"
    };
  });

  if (!confirmation.committed) {
    throw new Error("Failed to reset settings");
  }

  await logSettingsChange(shopId, userId, null, { action: "reset" });

  return { success: true, message: "Settings reset to default" };
};

/* =========================
   GET SPECIFIC SETTINGS
========================= */

export const getSetting = async (shopId, key, defaultValue = null) => {
  const settings = await getShopSettings(shopId);
  return settings[key] !== undefined ? settings[key] : defaultValue;
};

export const getSettingsByCategory = async (shopId, category) => {
  const settings = await getShopSettings(shopId);
  const categoryMap = {
    shop: ["shopName", "shopEmail", "shopPhone", "shopAddress", "shopLogo", "gstNumber", "panNumber"],
    business: ["currency", "currencySymbol", "timezone", "dateFormat", "timeFormat"],
    invoice: ["invoicePrefix", "invoiceNumberStart", "invoiceFooter", "invoiceTerms", "showGSTOnInvoice", "showHSNOnInvoice"],
    tax: ["defaultGST", "enableGST", "taxCalculationMethod"],
    inventory: ["lowStockAlert", "enableStockTracking", "autoReorderStock", "reorderThreshold"],
    notifications: ["emailNotifications", "smsNotifications", "lowStockEmailAlert", "dailySalesReport"],
    printer: ["autoPrintBill", "printerType", "printCopyCount"],
    payment: ["acceptedPayments", "upiId", "bankAccountName", "bankAccountNumber", "bankIfscCode"],
    discount: ["maxDiscountPercent", "requireApprovalForDiscount", "approvalRole"],
    security: ["sessionTimeout", "maxLoginAttempts", "requireStrongPassword", "twoFactorAuth"],
    backup: ["autoBackup", "backupFrequency", "backupRetentionDays"],
    pos: ["enableCustomerSearch", "enableIMEIScanning", "enableBarcodeScanning", "defaultPaymentMode"],
    reports: ["defaultReportPeriod", "autoGenerateReports", "reportEmailRecipients"],
    integration: ["enableWhatsAppIntegration", "whatsAppBusinessNumber", "enableEmailIntegration", "smtpSettings"]
  };

  const keys = categoryMap[category];
  if (!keys) return {};

  const result = {};
  keys.forEach(key => {
    result[key] = settings[key];
  });
  return result;
};

/* =========================
   VALIDATE SETTINGS SECTION
========================= */

export const validateSettingsSection = async (shopId, section) => {
  const settings = await getSettingsByCategory(shopId, section);
  const validation = validateSettings(settings);
  
  return {
    section,
    isValid: validation.isValid,
    errors: validation.errors,
    warnings: validation.warnings
  };
};

/* =========================
   APPLY SETTINGS CHANGES
========================= */

const applySettingsChanges = async (shopId, newSettings, oldSettings) => {
  const changes = [];
  
  // Check for changes that need immediate application
  if (oldSettings && newSettings.currency !== oldSettings.currency) {
    changes.push("currency");
    // Update currency symbol
    if (VALID_CURRENCIES[newSettings.currency]) {
      await updateCurrencySymbol(shopId, VALID_CURRENCIES[newSettings.currency].symbol);
    }
  }
  
  if (oldSettings && newSettings.timezone !== oldSettings.timezone) {
    changes.push("timezone");
    // Timezone change might affect date displays
    await updateTimezoneSetting(shopId, newSettings.timezone);
  }
  
  if (oldSettings && newSettings.invoicePrefix !== oldSettings.invoicePrefix) {
    changes.push("invoicePrefix");
    // Update invoice prefix for future bills
    await updateInvoicePrefix(shopId, newSettings.invoicePrefix);
  }
  
  if (changes.length > 0) {
    console.log(`Applied settings changes: ${changes.join(", ")}`);
  }
};

const updateCurrencySymbol = async (shopId, symbol) => {
  const settingsRef = ref(db, `shops/${shopId}/info/settings/currencySymbol`);
  await set(settingsRef, symbol);
};

const updateTimezoneSetting = async (shopId, timezone) => {
  // Update timezone for all date-related operations
  const settingsRef = ref(db, `shops/${shopId}/info/settings/timezone`);
  await set(settingsRef, timezone);
};

const updateInvoicePrefix = async (shopId, prefix) => {
  const settingsRef = ref(db, `shops/${shopId}/info/settings/invoicePrefix`);
  await set(settingsRef, prefix);
};

/* =========================
   LOG SETTINGS CHANGES
========================= */

const logSettingsChange = async (shopId, userId, oldSettings, newSettings) => {
  try {
    const logRef = ref(db, `shops/${shopId}/settingsLogs/${Date.now()}`);
    
    // Calculate what changed
    const changes = {};
    if (oldSettings) {
      Object.keys(newSettings).forEach(key => {
        if (oldSettings[key] !== newSettings[key]) {
          changes[key] = {
            from: oldSettings[key],
            to: newSettings[key]
          };
        }
      });
    }
    
    await set(logRef, {
      userId: userId || "system",
      timestamp: Date.now(),
      changes: Object.keys(changes).length > 0 ? changes : { action: newSettings.action || "update" },
      oldSettings: oldSettings ? sanitizeLogData(oldSettings) : null,
      newSettings: sanitizeLogData(newSettings)
    });
  } catch (error) {
    console.error("Failed to log settings change:", error);
  }
};

const sanitizeLogData = (data) => {
  // Remove sensitive data from logs
  const sensitive = ["bankAccountNumber", "bankIfscCode", "smtpSettings", "whatsAppBusinessNumber"];
  const sanitized = { ...data };
  sensitive.forEach(field => {
    if (sanitized[field]) {
      sanitized[field] = "[REDACTED]";
    }
  });
  return sanitized;
};

/* =========================
   GET SETTINGS HISTORY
========================= */

export const getSettingsHistory = async (shopId, limit = 50) => {
  const logsRef = ref(db, `shops/${shopId}/settingsLogs`);
  const snapshot = await get(logsRef);
  
  if (!snapshot.exists()) return [];
  
  const logs = [];
  snapshot.forEach((child) => {
    logs.push({
      id: child.key,
      ...child.val()
    });
  });
  
  return logs
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit);
};

/* =========================
   BACKUP & RESTORE SETTINGS
========================= */

export const backupSettings = async (shopId) => {
  const settings = await getShopSettings(shopId);
  const backup = {
    settings,
    exportedAt: Date.now(),
    version: "1.0",
    shopId
  };
  
  return backup;
};

export const restoreSettings = async (shopId, backup, userId = null) => {
  if (!backup || !backup.settings) {
    throw new Error("Invalid backup data");
  }
  
  return saveShopSettings(shopId, backup.settings, userId);
};

/* =========================
   EXPORT SETTINGS
========================= */

export const exportSettings = async (shopId, format = "json") => {
  const settings = await getShopSettings(shopId);
  
  if (format === "json") {
    return JSON.stringify(settings, null, 2);
  } else if (format === "csv") {
    // Convert to CSV format
    const headers = Object.keys(settings);
    const values = Object.values(settings);
    return `${headers.join(",")}\n${values.join(",")}`;
  }
  
  throw new Error(`Unsupported export format: ${format}`);
};

/* =========================
   IMPORT SETTINGS
========================= */

export const importSettings = async (shopId, settingsData, userId = null, format = "json") => {
  let settings;
  
  if (format === "json") {
    settings = typeof settingsData === "string" ? JSON.parse(settingsData) : settingsData;
  } else {
    throw new Error(`Unsupported import format: ${format}`);
  }
  
  // Validate before importing
  const validation = validateSettings(settings);
  if (!validation.isValid) {
    throw new Error(`Invalid settings data: ${validation.errors.join(", ")}`);
  }
  
  return saveShopSettings(shopId, settings, userId);
};

/* =========================
   BULK SETTINGS OPERATIONS
========================= */

export const bulkUpdateSettings = async (shopId, updatesArray, userId = null) => {
  const results = {
    success: [],
    failed: []
  };
  
  for (const update of updatesArray) {
    try {
      await updateShopSettings(shopId, update, userId);
      results.success.push(update);
    } catch (error) {
      results.failed.push({ update, error: error.message });
    }
  }
  
  return results;
};

/* =========================
   SETTINGS VALIDATION REPORT
========================= */

export const getSettingsValidationReport = async (shopId) => {
  const settings = await getShopSettings(shopId);
  const validation = validateSettings(settings);
  
  return {
    isValid: validation.isValid,
    errors: validation.errors,
    warnings: validation.warnings,
    criticalIssues: validation.errors.filter(e => 
      e.includes("required") || 
      e.includes("invalid") ||
      e.includes("must be")
    ),
    recommendations: generateRecommendations(settings)
  };
};

const generateRecommendations = (settings) => {
  const recommendations = [];
  
  if (!settings.gstNumber && settings.enableGST) {
    recommendations.push("Add GST number for tax compliance");
  }
  
  if (settings.maxDiscountPercent > 20) {
    recommendations.push("High discount limit may affect profitability");
  }
  
  if (!settings.autoBackup && settings.enableStockTracking) {
    recommendations.push("Enable auto backup to prevent data loss");
  }
  
  if (!settings.twoFactorAuth && settings.maxLoginAttempts < 3) {
    recommendations.push("Consider enabling 2FA for better security");
  }
  
  return recommendations;
};

/* =========================
   DEFAULT EXPORTS
========================= */

export { DEFAULT_SETTINGS, VALID_CURRENCIES, validateSettings };
