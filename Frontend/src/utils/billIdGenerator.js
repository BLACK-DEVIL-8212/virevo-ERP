/**
 * Generate a unique Bill ID
 * Format: BILL-YYYYMMDD-HHMMSS-XXXX
 * Example: BILL-20260218-143512-8392
 * 
 * Enhanced features:
 * - Counter-based sequential IDs
 * - Shop-specific prefixes
 * - Timestamp with milliseconds
 * - Hash-based uniqueness
 * - Database collision detection
 */

// In-memory counter for sequential IDs (resets daily)
let dailyCounter = 0;
let lastDate = null;

// Cache for recently generated IDs to prevent collisions
const recentIds = new Set();
const MAX_CACHE_SIZE = 1000;

/**
 * Reset daily counter
 */
const resetDailyCounter = () => {
  const now = new Date();
  const today = now.toDateString();
  
  if (lastDate !== today) {
    dailyCounter = 0;
    lastDate = today;
  }
};

/**
 * Generate random suffix with better distribution
 */
const generateRandomSuffix = (length = 4) => {
  const min = Math.pow(10, length - 1);
  const max = Math.pow(10, length) - 1;
  return Math.floor(min + Math.random() * (max - min + 1)).toString();
};

/**
 * Generate hash-based suffix from timestamp
 */
const generateHashSuffix = (timestamp) => {
  const hash = (timestamp * 2654435761) & 0xFFFFFFFF; // Knuth's multiplicative hash
  return (hash % 10000).toString().padStart(4, '0');
};

/**
 * Generate sequential counter suffix
 */
const generateSequentialSuffix = () => {
  resetDailyCounter();
  dailyCounter++;
  return dailyCounter.toString().padStart(4, '0');
};

/**
 * Check for collisions with recent IDs
 */
const isUniqueId = (billId) => {
  if (recentIds.has(billId)) {
    return false;
  }
  
  // Add to cache and maintain size
  recentIds.add(billId);
  if (recentIds.size > MAX_CACHE_SIZE) {
    const iterator = recentIds.values();
    for (let i = 0; i < MAX_CACHE_SIZE / 2; i++) {
      recentIds.delete(iterator.next().value);
    }
  }
  
  return true;
};

/**
 * Generate bill ID with retry for uniqueness
 */
