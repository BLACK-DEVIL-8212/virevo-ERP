import {
  ref,
  get,
  push,
  set,
  runTransaction,
  update,
  query,
  orderByChild,
  equalTo
} from "firebase/database";

import { db } from "../services/firebase";
import { generateBillId } from "../utils/billIdGenerator";
import { createJournalEntry } from "../accounting/journal.service";

/* ======================================================
   CONSTANTS
====================================================== */

const MIN_STOCK_ALERT = 5;
const MAX_GST_PERCENTAGE = 100;
const MIN_GST_PERCENTAGE = 0;

/* ======================================================
   HELPER FUNCTIONS
====================================================== */

const validatePhone = (phone) => {
  return phone && /^[0-9]{10}$/.test(phone);
};

const validateIMEI = (imei) => {
  // IMEI should be 15 digits (some might be 14 or 16)
  return imei && typeof imei === 'string' && /^[0-9]{14,16}$/.test(imei);
};

const safeNumber = (value, defaultValue = 0) => {
  const num = Number(value);
  return isNaN(num) ? defaultValue : num;
};

/* ======================================================
   PRODUCT LOOKUP BY IMEI (FIXED)
====================================================== */

export const fetchProductByIMEI = async (shopId, imeis) => {
  // Ensure array
  if (!Array.isArray(imeis)) {
    imeis = [imeis];
  }

  if (imeis.length === 0) {
    throw new Error("No IMEI provided");
  }

  const productsMap = new Map(); // Use Map for better performance

  for (const imei of imeis) {
    // Validate IMEI format
    if (!validateIMEI(imei)) {
      throw new Error(`Invalid IMEI format: ${imei}. IMEI must be 14-16 digits.`);
    }

    // Check IMEI index
    const indexSnap = await get(
      ref(db, `shops/${shopId}/imeiIndex/${imei}`)
    );

    if (!indexSnap.exists()) {
      throw new Error(`IMEI not found in inventory: ${imei}`);
    }

    const productId = indexSnap.val();

    // Fetch product
    const productSnap = await get(
      ref(db, `shops/${shopId}/products/${productId}`)
    );

    if (!productSnap.exists()) {
      throw new Error(`Product not found for IMEI: ${imei}`);
    }

    const product = productSnap.val();

    // Check if IMEI is already sold
    if (product.soldIMEIs && product.soldIMEIs[imei]) {
      const saleInfo = product.soldIMEIs[imei];
      throw new Error(`IMEI ${imei} already sold on ${new Date(saleInfo.soldAt).toLocaleDateString()}`);
    }

    // Validate product data
    const mrp = safeNumber(product.mrp);
    const gst = safeNumber(product.gst);
    const costPrice = safeNumber(product.costPrice);
    const stock = safeNumber(product.stock);

    // Critical validations
    if (mrp <= 0) {
      throw new Error(`Product "${product.name || productId}" has invalid MRP: ${product.mrp || 'missing'}. Please check product configuration.`);
    }

    if (gst < MIN_GST_PERCENTAGE || gst > MAX_GST_PERCENTAGE) {
      throw new Error(`Product "${product.name}" has invalid GST: ${gst}%. Must be between 0-100.`);
    }

    if (costPrice < 0) {
      throw new Error(`Product "${product.name}" has invalid cost price: ${product.costPrice}`);
    }

    if (stock <= 0) {
      throw new Error(`Product "${product.name}" is out of stock. Available: ${stock}`);
    }

    // Group by productId
    if (!productsMap.has(productId)) {
      productsMap.set(productId, {
        id: productId,
        name: product.name || "Unknown Product",
        mrp: mrp,
        gst: gst,
        costPrice: costPrice,
        stock: stock,
        qty: 0,
        scannedIMEIs: [],
        brand: product.brand || "",
        model: product.model || "",
        category: product.category || "",
        hsnCode: product.hsnCode || ""
      });
    }

    const productData = productsMap.get(productId);
    productData.qty += 1;
    productData.scannedIMEIs.push(imei);
  }

  // Convert Map to array and validate stock availability
  const result = Array.from(productsMap.values());
  
  for (const product of result) {
    if (product.stock < product.qty) {
      throw new Error(`Insufficient stock for ${product.name}. Available: ${product.stock}, Required: ${product.qty}`);
    }
  }

  return result;
};

/* ======================================================
   FETCH SINGLE PRODUCT BY IMEI
====================================================== */

export const fetchSingleProductByIMEI = async (shopId, imei) => {
  try {
    const products = await fetchProductByIMEI(shopId, [imei]);
    return products[0] || null;
  } catch (error) {
    console.error("Error fetching product by IMEI:", error);
    return null;
  }
};

/* ======================================================
   VALIDATE PRODUCT DATA (ENHANCED)
====================================================== */

