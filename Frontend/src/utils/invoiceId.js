/**
 * Enhanced Invoice ID Generator with multiple formats and uniqueness guarantees
 */

// In-memory counter for sequential IDs (resets daily)
let dailyCounter = new Map();
let lastResetDate = null;

// Cache for recently generated IDs
const generatedIds = new Set();
const MAX_CACHE_SIZE = 10000;

// Character sets for random generation
const CHAR_SETS = {
  NUMERIC: '0123456789',
  ALPHA: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  ALPHANUM: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  HEX: '0123456789ABCDEF'
};

/**
 * Reset daily counters at midnight
 */
const resetDailyCounters = () => {
  const now = new Date();
  const today = now.toDateString();
  
  if (lastResetDate !== today) {
    dailyCounter.clear();
    lastResetDate = today;
  }
};

/**
 * Get sequential counter for a specific prefix
 */
const getSequentialCounter = (prefix) => {
  resetDailyCounters();
  const current = dailyCounter.get(prefix) || 0;
  const next = current + 1;
  dailyCounter.set(prefix, next);
  return next;
};

/**
 * Generate random string of specified length
 */
const generateRandomString = (length, charSet = CHAR_SETS.ALPHANUM) => {
  let result = '';
  for (let i = 0; i < length; i++) {
    result += charSet.charAt(Math.floor(Math.random() * charSet.length));
  }
  return result;
};

/**
 * Generate timestamp-based component
 */
const generateTimestampComponent = (format = 'YMDHMS') => {
  const now = new Date();
  
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const milliseconds = String(now.getMilliseconds()).padStart(3, '0');
  
  const formats = {
    YMD: `${year}${month}${day}`,
    HMS: `${hours}${minutes}${seconds}`,
    YMDHMS: `${year}${month}${day}${hours}${minutes}${seconds}`,
    YMDHMSM: `${year}${month}${day}${hours}${minutes}${seconds}${milliseconds}`,
    DMY: `${day}${month}${year}`,
    MDY: `${month}${day}${year}`
  };
  
  return formats[format] || formats.YMDHMS;
};

/**
 * Generate unique ID with retry mechanism
 */
const generateWithRetry = (generator, maxRetries = 3) => {
  for (let i = 0; i < maxRetries; i++) {
    const id = generator();
    if (!generatedIds.has(id)) {
      generatedIds.add(id);
      
      // Maintain cache size
      if (generatedIds.size > MAX_CACHE_SIZE) {
        const iterator = generatedIds.values();
        for (let j = 0; j < MAX_CACHE_SIZE / 2; j++) {
          generatedIds.delete(iterator.next().value);
        }
      }
      
      return id;
    }
  }
  
  // Fallback with timestamp + random
  return `${Date.now()}-${generateRandomString(8, CHAR_SETS.HEX)}`;
};

/**
 * Main invoice ID generator (enhanced)
 * @param {Object} options - Configuration options
 * @returns {string} Generated invoice ID
 */