const generateUniqueId = (generator, maxRetries = 3) => {
  for (let i = 0; i < maxRetries; i++) {
    const billId = generator();
    if (isUniqueId(billId)) {
      return billId;
    }
  }
  // Fallback with timestamp + random + counter
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Basic bill ID generator (original functionality)
 */
export const generateBillId = (options = {}) => {
  const now = new Date();
  
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  
  // Use milliseconds for better precision
  const milliseconds = String(now.getMilliseconds()).padStart(3, "0");
  
  // Generate suffix based on options
  let suffix;
  if (options.sequential) {
    suffix = generateSequentialSuffix();
  } else if (options.hash) {
    suffix = generateHashSuffix(now.getTime());
  } else {
    suffix = generateRandomSuffix(4);
  }
  
  let billId = `BILL-${year}${month}${day}-${hours}${minutes}${seconds}`;
  
  if (options.includeMs) {
    billId += `-${milliseconds}`;
  }
  
  billId += `-${suffix}`;
  
  // Add shop prefix if provided
  if (options.shopPrefix) {
    billId = `${options.shopPrefix}-${billId}`;
  }
  
  // Add counter for same millisecond
  if (options.counter !== undefined) {
    billId += `-${String(options.counter).padStart(2, '0')}`;
  }
  
  return billId;
};

/**
 * Generate bill ID with uniqueness guarantee
 */
export const generateUniqueBillId = async (shopId, db, options = {}) => {
  const generateId = () => generateBillId(options);
  let billId = generateUniqueId(generateId);
  
  // If database reference provided, check against existing bills
  if (db && shopId) {
    const { ref, get } = await import("firebase/database");
    let isUnique = false;
    let retries = 0;
    const maxRetries = 5;
    
    while (!isUnique && retries < maxRetries) {
      const billRef = ref(db, `shops/${shopId}/bills`);
      const query = ref(db, `shops/${shopId}/bills`);
      const snapshot = await get(query);
      
      let exists = false;
      if (snapshot.exists()) {
        snapshot.forEach((child) => {
          if (child.val().billId === billId) {
            exists = true;
          }
        });
      }
      
      if (!exists) {
        isUnique = true;
      } else {
        // Regenerate with different options
        retries++;
        billId = generateBillId({ 
          ...options, 
          sequential: retries > 2,
          hash: retries > 1 
        });
      }
    }
    
    if (!isUnique) {
      // Ultimate fallback with timestamp + random + counter
      billId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${retries}`;
    }
  }
  
  return billId;
};

/**
 * Generate bill ID with sequential numbering per day
 */
export const generateSequentialBillId = (options = {}) => {
  return generateBillId({ ...options, sequential: true });
};

/**
 * Generate bill ID with hash-based suffix
 */
export const generateHashBillId = (options = {}) => {
  return generateBillId({ ...options, hash: true });
};

/**
 * Parse bill ID to extract information
 */
export const parseBillId = (billId) => {
  const parts = billId.split('-');
  
  if (parts.length < 4) {
    return null;
  }
  
  let shopPrefix = null;
  let startIndex = 0;
  
  // Check if first part is a shop prefix
  if (parts[0] !== 'BILL') {
    shopPrefix = parts[0];
    startIndex = 1;
  }
  
  const type = parts[startIndex];
  const datePart = parts[startIndex + 1];
  const timePart = parts[startIndex + 2];
  const suffix = parts[startIndex + 3];
  
  // Parse date
  const year = parseInt(datePart.substring(0, 4));
  const month = parseInt(datePart.substring(4, 6));
  const day = parseInt(datePart.substring(6, 8));
  
  // Parse time
  const hours = parseInt(timePart.substring(0, 2));
  const minutes = parseInt(timePart.substring(2, 4));
  const seconds = parseInt(timePart.substring(4, 6));
  
  const timestamp = new Date(year, month - 1, day, hours, minutes, seconds).getTime();
  
  return {
    original: billId,
    shopPrefix,
    type,
    date: {
      year,
      month,
      day,
      timestamp
    },
    time: {
      hours,
      minutes,
      seconds
    },
    suffix,
    isSequential: suffix.length === 4 && !isNaN(parseInt(suffix)) && parseInt(suffix) < 10000
  };
};

/**
 * Validate bill ID format
 */
export const validateBillId = (billId, options = {}) => {
  if (!billId || typeof billId !== 'string') {
    return { valid: false, error: "Bill ID is required" };
  }
  
  // Basic pattern: optional prefix + BILL + date + time + suffix
  const patterns = [
    /^[A-Z0-9]+-BILL-\d{8}-\d{6}-\d{4}$/, // With shop prefix
    /^BILL-\d{8}-\d{6}-\d{4}$/,           // Without shop prefix
    /^BILL-\d{8}-\d{6}-\d{3}-\d{4}$/,     // With milliseconds
    /^[A-Z0-9]+-BILL-\d{8}-\d{6}-\d{4}-\d{2}$/ // With counter
  ];
  
  let valid = false;
  for (const pattern of patterns) {
    if (pattern.test(billId)) {
      valid = true;
      break;
    }
  }
  
  if (!valid) {
    return { valid: false, error: "Invalid bill ID format" };
  }
  
  // Parse and validate date
  const parsed = parseBillId(billId);
  if (parsed && parsed.date.timestamp) {
    const billDate = new Date(parsed.date.timestamp);
    if (isNaN(billDate.getTime())) {
      return { valid: false, error: "Invalid date in bill ID" };
    }
    
    // Check if date is not in future
    if (billDate > new Date()) {
      return { valid: false, error: "Bill ID has future date" };
    }
    
    // Check if date is not too old (e.g., more than 10 years)
    const tenYearsAgo = new Date();
    tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
    if (billDate < tenYearsAgo) {
      return { valid: false, error: "Bill ID date is too old" };
    }
  }
  
  return { valid: true };
};

/**
 * Get bill ID statistics for a shop
 */
export const getBillIdStats = async (shopId, db) => {
  const { ref, get } = await import("firebase/database");
  const billsRef = ref(db, `shops/${shopId}/bills`);
  const snapshot = await get(billsRef);
  
  if (!snapshot.exists()) {
    return {
      total: 0,
      byDate: {},
      byHour: {},
      sequential: 0,
      random: 0
    };
  }
  
  const stats = {
    total: 0,
    byDate: {},
    byHour: {},
    sequential: 0,
    random: 0,
    lastBillId: null,
    lastBillTimestamp: null
  };
  
  snapshot.forEach((child) => {
    const bill = child.val();
    if (bill.billId) {
      stats.total++;
      
      const parsed = parseBillId(bill.billId);
      if (parsed) {
        const dateKey = `${parsed.date.year}-${parsed.date.month}-${parsed.date.day}`;
        stats.byDate[dateKey] = (stats.byDate[dateKey] || 0) + 1;
        
        const hourKey = `${parsed.date.year}-${parsed.date.month}-${parsed.date.day} ${parsed.time.hours}:00`;
        stats.byHour[hourKey] = (stats.byHour[hourKey] || 0) + 1;
        
        if (parsed.isSequential) {
          stats.sequential++;
        } else {
          stats.random++;
        }
        
        if (!stats.lastBillTimestamp || bill.createdAt > stats.lastBillTimestamp) {
          stats.lastBillId = bill.billId;
          stats.lastBillTimestamp = bill.createdAt;
        }
      }
    }
  });
  
  return stats;
};

/**
 * Batch generate multiple bill IDs
 */
export const generateBatchBillIds = (count, options = {}) => {
  const billIds = [];
  const baseTime = Date.now();
  
  for (let i = 0; i < count; i++) {
    // Offset each bill by 1ms to ensure uniqueness
    const mockNow = new Date(baseTime + i);
    const originalDateNow = Date.now;
    
    // Mock Date.now for this iteration
    Date.now = () => baseTime + i;
    
    const billId = generateBillId({ 
      ...options, 
      counter: i,
      sequential: options.sequential || i > 0 
    });
    
    billIds.push(billId);
    
    // Restore Date.now
    Date.now = originalDateNow;
  }
  
  return billIds;
};

/**
 * Convert bill ID to QR code friendly format
 */
export const toQRFormat = (billId) => {
  // Remove hyphens for QR code
  return billId.replace(/-/g, '');
};

/**
 * Convert from QR format back to bill ID
 */
export const fromQRFormat = (qrCode, options = {}) => {
  if (!qrCode || qrCode.length < 20) {
    return null;
  }
  
  // Try to reconstruct bill ID
  if (qrCode.startsWith('BILL')) {
    // Format: BILLYYYYMMDDHHMMSSXXXX
    const year = qrCode.substring(4, 8);
    const month = qrCode.substring(8, 10);
    const day = qrCode.substring(10, 12);
    const hours = qrCode.substring(12, 14);
    const minutes = qrCode.substring(14, 16);
    const seconds = qrCode.substring(16, 18);
    const suffix = qrCode.substring(18, 22);
    
    return `BILL-${year}${month}${day}-${hours}${minutes}${seconds}-${suffix}`;
  }
  
  return qrCode;
};

// Export all utilities
export default {
  generateBillId,
  generateUniqueBillId,
  generateSequentialBillId,
  generateHashBillId,
  parseBillId,
  validateBillId,
  getBillIdStats,
  generateBatchBillIds,
  toQRFormat,
  fromQRFormat
};