export const validateProductData = (product) => {
  const errors = [];
  const warnings = [];
  
  if (!product.id) errors.push("Product ID is missing");
  if (!product.name) errors.push("Product name is missing");
  
  const mrp = safeNumber(product.mrp);
  if (mrp <= 0) {
    errors.push(`Invalid MRP: ${product.mrp}. MRP must be greater than 0`);
  }
  
  const gst = safeNumber(product.gst);
  if (gst < 0 || gst > 100) {
    errors.push(`Invalid GST percentage: ${product.gst}%. Must be between 0-100`);
  }
  
  const costPrice = safeNumber(product.costPrice);
  if (costPrice < 0) {
    errors.push(`Invalid cost price: ${product.costPrice}`);
  }
  
  if (costPrice > mrp && mrp > 0) {
    warnings.push(`Cost price (${costPrice}) is higher than MRP (${mrp}) - this will result in negative profit`);
  }
  
  const qty = safeNumber(product.qty, 1);
  if (qty <= 0) {
    errors.push(`Invalid quantity: ${product.qty}`);
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    data: {
      mrp,
      gst,
      costPrice,
      qty
    }
  };
};

/* ======================================================
   BUYER HANDLING (ENHANCED)
====================================================== */

export const getBuyerByPhone = async (shopId, phone) => {
  if (!phone || !validatePhone(phone)) {
    return null;
  }

  try {
    // Use query for better performance
    const buyersRef = ref(db, `shops/${shopId}/buyers`);
    const phoneQuery = query(buyersRef, orderByChild('phone'), equalTo(phone));
    const snap = await get(phoneQuery);

    if (!snap.exists()) return null;

    let found = null;
    snap.forEach((child) => {
      found = { id: child.key, ...child.val() };
    });
    
    return found;
  } catch (error) {
    console.error("Error fetching buyer:", error);
    return null;
  }
};

export const createBuyer = async (shopId, name, phone) => {
  if (!name || !name.trim()) {
    throw new Error("Buyer name is required");
  }

  if (!validatePhone(phone)) {
    throw new Error("Invalid phone number. Please enter 10 digits.");
  }

  // Check if buyer already exists
  const existingBuyer = await getBuyerByPhone(shopId, phone);
  if (existingBuyer) {
    throw new Error(`Buyer with phone number ${phone} already exists`);
  }

  const buyerRef = push(ref(db, `shops/${shopId}/buyers`));
  const now = Date.now();

  await set(buyerRef, {
    name: name.trim(),
    phone,
    createdAt: now,
    updatedAt: now,
    totalPurchases: 0,
    totalSpent: 0,
    lastPurchaseAt: now
  });

  return buyerRef.key;
};

/* ======================================================
   UPDATE BUYER
====================================================== */

export const updateBuyer = async (shopId, buyerId, data) => {
  if (!buyerId) throw new Error("Buyer ID is required");
  
  const buyerRef = ref(db, `shops/${shopId}/buyers/${buyerId}`);
  const buyerSnap = await get(buyerRef);
  
  if (!buyerSnap.exists()) {
    throw new Error("Buyer not found");
  }
  
  await update(buyerRef, {
    ...data,
    updatedAt: Date.now()
  });
};

/* ======================================================
   CALCULATE BILL TOTALS (FIXED)
====================================================== */

const calculateBillTotals = (items, discount = 0) => {
  let subtotal = 0;
  let gstTotal = 0;
  let costTotal = 0;
  let totalProfit = 0;
  const itemDetails = [];

  for (const item of Object.values(items)) {
    const validation = validateProductData(item);
    if (!validation.isValid) {
      throw new Error(`Invalid product data for ${item.name}: ${validation.errors.join(", ")}`);
    }

    const { mrp, gst, costPrice, qty } = validation.data;
    
    // Calculate per item
    const itemSubtotal = mrp * qty;
    const itemGST = (mrp * gst / 100) * qty;
    const itemCost = costPrice * qty;
    const itemProfit = (mrp - costPrice) * qty;

    subtotal += itemSubtotal;
    gstTotal += itemGST;
    costTotal += itemCost;
    totalProfit += itemProfit;

    itemDetails.push({
      ...item,
      subtotal: itemSubtotal,
      gstAmount: itemGST,
      profit: itemProfit
    });
  }

  // Apply discount (ensure discount doesn't exceed subtotal)
  const validDiscount = Math.min(Math.max(0, discount), subtotal);
  const totalAmount = subtotal + gstTotal - validDiscount;

  return {
    subtotal,
    gstTotal,
    costTotal,
    totalProfit,
    totalAmount,
    discount: validDiscount,
    itemDetails
  };
};

/* ======================================================
   FINALIZE BILL (FIXED & ENHANCED)
====================================================== */

