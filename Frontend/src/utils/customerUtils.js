/**
 * Customer utility functions for safely accessing customer data
 */

// Cache for frequently accessed customers
const customerCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Clear expired cache entries
 */
const cleanCache = () => {
  const now = Date.now();
  for (const [key, value] of customerCache.entries()) {
    if (now - value.timestamp > CACHE_DURATION) {
      customerCache.delete(key);
    }
  }
};

// Run cache cleanup every minute
setInterval(cleanCache, 60 * 1000);

/**
 * Get customer name safely
 * @param {string} buyerId - Customer ID
 * @param {Object} buyersMap - Map of customers
 * @param {Object} options - Additional options
 * @returns {string} Customer name or fallback
 */
export const getCustomerName = (buyerId, buyersMap, options = {}) => {
  const { fallback = "Walk-in", capitalize = false, showIdIfMissing = false } = options;
  
  if (!buyerId) {
    return showIdIfMissing ? `${fallback} (No ID)` : fallback;
  }
  
  // Check cache first
  const cacheKey = `name_${buyerId}`;
  const cached = customerCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.value;
  }
  
  let customerName = buyersMap?.[buyerId]?.name || fallback;
  
  // Add buyer ID for debugging if needed
  if (showIdIfMissing && customerName === fallback) {
    customerName = `${fallback} (${buyerId.slice(0, 8)})`;
  }
  
  // Capitalize if requested
  if (capitalize && customerName !== fallback) {
    customerName = customerName
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }
  
  // Cache the result
  customerCache.set(cacheKey, {
    value: customerName,
    timestamp: Date.now()
  });
  
  return customerName;
};

/**
 * Get customer phone safely
 * @param {string} buyerId - Customer ID
 * @param {Object} buyersMap - Map of customers
 * @param {Object} options - Additional options
 * @returns {string} Customer phone or fallback
 */
export const getCustomerPhone = (buyerId, buyersMap, options = {}) => {
  const { fallback = "-", format = false, showIdIfMissing = false } = options;
  
  if (!buyerId) {
    return showIdIfMissing ? `${fallback} (No ID)` : fallback;
  }
  
  // Check cache
  const cacheKey = `phone_${buyerId}`;
  const cached = customerCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.value;
  }
  
  let phone = buyersMap?.[buyerId]?.phone || fallback;
  
  // Format phone number if requested
  if (format && phone !== fallback && phone.length === 10) {
    phone = formatPhoneNumber(phone);
  }
  
  // Add buyer ID for debugging if needed
  if (showIdIfMissing && phone === fallback) {
    phone = `${fallback} (${buyerId.slice(0, 8)})`;
  }
  
  // Cache the result
  customerCache.set(cacheKey, {
    value: phone,
    timestamp: Date.now()
  });
  
  return phone;
};

/**
 * Get complete customer details
 * @param {string} buyerId - Customer ID
 * @param {Object} buyersMap - Map of customers
 * @returns {Object|null} Customer object or null
 */
export const getCustomerDetails = (buyerId, buyersMap) => {
  if (!buyerId || !buyersMap?.[buyerId]) {
    return null;
  }
  
  const customer = buyersMap[buyerId];
  
  return {
    id: buyerId,
    name: customer.name || "Unknown",
    phone: customer.phone || "",
    email: customer.email || "",
    address: customer.address || "",
    totalPurchases: customer.totalPurchases || 0,
    totalSpent: customer.totalSpent || 0,
    lastPurchaseAt: customer.lastPurchaseAt || null,
    createdAt: customer.createdAt || null,
    ...customer
  };
};

/**
 * Get customer initials for avatar
 * @param {string} buyerId - Customer ID
 * @param {Object} buyersMap - Map of customers
 * @returns {string} Customer initials
 */
export const getCustomerInitials = (buyerId, buyersMap) => {
  const name = getCustomerName(buyerId, buyersMap);
  
  if (name === "Walk-in") {
    return "W";
  }
  
  const parts = name.trim().split(' ');
  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase();
  }
  
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
};

