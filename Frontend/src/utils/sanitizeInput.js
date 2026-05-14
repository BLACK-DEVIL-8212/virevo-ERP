/**
 * Enhanced input sanitization utilities for security
 * Prevents XSS, SQL injection, and other injection attacks
 */

// Constants
const MAX_SANITIZED_LENGTH = 10000;
const SQL_KEYWORDS = [
  'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE', 'ALTER',
  'EXEC', 'UNION', 'JOIN', 'WHERE', 'FROM', 'TABLE', 'DATABASE'
];

// HTML entities mapping
const HTML_ENTITIES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
  '`': '&#x60;',
  '=': '&#x3D;'
};

// Dangerous patterns to remove
const DANGEROUS_PATTERNS = [
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
  /javascript:/gi,
  /vbscript:/gi,
  /onload\s*=/gi,
  /onerror\s*=/gi,
  /onclick\s*=/gi,
  /onmouseover\s*=/gi,
  /onfocus\s*=/gi,
  /onblur\s*=/gi,
  /onchange\s*=/gi,
  /onsubmit\s*=/gi,
  /onreset\s*=/gi,
  /onselect\s*=/gi,
  /onabort\s*=/gi,
  /onkeydown\s*=/gi,
  /onkeypress\s*=/gi,
  /onkeyup\s*=/gi,
  /expression\s*\(/gi,
  /eval\s*\(/gi,
  /alert\s*\(/gi,
  /confirm\s*\(/gi,
  /prompt\s*\(/gi,
  /document\./gi,
  /window\./gi,
  /location\./gi,
  /\.innerHTML/gi,
  /\.outerHTML/gi
];

/**
 * Main sanitization function (enhanced)
 * @param {any} value - Input to sanitize
 * @param {Object} options - Sanitization options
 * @returns {string} Sanitized string
 */
export const sanitizeInput = (value, options = {}) => {
  const {
    allowHtml = false,
    maxLength = MAX_SANITIZED_LENGTH,
    trim = true,
    removeScripts = true,
    encodeEntities = true,
    preventSqlInjection = true,
    customPatterns = []
  } = options;

  // Handle null/undefined
  if (value === null || value === undefined) {
    return '';
  }

  // Handle non-string inputs
  if (typeof value !== 'string') {
    // Convert objects/arrays to JSON string
    if (typeof value === 'object') {
      try {
        value = JSON.stringify(value);
      } catch (e) {
        return '';
      }
    } else {
      value = String(value);
    }
  }

  // Truncate if too long
  if (value.length > maxLength) {
    value = value.substring(0, maxLength);
  }

  let sanitized = value;

  // Remove script tags and dangerous content
  if (removeScripts) {
    for (const pattern of DANGEROUS_PATTERNS) {
      sanitized = sanitized.replace(pattern, '');
    }
  }

  // Remove SQL injection patterns
  if (preventSqlInjection) {
    for (const keyword of SQL_KEYWORDS) {
      const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
      sanitized = sanitized.replace(regex, '');
    }
    // Remove SQL comments
    sanitized = sanitized.replace(/--/g, '');
    sanitized = sanitized.replace(/\/\*[\s\S]*?\*\//g, '');
    sanitized = sanitized.replace(/;.*$/gm, '');
  }

  // Apply custom patterns
  if (customPatterns.length > 0) {
    for (const pattern of customPatterns) {
      sanitized = sanitized.replace(pattern, '');
    }
  }

  // Encode HTML entities if not allowing HTML
  if (!allowHtml && encodeEntities) {
    sanitized = encodeHtmlEntities(sanitized);
  } else if (allowHtml) {
    // If allowing HTML, still remove dangerous attributes
    sanitized = sanitizeHtml(sanitized);
  }

  // Trim whitespace if requested
  if (trim) {
    sanitized = sanitized.trim();
  }

  // Remove null bytes and other control characters
  sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');
  
  // Remove multiple consecutive spaces
  sanitized = sanitized.replace(/\s+/g, ' ');

  return sanitized;
};

/**
 * Encode HTML entities
 * @param {string} str - String to encode
 * @returns {string} Encoded string
 */
export const encodeHtmlEntities = (str) => {
  if (!str) return '';
  return str.replace(/[&<>"'/`=]/g, (char) => HTML_ENTITIES[char] || char);
};

/**
 * Decode HTML entities
 * @param {string} str - String to decode
 * @returns {string} Decoded string
 */
export const decodeHtmlEntities = (str) => {
  if (!str) return '';
  const entities = Object.entries(HTML_ENTITIES);
  let decoded = str;
  for (const [char, entity] of entities) {
    decoded = decoded.replace(new RegExp(entity, 'g'), char);
  }
  return decoded;
};

/**
 * Sanitize HTML while allowing safe tags
 * @param {string} html - HTML string to sanitize
 * @returns {string} Sanitized HTML
 */
export const sanitizeHtml = (html) => {
  if (!html) return '';
  
  // List of allowed tags
  const allowedTags = [
    'b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'div', 'table',
    'tr', 'td', 'th', 'thead', 'tbody'
  ];
  
  // List of allowed attributes
  const allowedAttributes = ['href', 'title', 'class', 'id', 'style'];
  
  let sanitized = html;
  
  // Remove script tags and event handlers
  sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  sanitized = sanitized.replace(/on\w+\s*=/gi, '');
  sanitized = sanitized.replace(/javascript:/gi, '');
  
  // Remove disallowed tags
  const tagRegex = /<\/?([a-z][a-z0-9]*)\b[^>]*>/gi;
  sanitized = sanitized.replace(tagRegex, (match, tagName) => {
    if (allowedTags.includes(tagName.toLowerCase())) {
      // Keep allowed tags but remove dangerous attributes
      return match.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '');
    }
    return '';
  });
  
  return sanitized;
};

/**
 * Sanitize email address
 * @param {string} email - Email to sanitize
 * @returns {string} Sanitized email
 */
export const sanitizeEmail = (email) => {
  if (!email) return '';
  
  // Remove any whitespace and convert to lowercase
  let sanitized = email.trim().toLowerCase();
  
  // Remove any potentially dangerous characters
  sanitized = sanitized.replace(/[^a-z0-9@._-]/g, '');
  
  // Basic email format validation
  const emailRegex = /^[a-z0-9._-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
  if (!emailRegex.test(sanitized)) {
    return '';
  }
  
  // Limit email length
  if (sanitized.length > 254) {
    return '';
  }
  
  return sanitized;
};

/**
 * Sanitize phone number
 * @param {string} phone - Phone number to sanitize
 * @param {Object} options - Formatting options
 * @returns {string} Sanitized phone number
 */
export const sanitizePhone = (phone, options = {}) => {
  const { countryCode = null, keepFormat = false } = options;
  
  if (!phone) return '';
  
  // Remove all non-digit characters
  let sanitized = phone.replace(/\D/g, '');
  
  // Apply country code if provided
  if (countryCode) {
    const code = countryCode.replace(/\D/g, '');
    if (sanitized.startsWith(code)) {
      sanitized = sanitized.substring(code.length);
    }
  }
  
  // Validate length (10 digits for Indian numbers)
  if (sanitized.length !== 10) {
    return '';
  }
  
  // Format if requested
  if (keepFormat) {
    sanitized = formatPhoneNumber(sanitized);
  }
  
  return sanitized;
};

/**
 * Format phone number for display
 * @param {string} phone - Raw phone number
 * @returns {string} Formatted phone number
 */
const formatPhoneNumber = (phone) => {
  if (!phone || phone.length !== 10) return phone;
  return `${phone.slice(0, 5)}-${phone.slice(5)}`;
};

/**
 * Sanitize URL
 * @param {string} url - URL to sanitize
 * @returns {string} Sanitized URL
 */
export const sanitizeUrl = (url) => {
  if (!url) return '';
  
  let sanitized = url.trim();
  
  // Check for dangerous protocols
  const dangerousProtocols = ['javascript:', 'vbscript:', 'data:'];
  for (const protocol of dangerousProtocols) {
    if (sanitized.toLowerCase().startsWith(protocol)) {
      return '';
    }
  }
  
  // Ensure proper protocol
  if (!sanitized.startsWith('https//') && !sanitized.startsWith('https://')) {
    sanitized = 'https://' + sanitized;
  }
  
  // Remove dangerous characters
  sanitized = sanitized.replace(/[<>"'`]/g, '');
  
  // Limit URL length
  if (sanitized.length > 2000) {
    sanitized = sanitized.substring(0, 2000);
  }
  
  return sanitized;
};

/**
 * Sanitize object recursively
 * @param {Object} obj - Object to sanitize
 * @param {Object} options - Sanitization options
 * @returns {Object} Sanitized object
 */
export const sanitizeObject = (obj, options = {}) => {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }
  
  const sanitized = Array.isArray(obj) ? [] : {};
  
  for (const [key, value] of Object.entries(obj)) {
    // Sanitize key
    const safeKey = sanitizeInput(key, { maxLength: 100 });
    
    if (typeof value === 'string') {
      sanitized[safeKey] = sanitizeInput(value, options);
    } else if (typeof value === 'object' && value !== null) {
      sanitized[safeKey] = sanitizeObject(value, options);
    } else {
      sanitized[safeKey] = value;
    }
  }
  
  return sanitized;
};

/**
 * Sanitize array of strings
 * @param {Array} arr - Array to sanitize
 * @param {Object} options - Sanitization options
 * @returns {Array} Sanitized array
 */
export const sanitizeArray = (arr, options = {}) => {
  if (!Array.isArray(arr)) return [];
  
  return arr.map(item => {
    if (typeof item === 'string') {
      return sanitizeInput(item, options);
    } else if (typeof item === 'object' && item !== null) {
      return sanitizeObject(item, options);
    }
    return item;
  });
};

/**
 * Sanitize for database queries (escape special characters)
 * @param {string} value - Value to escape
 * @returns {string} Escaped string
 */
export const escapeForDatabase = (value) => {
  if (!value) return '';
  
  let escaped = String(value);
  
  // Escape backslashes
  escaped = escaped.replace(/\\/g, '\\\\');
  
  // Escape quotes
  escaped = escaped.replace(/'/g, "\\'");
  escaped = escaped.replace(/"/g, '\\"');
  
  // Escape null bytes
  escaped = escaped.replace(/\0/g, '\\0');
  
  return escaped;
};

/**
 * Check if string contains potentially dangerous content
 * @param {string} value - String to check
 * @returns {boolean} True if dangerous
 */
export const containsDangerousContent = (value) => {
  if (!value || typeof value !== 'string') return false;
  
  const lowerValue = value.toLowerCase();
  
  // Check for script tags
  if (lowerValue.includes('<script') || lowerValue.includes('</script>')) {
    return true;
  }
  
  // Check for event handlers
  if (/\son\w+\s*=/.test(lowerValue)) {
    return true;
  }
  
  // Check for javascript protocol
  if (lowerValue.includes('javascript:')) {
    return true;
  }
  
  // Check for SQL injection patterns
  for (const keyword of SQL_KEYWORDS) {
    if (lowerValue.includes(keyword.toLowerCase())) {
      return true;
    }
  }
  
  return false;
};

/**
 * Get sanitization report
 * @param {string} input - Original input
 * @param {string} sanitized - Sanitized output
 * @returns {Object} Report
 */
export const getSanitizationReport = (input, sanitized) => {
  if (!input) return { changed: false, changes: [] };
  
  const changes = [];
  if (input !== sanitized) {
    changes.push({
      type: 'content_modified',
      original: input.substring(0, 100),
      sanitized: sanitized.substring(0, 100)
    });
  }
  
  if (containsDangerousContent(input)) {
    changes.push({
      type: 'dangerous_content_removed',
      message: 'Potentially dangerous content was removed'
    });
  }
  
  return {
    changed: changes.length > 0,
    changes,
    originalLength: input.length,
    sanitizedLength: sanitized.length
  };
};

// Export all utilities
export default {
  sanitizeInput,
  sanitizeEmail,
  sanitizePhone,
  sanitizeUrl,
  sanitizeObject,
  sanitizeArray,
  sanitizeHtml,
  encodeHtmlEntities,
  decodeHtmlEntities,
  escapeForDatabase,
  containsDangerousContent,
  getSanitizationReport
};