export const finalizeBill = async ({
  shopId,
  items,
  cashierId,
  paymentMode,
  buyerId,
  discount = 0,
  notes = "",
  paymentReference = null
}) => {
  // Validate required inputs
  if (!shopId) throw new Error("Shop ID is required");
  if (!items || Object.keys(items).length === 0) throw new Error("Bill is empty");
  if (!cashierId) throw new Error("Cashier ID is required");
  if (!buyerId) throw new Error("Buyer ID is required");
  if (!paymentMode || !['cash', 'upi', 'card'].includes(paymentMode.toLowerCase())) {
    throw new Error("Invalid payment mode. Must be cash, upi, or card");
  }

  const billId = generateBillId();
  const now = Date.now();

  // Calculate totals
  const { subtotal, gstTotal, costTotal, totalProfit, totalAmount, discount: appliedDiscount, itemDetails } = 
    calculateBillTotals(items, discount);

  if (totalAmount <= 0) {
    throw new Error("Bill total amount must be greater than 0");
  }

  // Start a transaction for inventory updates
  const inventoryUpdates = [];

  for (const item of Object.values(items)) {
    const productId = item.id;
    const qty = safeNumber(item.qty, 1);
    const imeis = item.scannedIMEIs || [];

    // Stock update
    const stockRef = ref(db, `shops/${shopId}/products/${productId}/stock`);
    
    const stockResult = await runTransaction(stockRef, (currentStock) => {
      if (currentStock === null) {
        return { error: "Product not found" };
      }
      if (currentStock < qty) {
        return { error: `Insufficient stock. Available: ${currentStock}` };
      }
      return currentStock - qty;
    });

    if (stockResult.error) {
      throw new Error(`Stock update failed for ${item.name}: ${stockResult.error}`);
    }

    if (!stockResult.committed) {
      throw new Error(`Stock transaction failed for ${item.name}`);
    }

    inventoryUpdates.push({ productId, qty, newStock: stockResult.snapshot.val() });

    // IMEI sale protection
    for (const imei of imeis) {
      if (!validateIMEI(imei)) {
        throw new Error(`Invalid IMEI format: ${imei}`);
      }

      const imeiRef = ref(db, `shops/${shopId}/products/${productId}/soldIMEIs/${imei}`);
      
      const imeiResult = await runTransaction(imeiRef, (current) => {
        if (current) {
          throw new Error(`IMEI ${imei} is already sold`);
        }
        return {
          soldAt: now,
          billId: billId,
          buyerId: buyerId,
          soldBy: cashierId,
          price: item.mrp,
          paymentMode: paymentMode
        };
      });

      if (!imeiResult.committed) {
        throw new Error(`IMEI sale failed for: ${imei}`);
      }

      // Also remove from available IMEI index
      const imeiIndexRef = ref(db, `shops/${shopId}/imeiIndex/${imei}`);
      await set(imeiIndexRef, null);
    }

    // Update last sold timestamp
    await update(ref(db, `shops/${shopId}/products/${productId}`), {
      lastSoldAt: now,
      lastSoldPrice: item.mrp,
      totalSold: (item.totalSold || 0) + qty
    });
  }

  // Save bill
  const billRef = push(ref(db, `shops/${shopId}/bills`));

  const billData = {
    billId,
    buyerId,
    cashierId,
    paymentMode,
    paymentReference: paymentReference || null,
    subtotal: safeNumber(subtotal),
    gstTotal: safeNumber(gstTotal),
    discount: appliedDiscount,
    totalAmount: safeNumber(totalAmount),
    totalProfit: safeNumber(totalProfit),
    createdAt: now,
    notes: notes || null,
    items: itemDetails.map(item => ({
      id: item.id,
      name: item.name,
      mrp: safeNumber(item.mrp),
      gst: safeNumber(item.gst),
      costPrice: safeNumber(item.costPrice),
      qty: safeNumber(item.qty),
      scannedIMEIs: item.scannedIMEIs || [],
      brand: item.brand || "",
      model: item.model || "",
      subtotal: item.subtotal,
      gstAmount: item.gstAmount,
      profit: item.profit
    }))
  };

  await set(billRef, billData);

  // Update buyer statistics
  try {
    const buyerRef = ref(db, `shops/${shopId}/buyers/${buyerId}`);
    await runTransaction(buyerRef, (buyer) => {
      if (!buyer) return buyer;
      return {
        ...buyer,
        totalPurchases: (buyer.totalPurchases || 0) + 1,
        totalSpent: (buyer.totalSpent || 0) + totalAmount,
        lastPurchaseAt: now,
        updatedAt: now
      };
    });
  } catch (buyerError) {
    console.error("Failed to update buyer stats:", buyerError);
    // Don't throw - bill is already saved
  }

  // Accounting entries (with error handling)
  try {
    const paymentLedger = paymentMode === "cash" ? "cash" : "bank_account";

    // Sales Entry
    await createJournalEntry(shopId, {
      date: now,
      narration: `Sales Invoice ${billId} - ${paymentMode.toUpperCase()}`,
      reference: billId,
      entries: [
        {
          ledgerId: paymentLedger,
          type: "debit",
          amount: totalAmount,
          description: `Payment received via ${paymentMode}`
        },
        {
          ledgerId: "sales_account",
          type: "credit",
          amount: subtotal,
          description: `Sales revenue`
        },
        {
          ledgerId: "gst_payable",
          type: "credit",
          amount: gstTotal,
          description: `GST collected`
        }
      ]
    });

    // Cost of Goods Sold Entry
    if (costTotal > 0) {
      await createJournalEntry(shopId, {
        date: now,
        narration: `COGS for Invoice ${billId}`,
        reference: billId,
        entries: [
          {
            ledgerId: "cost_of_goods_sold",
            type: "debit",
            amount: costTotal,
            description: `Cost of inventory sold`
          },
          {
            ledgerId: "inventory_account",
            type: "credit",
            amount: costTotal,
            description: `Inventory reduction`
          }
        ]
      });
    }
  } catch (accountingError) {
    console.error("Accounting entry failed:", accountingError);
    // Log to error tracking system
    await logAccountingError(shopId, billId, accountingError);
  }

  // Return bill summary
  return {
    success: true,
    billId,
    billRef: billRef.key,
    subtotal,
    gstTotal,
    discount: appliedDiscount,
    totalAmount,
    totalProfit,
    itemsCount: Object.keys(items).length,
    timestamp: now,
    paymentMode,
    buyerId
  };
};