/**
 * Format phone number for display
 * @param {string} phone - Raw phone number
 * @returns {string} Formatted phone number
 */
export const formatPhoneNumber = (phone) => {
  if (!phone) return '';
  
  // Remove all non-digits
  const cleaned = phone.replace(/\D/g, '');
  
  // Format based on length
  if (cleaned.length === 10) {
    return `${cleaned.slice(0, 5)}-${cleaned.slice(5)}`;
  } else if (cleaned.length === 11 && cleaned.startsWith('0')) {
    return `${cleaned.slice(1, 6)}-${cleaned.slice(6)}`;
  } else if (cleaned.length === 12 && cleaned.startsWith('91')) {
    return `+${cleaned.slice(0, 2)} ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`;
  }
  
  return phone;
};

/**
 * Validate customer data
 * @param {Object} customer - Customer object
 * @returns {Object} Validation result
 */
export const validateCustomer = (customer) => {
  const errors = [];
  const warnings = [];
  
  if (!customer.name || customer.name.trim().length < 2) {
    errors.push("Customer name must be at least 2 characters");
  }
  
  if (customer.phone && !/^[0-9]{10}$/.test(customer.phone)) {
    errors.push("Phone number must be 10 digits");
  }
  
  if (customer.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) {
    errors.push("Invalid email format");
  }
  
  if (customer.gstNumber && !isValidGST(customer.gstNumber)) {
    warnings.push("Invalid GST number format");
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
};

/**
 * Check if GST number is valid
 * @param {string} gst - GST number
 * @returns {boolean} Is valid
 */
const isValidGST = (gst) => {
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gst);
};

/**
 * Get customer display text for dropdowns
 * @param {string} buyerId - Customer ID
 * @param {Object} buyersMap - Map of customers
 * @returns {string} Display text
 */
export const getCustomerDisplayText = (buyerId, buyersMap) => {
  const name = getCustomerName(buyerId, buyersMap);
  const phone = getCustomerPhone(buyerId, buyersMap);
  
  if (name === "Walk-in") {
    return name;
  }
  
  if (phone && phone !== "-") {
    return `${name} (${phone})`;
  }
  
  return name;
};

/**
 * Search customers by name or phone
 * @param {Object} buyersMap - Map of customers
 * @param {string} searchTerm - Search term
 * @returns {Array} Filtered customers
 */
export const searchCustomers = (buyersMap, searchTerm) => {
  if (!buyersMap || !searchTerm) {
    return [];
  }
  
  const term = searchTerm.toLowerCase().trim();
  const results = [];
  
  for (const [id, customer] of Object.entries(buyersMap)) {
    const name = (customer.name || "").toLowerCase();
    const phone = (customer.phone || "");
    
    if (name.includes(term) || phone.includes(term)) {
      results.push({
        id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email
      });
    }
  }
  
  // Sort by name
  results.sort((a, b) => a.name.localeCompare(b.name));
  
  return results;
};

/**
 * Get customer summary for reports
 * @param {string} buyerId - Customer ID
 * @param {Object} buyersMap - Map of customers
 * @returns {Object} Customer summary
 */
export const getCustomerSummary = (buyerId, buyersMap) => {
  const customer = getCustomerDetails(buyerId, buyersMap);
  
  if (!customer) {
    return {
      name: "Walk-in",
      phone: "-",
      totalPurchases: 0,
      totalSpent: 0,
      averageSpend: 0
    };
  }
  
  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    email: customer.email,
    totalPurchases: customer.totalPurchases || 0,
    totalSpent: customer.totalSpent || 0,
    averageSpend: customer.totalPurchases > 0 
      ? (customer.totalSpent / customer.totalPurchases).toFixed(2)
      : 0,
    lastPurchaseAt: customer.lastPurchaseAt,
    customerSince: customer.createdAt
  };
};

