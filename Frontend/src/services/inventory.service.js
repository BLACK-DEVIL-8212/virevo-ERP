import { ref, get, set, update, remove, push, runTransaction, query, orderByChild, equalTo } from "firebase/database";
import { db } from "./firebase";

/* ======================================================
   CONSTANTS
====================================================== */

const MIN_STOCK_THRESHOLD = 0;
const MAX_GST_PERCENTAGE = 100;
const MIN_GST_PERCENTAGE = 0;

/* ======================================================
   HELPER FUNCTIONS
====================================================== */

const safeNumber = (value, defaultValue = 0) => {
  const num = Number(value);
  return isNaN(num) ? defaultValue : num;
};

const validateProductData = (product) => {
  const errors = [];
  const warnings = [];

  if (!product.name || product.name.trim().length === 0) {
    errors.push("Product name is required");
  }

  if (!product.category || product.category.trim().length === 0) {
    errors.push("Product category is required");
  }

  const mrp = safeNumber(product.mrp);
  if (mrp <= 0) {
    errors.push(`Invalid MRP: ${product.mrp}. MRP must be greater than 0`);
  }

  const costPrice = safeNumber(product.costPrice);
  if (costPrice < 0) {
    errors.push(`Invalid cost price: ${product.costPrice}`);
  }

  const gst = safeNumber(product.gst);
  if (gst < MIN_GST_PERCENTAGE || gst > MAX_GST_PERCENTAGE) {
    errors.push(`Invalid GST percentage: ${product.gst}. Must be between ${MIN_GST_PERCENTAGE}-${MAX_GST_PERCENTAGE}`);
  }

  const stock = safeNumber(product.stock);
  if (stock < MIN_STOCK_THRESHOLD) {
    errors.push(`Invalid stock quantity: ${product.stock}`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    data: {
      name: product.name.trim(),
      category: product.category.trim(),
      mrp: safeNumber(mrp),
      costPrice: safeNumber(costPrice),
      gst: safeNumber(gst),
      stock: safeNumber(stock),
      imei1: product.imei1 ? product.imei1.trim() : null,
      imei2: product.imei2 ? product.imei2.trim() : null
    }
  };
};

/* ======================================================
   GET ALL PRODUCTS
====================================================== */

export const getAllProducts = async (shopId) => {
  if (!shopId) return [];

  try {
    const snap = await get(ref(db, `shops/${shopId}/products`));
    
    if (!snap.exists()) return [];

    const products = [];
    
    snap.forEach((child) => {
      products.push({
        id: child.key,
        ...child.val()
      });
    });

    return products;
  } catch (error) {
    console.error("Get all products failed:", error);
    return [];
  }
};

/* ======================================================
   GET PRODUCT BY ID
====================================================== */

export const getProductById = async (shopId, productId) => {
  if (!shopId || !productId) return null;

  try {
    const snap = await get(ref(db, `shops/${shopId}/products/${productId}`));
    
    if (!snap.exists()) return null;
    
    return {
      id: productId,
      ...snap.val()
    };
  } catch (error) {
    console.error("Get product by ID failed:", error);
    return null;
  }
};

/* ======================================================
   ADD PRODUCT
====================================================== */

export const addProduct = async (shopId, productData) => {
  if (!shopId) throw new Error("Shop ID required");
  
  const validation = validateProductData(productData);
  if (!validation.isValid) {
    throw new Error(validation.errors.join(", "));
  }

  const { data } = validation;
  const productRef = push(ref(db, `shops/${shopId}/products`));
  const timestamp = Date.now();

  const product = {
    ...data,
    createdAt: timestamp,
    updatedAt: null,
    lastSoldAt: null,
    totalSold: 0,
    soldIMEIs: {}
  };

  await set(productRef, product);

  // Create IMEI indexes
  if (data.imei1) {
    await set(ref(db, `shops/${shopId}/imeiIndex/${data.imei1}`), productRef.key);
  }
  if (data.imei2) {
    await set(ref(db, `shops/${shopId}/imeiIndex/${data.imei2}`), productRef.key);
  }

  return {
    id: productRef.key,
    ...product
  };
};

/* ======================================================
   UPDATE PRODUCT
====================================================== */

export const updateProduct = async (shopId, productId, updates) => {
  if (!shopId || !productId) throw new Error("Shop ID and Product ID required");

  const productRef = ref(db, `shops/${shopId}/products/${productId}`);
  const productSnap = await get(productRef);
  
  if (!productSnap.exists()) {
    throw new Error("Product not found");
  }

  const currentProduct = productSnap.val();
  const updateData = {
    ...updates,
    updatedAt: Date.now()
  };

  // Handle IMEI updates
  if (updates.imei1 !== undefined && updates.imei1 !== currentProduct.imei1) {
    if (currentProduct.imei1) {
      await remove(ref(db, `shops/${shopId}/imeiIndex/${currentProduct.imei1}`));
    }
    if (updates.imei1) {
      await set(ref(db, `shops/${shopId}/imeiIndex/${updates.imei1}`), productId);
    }
  }

  if (updates.imei2 !== undefined && updates.imei2 !== currentProduct.imei2) {
    if (currentProduct.imei2) {
      await remove(ref(db, `shops/${shopId}/imeiIndex/${currentProduct.imei2}`));
    }
    if (updates.imei2) {
      await set(ref(db, `shops/${shopId}/imeiIndex/${updates.imei2}`), productId);
    }
  }

  await update(productRef, updateData);
  
  return { success: true };
};

/* ======================================================
   DELETE PRODUCT
====================================================== */

export const deleteProduct = async (shopId, productId) => {
  if (!shopId || !productId) throw new Error("Shop ID and Product ID required");

  const productSnap = await get(ref(db, `shops/${shopId}/products/${productId}`));
  
  if (!productSnap.exists()) return;

  const product = productSnap.val();

  // Remove IMEI indexes
  if (product.imei1) {
    await remove(ref(db, `shops/${shopId}/imeiIndex/${product.imei1}`));
  }
  if (product.imei2) {
    await remove(ref(db, `shops/${shopId}/imeiIndex/${product.imei2}`));
  }

  // Delete product
  await remove(ref(db, `shops/${shopId}/products/${productId}`));
  
  return { success: true };
};

/* ======================================================
   UPDATE STOCK
====================================================== */

export const updateStock = async (shopId, productId, newStock) => {
  if (!shopId || !productId) throw new Error("Shop ID and Product ID required");

  await update(ref(db, `shops/${shopId}/products/${productId}`), {
    stock: safeNumber(newStock),
    updatedAt: Date.now()
  });
  
  return { success: true };
};

/* ======================================================
   GET LOW STOCK PRODUCTS
====================================================== */

export const getLowStockProducts = async (shopId, threshold = 5) => {
  const products = await getAllProducts(shopId);
  return products.filter(p => (p.stock || 0) <= threshold);
};

/* ======================================================
   GET UNSOLD PRODUCTS
====================================================== */

export const getUnsoldProducts = async (shopId, days = 90) => {
  const now = Date.now();
  const limit = days * 24 * 60 * 60 * 1000;
  const products = await getAllProducts(shopId);
  
  return products.filter(p => {
    if (!p.lastSoldAt) return true;
    return now - p.lastSoldAt > limit;
  });
};

/* ======================================================
   GET PRODUCT STATISTICS (Single export - no duplicate)
====================================================== */

export const getProductStatistics = async (shopId) => {
  const products = await getAllProducts(shopId);
  
  const stats = {
    total: products.length,
    totalValue: 0,
    totalPotentialRevenue: 0,
    lowStock: 0,
    outOfStock: 0,
    byCategory: {},
    topProducts: []
  };
  
  let totalValue = 0;
  let totalRevenue = 0;
  
  products.forEach(product => {
    const stockValue = (product.stock || 0) * (product.costPrice || 0);
    const potentialRevenue = (product.stock || 0) * (product.mrp || 0);
    
    totalValue += stockValue;
    totalRevenue += potentialRevenue;
    
    if ((product.stock || 0) <= 5) stats.lowStock++;
    if ((product.stock || 0) === 0) stats.outOfStock++;
    
    if (product.category) {
      if (!stats.byCategory[product.category]) {
        stats.byCategory[product.category] = { count: 0, value: 0 };
      }
      stats.byCategory[product.category].count++;
      stats.byCategory[product.category].value += stockValue;
    }
  });
  
  stats.totalValue = totalValue;
  stats.totalPotentialRevenue = totalRevenue;
  
  // Top products by stock value
  stats.topProducts = [...products]
    .sort((a, b) => ((b.stock || 0) * (b.costPrice || 0)) - ((a.stock || 0) * (a.costPrice || 0)))
    .slice(0, 10);
  
  return stats;
};

/* ======================================================
   SEARCH PRODUCTS
====================================================== */

export const searchProducts = async (shopId, searchTerm) => {
  const products = await getAllProducts(shopId);
  const term = searchTerm.toLowerCase();
  
  return products.filter(p => 
    p.name.toLowerCase().includes(term) ||
    (p.category && p.category.toLowerCase().includes(term)) ||
    (p.imei1 && p.imei1.includes(term)) ||
    (p.imei2 && p.imei2.includes(term))
  );
};

/* ======================================================
   GET PRODUCTS BY CATEGORY
====================================================== */

export const getProductsByCategory = async (shopId, category) => {
  const products = await getAllProducts(shopId);
  return products.filter(p => p.category === category);
};

/* ======================================================
   BULK UPDATE STOCK
====================================================== */

export const bulkUpdateStock = async (shopId, updates) => {
  const results = {
    success: [],
    failed: []
  };
  
  for (const update of updates) {
    try {
      await updateStock(shopId, update.productId, update.stock);
      results.success.push(update.productId);
    } catch (error) {
      results.failed.push({ productId: update.productId, error: error.message });
    }
  }
  
  return results;
};

// Export all functions (no duplicates)
export default {
  getAllProducts,
  getProductById,
  addProduct,
  updateProduct,
  deleteProduct,
  updateStock,
  getLowStockProducts,
  getUnsoldProducts,
  getProductStatistics,
  searchProducts,
  getProductsByCategory,
  bulkUpdateStock
};