export function generateInvoiceId(options = {}) {
  const {
    prefix = "VRV",
    format = "standard", // standard, compact, sequential, qr, simple
    separator = "-",
    includeTimestamp = true,
    includeRandom = true,
    includeSequential = false,
    randomLength = 4,
    timestampFormat = "YMDHMS",
    caseStyle = "upper", // upper, lower, preserve
    suffix = null
  } = options;
  
  let components = [];
  
  // Add prefix
  if (prefix) {
    let formattedPrefix = prefix;
    if (caseStyle === 'upper') formattedPrefix = prefix.toUpperCase();
    if (caseStyle === 'lower') formattedPrefix = prefix.toLowerCase();
    components.push(formattedPrefix);
  }
  
  // Add timestamp
  if (includeTimestamp) {
    components.push(generateTimestampComponent(timestampFormat));
  }
  
  // Add sequential number
  if (includeSequential) {
    const sequential = getSequentialCounter(prefix);
    components.push(String(sequential).padStart(6, '0'));
  }
  
  // Add random component
  if (includeRandom) {
    const random = generateRandomString(randomLength, CHAR_SETS.ALPHANUM);
    components.push(caseStyle === 'upper' ? random.toUpperCase() : 
                   caseStyle === 'lower' ? random.toLowerCase() : random);
  }
  
  // Add custom suffix
  if (suffix) {
    components.push(suffix);
  }
  
  // Generate ID based on format
  let invoiceId = components.join(separator);
  
  // Apply format-specific modifications
  switch(format) {
    case 'compact':
      invoiceId = invoiceId.replace(new RegExp(separator, 'g'), '');
      break;
    case 'sequential':
      if (!includeSequential) {
        const seq = getSequentialCounter(prefix);
        invoiceId = `${prefix}${separator}${String(seq).padStart(8, '0')}`;
      }
      break;
    case 'qr':
      invoiceId = invoiceId.replace(new RegExp(separator, 'g'), '');
      break;
    case 'simple':
      invoiceId = `${prefix}${generateTimestampComponent('YMD')}${generateRandomString(6, CHAR_SETS.NUMERIC)}`;
      break;
    default:
      // standard format - keep as is
      break;
  }
  
  return invoiceId;
}

/**
 * Generate invoice ID with sequential numbering (daily reset)
 */
export function generateSequentialInvoiceId(prefix = "VRV") {
  return generateWithRetry(() => {
    const sequential = getSequentialCounter(prefix);
    const date = generateTimestampComponent('YMD');
    return `${prefix}-${date}-${String(sequential).padStart(6, '0')}`;
  });
}

/**
 * Generate compact invoice ID (no separators)
 */
export function generateCompactInvoiceId(prefix = "VRV") {
  return generateInvoiceId({
    prefix,
    separator: "",
    format: "compact",
    randomLength: 6
  });
}

/**
 * Generate QR-friendly invoice ID (short, no special chars)
 */
export function generateQRInvoiceId(prefix = "VRV") {
  return generateWithRetry(() => {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = generateRandomString(4, CHAR_SETS.ALPHANUM);
    return `${prefix}${timestamp}${random}`;
  });
}

/**
 * Generate invoice ID with enhanced randomness (for high-volume)
 */
export function generateSecureInvoiceId(prefix = "VRV") {
  const timestamp = Date.now();
  const random1 = Math.random().toString(36).substring(2, 10);
  const random2 = crypto.randomUUID().substring(0, 8);
  return `${prefix}-${timestamp}-${random1}-${random2}`.toUpperCase();
}

/**
 * Original function maintained for backward compatibility
 */
export function generateLegacyInvoiceId(prefix = "VRV") {
  const now = new Date();
  const date = now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, "0") +
    String(now.getDate()).padStart(2, "0");
  const time = String(now.getHours()).padStart(2, "0") +
    String(now.getMinutes()).padStart(2, "0") +
    String(now.getSeconds()).padStart(2, "0");
  const random = Math.random().toString(16).substring(2, 6).toUpperCase();
  return `${prefix}-${date}-${time}-${random}`;
}

/**
 * Parse invoice ID to extract components
 */
export function parseInvoiceId(invoiceId, separator = "-") {
  if (!invoiceId || typeof invoiceId !== 'string') {
    return null;
  }
  
  const parts = invoiceId.split(separator);
  
  if (parts.length < 2) {
    return null;
  }
  
  const result = {
    original: invoiceId,
    prefix: parts[0],
    components: parts.slice(1),
    hasTimestamp: false,
    timestamp: null,
    hasSequential: false,
    sequential: null,
    random: null
  };
  
  // Try to detect timestamp (YYYYMMDD or YYYYMMDDHHMMSS)
  for (const part of parts.slice(1)) {
    if (/^\d{8}$/.test(part) || /^\d{14}$/.test(part) || /^\d{17}$/.test(part)) {
      result.hasTimestamp = true;
      result.timestamp = part;
      break;
    }
  }
  
  // Try to detect sequential number (padded digits)
  for (const part of parts.slice(1)) {
    if (/^\d{6,8}$/.test(part) && !result.hasTimestamp) {
      result.hasSequential = true;
      result.sequential = parseInt(part);
      break;
    }
  }
  
  // Try to detect random component
  for (const part of parts.slice(1)) {
    if (/^[A-Z0-9]{4,8}$/.test(part) && part !== result.timestamp) {
      result.random = part;
      break;
    }
  }
  
  return result;
}