/**
 * Sort customers by various criteria
 * @param {Object} buyersMap - Map of customers
 * @param {string} sortBy - Sort criteria (name, purchases, spent, recent)
 * @returns {Array} Sorted customers
 */
export const sortCustomers = (buyersMap, sortBy = "name") => {
  if (!buyersMap) return [];
  
  const customers = Object.entries(buyersMap).map(([id, customer]) => ({
    id,
    ...customer
  }));
  
  switch(sortBy) {
    case "purchases":
      return customers.sort((a, b) => (b.totalPurchases || 0) - (a.totalPurchases || 0));
    case "spent":
      return customers.sort((a, b) => (b.totalSpent || 0) - (a.totalSpent || 0));
    case "recent":
      return customers.sort((a, b) => (b.lastPurchaseAt || 0) - (a.lastPurchaseAt || 0));
    case "name":
    default:
      return customers.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }
};

/**
 * Get top customers by spending
 * @param {Object} buyersMap - Map of customers
 * @param {number} limit - Number of customers to return
 * @returns {Array} Top customers
 */
export const getTopCustomers = (buyersMap, limit = 10) => {
  const sorted = sortCustomers(buyersMap, "spent");
  return sorted.slice(0, limit);
};

/**
 * Get customer loyalty tier based on spending
 * @param {number} totalSpent - Total amount spent
 * @returns {string} Loyalty tier
 */
export const getCustomerLoyaltyTier = (totalSpent) => {
  if (totalSpent >= 100000) return "Platinum";
  if (totalSpent >= 50000) return "Gold";
  if (totalSpent >= 25000) return "Silver";
  if (totalSpent >= 10000) return "Bronze";
  return "Regular";
};

/**
 * Format customer address for display
 * @param {Object} customer - Customer object
 * @returns {string} Formatted address
 */
export const getFormattedAddress = (customer) => {
  if (!customer) return "";
  
  const parts = [];
  if (customer.address) parts.push(customer.address);
  if (customer.city) parts.push(customer.city);
  if (customer.state) parts.push(customer.state);
  if (customer.pincode) parts.push(customer.pincode);
  
  return parts.join(", ");
};

/**
 * Check if customer has complete profile
 * @param {Object} customer - Customer object
 * @returns {Object} Profile completeness
 */
export const getCustomerProfileCompleteness = (customer) => {
  if (!customer) return { percentage: 0, missing: [] };
  
  const fields = [
    { name: "name", required: true },
    { name: "phone", required: true },
    { name: "email", required: false },
    { name: "address", required: false },
    { name: "city", required: false },
    { name: "state", required: false },
    { name: "pincode", required: false },
    { name: "gstNumber", required: false }
  ];
  
  const present = [];
  const missing = [];
  
  for (const field of fields) {
    if (customer[field.name]) {
      present.push(field.name);
    } else if (field.required) {
      missing.push(field.name);
    }
  }
  
  const percentage = (present.length / fields.length) * 100;
  
  return {
    percentage: Math.round(percentage),
    present,
    missing,
    isComplete: missing.length === 0
  };
};

/**
 * Clear customer cache
 * @param {string} buyerId - Specific customer ID to clear (optional)
 */
export const clearCustomerCache = (buyerId = null) => {
  if (buyerId) {
    customerCache.delete(`name_${buyerId}`);
    customerCache.delete(`phone_${buyerId}`);
  } else {
    customerCache.clear();
  }
};

// Export all utilities
export default {
  getCustomerName,
  getCustomerPhone,
  getCustomerDetails,
  getCustomerInitials,
  formatPhoneNumber,
  validateCustomer,
  getCustomerDisplayText,
  searchCustomers,
  getCustomerSummary,
  sortCustomers,
  getTopCustomers,
  getCustomerLoyaltyTier,
  getFormattedAddress,
  getCustomerProfileCompleteness,
  clearCustomerCache
};