/* ======================================================
   LOG ACCOUNTING ERRORS
====================================================== */

const logAccountingError = async (shopId, billId, error) => {
  try {
    const errorRef = push(ref(db, `shops/${shopId}/errors/accounting`));
    await set(errorRef, {
      billId,
      error: error.message,
      stack: error.stack,
      timestamp: Date.now(),
      resolved: false
    });
  } catch (logError) {
    console.error("Failed to log accounting error:", logError);
  }
};

/* ======================================================
   CANCEL BILL (NEW FEATURE)
====================================================== */

export const cancelBill = async (shopId, billId, cashierId, reason) => {
  const billRef = ref(db, `shops/${shopId}/bills/${billId}`);
  const billSnap = await get(billRef);
  
  if (!billSnap.exists()) {
    throw new Error("Bill not found");
  }
  
  const bill = billSnap.val();
  
  if (bill.cancelled) {
    throw new Error("Bill is already cancelled");
  }
  
  // Restore inventory
  for (const item of bill.items) {
    const productRef = ref(db, `shops/${shopId}/products/${item.id}/stock`);
    await runTransaction(productRef, (currentStock) => {
      return (currentStock || 0) + item.qty;
    });
    
    // Restore IMEIs
    for (const imei of item.scannedIMEIs) {
      const imeiRef = ref(db, `shops/${shopId}/products/${item.id}/soldIMEIs/${imei}`);
      await set(imeiRef, null);
      
      const imeiIndexRef = ref(db, `shops/${shopId}/imeiIndex/${imei}`);
      await set(imeiIndexRef, item.id);
    }
  }
  
  // Mark bill as cancelled
  await update(billRef, {
    cancelled: true,
    cancelledAt: Date.now(),
    cancelledBy: cashierId,
    cancellationReason: reason
  });
  
  // Create reversal accounting entry
  try {
    await createJournalEntry(shopId, {
      date: Date.now(),
      narration: `Cancellation of Invoice ${bill.billId}`,
      reference: bill.billId,
      entries: [
        {
          ledgerId: "sales_account",
          type: "debit",
          amount: bill.subtotal
        },
        {
          ledgerId: "gst_payable",
          type: "debit",
          amount: bill.gstTotal
        },
        {
          ledgerId: "cash",
          type: "credit",
          amount: bill.totalAmount
        }
      ]
    });
  } catch (error) {
    console.error("Failed to create reversal entry:", error);
  }
  
  return { success: true, message: "Bill cancelled successfully" };
};

/* ======================================================
   GET BILL DETAILS (NEW FEATURE)
====================================================== */

export const getBillDetails = async (shopId, billId) => {
  const billRef = ref(db, `shops/${shopId}/bills/${billId}`);
  const billSnap = await get(billRef);
  
  if (!billSnap.exists()) {
    return null;
  }
  
  const bill = billSnap.val();
  
  // Get buyer details
  const buyerSnap = await get(ref(db, `shops/${shopId}/buyers/${bill.buyerId}`));
  const buyer = buyerSnap.exists() ? buyerSnap.val() : null;
  
  return {
    ...bill,
    buyer,
    id: billId
  };
};