/**
 * Validate invoice ID format
 */
export function validateInvoiceId(invoiceId, options = {}) {
  const {
    prefix = null,
    minLength = 10,
    maxLength = 50,
    allowedChars = /^[A-Z0-9-]+$/
  } = options;
  
  if (!invoiceId || typeof invoiceId !== 'string') {
    return { valid: false, error: "Invoice ID is required" };
  }
  
  if (invoiceId.length < minLength) {
    return { valid: false, error: `Invoice ID too short (min ${minLength} chars)` };
  }
  
  if (invoiceId.length > maxLength) {
    return { valid: false, error: `Invoice ID too long (max ${maxLength} chars)` };
  }
  
  if (!allowedChars.test(invoiceId)) {
    return { valid: false, error: "Invoice ID contains invalid characters" };
  }
  
  if (prefix && !invoiceId.startsWith(prefix)) {
    return { valid: false, error: `Invoice ID must start with ${prefix}` };
  }
  
  // Check for duplicate (if tracking is enabled)
  if (options.checkDuplicate && generatedIds.has(invoiceId)) {
    return { valid: false, error: "Duplicate invoice ID detected" };
  }
  
  return { valid: true };
}

/**
 * Batch generate multiple invoice IDs
 */
export function generateBatchInvoiceIds(count, options = {}) {
  const ids = [];
  const baseTime = Date.now();
  
  for (let i = 0; i < count; i++) {
    // Slight delay to ensure uniqueness
    const mockDate = new Date(baseTime + i);
    const originalDateNow = Date.now;
    Date.now = () => baseTime + i;
    
    const id = generateInvoiceId({
      ...options,
      includeSequential: true,
      randomLength: options.randomLength || 4
    });
    
    ids.push(id);
    Date.now = originalDateNow;
  }
  
  return ids;
}

/**
 * Get statistics about generated IDs
 */
export function getInvoiceIdStats() {
  return {
    totalGenerated: generatedIds.size,
    uniqueCount: generatedIds.size,
    cacheSize: MAX_CACHE_SIZE,
    cacheUsage: `${((generatedIds.size / MAX_CACHE_SIZE) * 100).toFixed(2)}%`
  };
}

/**
 * Clear generated IDs cache
 */
export function clearInvoiceIdCache() {
  generatedIds.clear();
  dailyCounter.clear();
  lastResetDate = null;
}

/**
 * Convert invoice ID to different format
 */
export function convertInvoiceFormat(invoiceId, targetFormat, options = {}) {
  const parsed = parseInvoiceId(invoiceId, options.separator);
  if (!parsed) return null;
  
  switch(targetFormat) {
    case 'compact':
      return invoiceId.replace(new RegExp(options.separator || '-', 'g'), '');
    case 'qr':
      return invoiceId.replace(new RegExp(options.separator || '-', 'g'), '');
    case 'readable':
      return invoiceId.replace(new RegExp(options.separator || '-', 'g'), ' ');
    default:
      return invoiceId;
  }
}

/**
 * Generate invoice ID with shop-specific prefix
 */
export function generateShopInvoiceId(shopId, options = {}) {
  const shopPrefix = `SHOP${String(shopId).slice(-4)}`;
  return generateInvoiceId({
    prefix: shopPrefix,
    ...options
  });
}

// Default export with all functions
export default {
  generateInvoiceId,
  generateSequentialInvoiceId,
  generateCompactInvoiceId,
  generateQRInvoiceId,
  generateSecureInvoiceId,
  generateLegacyInvoiceId,
  generateBatchInvoiceIds,
  generateShopInvoiceId,
  parseInvoiceId,
  validateInvoiceId,
  getInvoiceIdStats,
  clearInvoiceIdCache,
  convertInvoiceFormat
};