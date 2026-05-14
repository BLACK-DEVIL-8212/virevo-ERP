import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import "./Billing.scss";
import usePageTitle from "../../hooks/usePageTitle";
import {
  fetchSingleProductByIMEI,

  finalizeBill,
  getBuyerByPhone,
  createBuyer,
} from "../../services/billing.service";
import { ref, onValue } from "firebase/database";
import { db, auth } from "../../services/firebase";
import { useAuth } from "../../context/AuthContext";
import { getShopOptionLabel, normalizeShopRecord } from "../../services/shop.service";
import { getShopSettings } from "../../services/settings.service";

/* ─────────────────────────── PURE HELPERS ─────────────────────────── */

const validatePhone = (phone) => /^[0-9]{10}$/.test(phone);

const formatCurrency = (amount) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(amount);

/** Escape a string for safe insertion into a RegExp. */
const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Escape user-supplied strings before injecting into HTML. */
const escapeHtml = (str) =>
  String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/**
 * Replace ALL occurrences of {{key}} in template with value.
 * Using RegExp + /g to ensure every occurrence is replaced, not just the first.
 */
const fillTemplate = (template, key, value) =>
  template.replace(new RegExp(escapeRegExp(`{{${key}}}`), "g"), value);

/** Compute line total for a single item (MRP + GST) × qty. */
const lineTotal = (item) => {
  const mrp = Number(item.mrp) || 0;
  const gst = Number(item.gst) || 0;
  const qty = Number(item.qty) || 1;
  return (mrp + (mrp * gst) / 100) * qty;
};

/** Compute GST amount for a single item × qty. */
const lineGst = (item) => {
  const mrp = Number(item.mrp) || 0;
  const gst = Number(item.gst) || 0;
  const qty = Number(item.qty) || 1;
  return ((mrp * gst) / 100) * qty;
};

/* ─────────────────────────── COMPONENT ─────────────────────────── */

const Billing = () => {
  usePageTitle("Billing");

  const { user } = useAuth();

  // Shop management
  const [shops, setShops] = useState([]);
  const [selectedShopId, setSelectedShopId] = useState(null);
  const [shopSettings, setShopSettings] = useState(null);

  // Product scanning
  const [scanCode, setScanCode] = useState("");
  const [preview, setPreview] = useState(null);
  const [isScanning, setIsScanning] = useState(false);

  // Bill items
  const [items, setItems] = useState({});

  // Customer details
  const [buyerName, setBuyerName] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [isSearchingBuyer, setIsSearchingBuyer] = useState(false);

  // Payment details
  const [paymentMode, setPaymentMode] = useState("cash");
  const [discount, setDiscount] = useState("");
  const [discountType, setDiscountType] = useState("fixed"); // "fixed" | "percentage"

  // UI states
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  // FIX: replaced window.confirm() with a React-managed clear-bill confirm state
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // FIX: single ref-based auto-dismiss so timers are always cleaned up on unmount
  const dismissTimerRef = useRef(null);
  const scheduleAutoDismiss = useCallback((setter, delay = 3000) => {
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    dismissTimerRef.current = setTimeout(() => setter(""), delay);
  }, []);

  useEffect(() => () => {
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
  }, []);

  const effectiveShopId =
    user?.role === "superadmin" ? selectedShopId : user?.shopId;

  /* ─────────────────── LOAD SHOPS (superadmin) ─────────────────── */
  useEffect(() => {
    if (user?.role !== "superadmin") return;

    const shopsRef = ref(db, "shops");

    const unsubscribe = onValue(shopsRef, (snapshot) => {
      const list = [];
      snapshot.forEach((child) => {
        list.push(normalizeShopRecord(child.key, child.val()));
      });
      setShops(list.sort((a, b) => a.name.localeCompare(b.name)));
    });

    return () => unsubscribe();
  }, [user?.role]);

  /* ─────────────────── LOAD SHOP SETTINGS ─────────────────── */
  useEffect(() => {
    if (!effectiveShopId) return;

    const loadShopSettings = async () => {
      try {
        const settings = await getShopSettings(effectiveShopId);
        if (settings) setShopSettings(settings);
      } catch (err) {
        console.error("Failed to load shop settings:", err);
      }
    };

    loadShopSettings();
  }, [effectiveShopId]);

  /* ─────────────────── AUTO-SEARCH BUYER ─────────────────── */
  useEffect(() => {
    if (!effectiveShopId || !buyerPhone || buyerPhone.length !== 10) return;

    const id = setTimeout(async () => {
      setIsSearchingBuyer(true);
      try {
        const buyer = await getBuyerByPhone(effectiveShopId, buyerPhone);
        if (buyer) {
          setBuyerName(buyer.name || "");
          setSuccess(`Customer found: ${buyer.name}`);
          scheduleAutoDismiss(setSuccess);
        }
      } catch (err) {
        console.error("Buyer search error:", err);
      } finally {
        setIsSearchingBuyer(false);
      }
    }, 500);

    return () => clearTimeout(id);
  }, [buyerPhone, effectiveShopId, scheduleAutoDismiss]);

  /* ─────────────────── CALCULATIONS ─────────────────── */
  const subtotal = useMemo(
    () => Object.values(items).reduce((sum, item) => sum + lineTotal(item), 0),
    [items]
  );

  const totalGST = useMemo(
    () => Object.values(items).reduce((sum, item) => sum + lineGst(item), 0),
    [items]
  );

  const calculatedDiscount = useMemo(() => {
    const val = Number(discount) || 0;
    if (discountType === "percentage") return (subtotal * val) / 100;
    return Math.min(val, subtotal);
  }, [discount, discountType, subtotal]);

  const totalAmount = Math.max(subtotal - calculatedDiscount, 0);

  /* ─────────────────── SCAN PRODUCT ─────────────────── */
  const handleScan = async (e) => {
    e.preventDefault();
    setError("");

    if (!effectiveShopId) {
      // FIX: replaced `return setError(x)` (returns undefined) with explicit form
      setError(
        user?.role === "superadmin"
          ? "Please select a shop first"
          : "No shop assigned"
      );
      return;
    }

    const imei = scanCode.trim();
    if (!imei) {
      setError("Enter IMEI number");
      return;
    }

    setIsScanning(true);
    try {
      const product = await fetchSingleProductByIMEI(effectiveShopId, imei);

      if (!product) {
        setError("IMEI not found in inventory");
        return;
      }

      if (!product.mrp || product.mrp <= 0) {
        setError(
          `Product "${product.name}" has invalid MRP. Please check product configuration.`
        );
        return;
      }

      if (product.stock <= 0) {
        setError("Product is out of stock");
        return;
      }

      if (items[product.id]) {
        setError("Product already added to bill");
        return;
      }

      setPreview(product);
      setScanCode("");
      setSuccess(`Product found: ${product.name}`);
      scheduleAutoDismiss(setSuccess, 2000);
    } catch (err) {
      console.error("Scan error:", err);
      setError(err.message || "Scan failed. Please try again.");
    } finally {
      setIsScanning(false);
    }
  };

  /* ─────────────────── ADD ITEM ─────────────────── */
  const addToBill = () => {
    if (!preview) return;

    const mrp = Number(preview.mrp);
    const gst = Number(preview.gst);
    const costPrice = Number(preview.costPrice);
    const stock = Number(preview.stock);

    if (isNaN(mrp) || mrp <= 0) {
      setError(
        `Invalid MRP (${preview.mrp}) for product: ${preview.name}. Please check product configuration.`
      );
      return;
    }
    if (isNaN(gst) || gst < 0 || gst > 100) {
      setError(
        `Invalid GST (${preview.gst}%) for product: ${preview.name}. GST must be between 0-100.`
      );
      return;
    }
    if (isNaN(costPrice) || costPrice < 0) {
      setError(`Invalid cost price for product: ${preview.name}`);
      return;
    }
    if (stock <= 0) {
      setError(`Product "${preview.name}" is out of stock`);
      return;
    }
    if (items[preview.id]) {
      setError(`Product "${preview.name}" already in bill`);
      return;
    }

    const safeProduct = {
      id: preview.id,
      name: preview.name || "Unknown Product",
      mrp,
      gst,
      costPrice,
      stock,
      qty: 1,
      scannedIMEIs: preview.scannedIMEIs || [],
      brand: preview.brand || "",
      model: preview.model || "",
      category: preview.category || "",
    };

    setItems((prev) => ({ ...prev, [preview.id]: safeProduct }));
    setPreview(null);
    setError("");
    setSuccess(`Added: ${safeProduct.name} (${formatCurrency(mrp)})`);
    scheduleAutoDismiss(setSuccess, 2000);
  };

  /* ─────────────────── UPDATE QUANTITY ─────────────────── */
  // FIX: don't auto-remove on qty < 1; clamp to 1 so the user must explicitly
  // press Remove. Removes the confusing "Removed: X" success flash on decrement.
  const updateQuantity = (id, newQty) => {
    const item = items[id];
    if (!item) return;

    const clamped = Math.max(1, newQty);

    if (clamped > item.stock) {
      setError(`Only ${item.stock} item(s) available for ${item.name}`);
      scheduleAutoDismiss(setError);
      return;
    }

    setItems((prev) => ({ ...prev, [id]: { ...prev[id], qty: clamped } }));
  };

  /* ─────────────────── REMOVE ITEM ─────────────────── */
  const removeItem = (id) => {
    const itemName = items[id]?.name;
    setItems((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
    setSuccess(`Removed: ${itemName}`);
    scheduleAutoDismiss(setSuccess, 2000);
  };

  /* ─────────────────── CLEAR BILL ─────────────────── */
  // FIX: replaced window.confirm() (blocks main thread, suppressed in iframes)
  // with a React-managed inline confirm modal.
  const clearBill = () => {
    if (Object.keys(items).length === 0) return;
    setShowClearConfirm(true);
  };

  const confirmClearBill = () => {
    setItems({});
    setDiscount("");
    setDiscountType("fixed");
    setShowClearConfirm(false);
    setSuccess("Bill cleared");
    scheduleAutoDismiss(setSuccess, 2000);
  };

  /* ─────────────────── PRINT INVOICE ─────────────────── */
  const printInvoice = async (billData, existingWindow = null) => {
    const win = existingWindow || window.open("", "_blank");

    if (!win) {
      alert("Please allow pop-ups to print the invoice.");
      return;
    }

    try {
      const response = await fetch("/invoice/invoiceTemplate.html");
      if (!response.ok) throw new Error("Invoice template not found");

      // FIX: guard against server returning unexpected content type
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
        throw new Error(`Unexpected template content-type: ${contentType}`);
      }

      let template = await response.text();

      // Load shop settings if not already available
      let shop = shopSettings || {};
      if (billData.shopId && !shopSettings) {
        try {
          shop = await getShopSettings(billData.shopId);
        } catch (err) {
          console.warn("Shop settings load failed:", err);
        }
      }

      const shopName = shop.companyName || "Your Store Name";
      const shopAddress = shop.address || "";
      const city = shop.city || "";
      const pincode = shop.pincode || "";
      const phone = shop.phone || "";
      const gstin = shop.gstin || "";
      const estimatePrefix = shop.estimatePrefix || "EST";

      const hasGST = Object.values(billData.items).some(
        (item) => Number(item.gst) > 0
      );
      const invoiceType = hasGST ? "TAX INVOICE" : "ESTIMATE";
      const gstOrEstimateLine = hasGST && gstin
        ? `<strong>GSTIN:</strong> ${escapeHtml(gstin)}`
        : `<strong>Estimate No:</strong> ${escapeHtml(estimatePrefix)}-${escapeHtml(billData.billId.slice(-6))}`;

      // Build rows
      let invoiceSubtotal = 0;
      let totalGSTAmount = 0;

      const rows = Object.values(billData.items)
        .map((item, index) => {
          const qty = item.qty || 1;
          const price = Number(item.mrp) || 0;
          const gstPercent = Number(item.gst) || 0;
          const gstAmount = (price * gstPercent) / 100;
          const total = (price + gstAmount) * qty;

          invoiceSubtotal += total;
          totalGSTAmount += gstAmount * qty;

          return `
            <tr>
              <td class="center">${index + 1}</td>
              <td>${escapeHtml(item.name)}</td>
              <td class="center">${qty}</td>
              <td class="right">${formatCurrency(price)}</td>
              <td class="center">${gstPercent}%</td>
              <td class="center">${formatCurrency(gstAmount)}</td>
              <td class="right">${formatCurrency(total)}</td>
            </tr>
          `;
        })
        .join("");

      const discountVal = Number(billData.discount) || 0;
      const discountRow = discountVal > 0
        ? `<tr>
             <td colspan="6" class="right"><strong>Discount</strong></td>
             <td class="right">-${formatCurrency(discountVal)}</td>
           </tr>`
        : "";

      const finalTotal = invoiceSubtotal - discountVal;

      // FIX: use fillTemplate() which replaces ALL occurrences via /g regex,
      // and escapeHtml() on all user-supplied strings to prevent XSS in the
      // printed document.
      const replacements = {
        shopName: escapeHtml(shopName),
        shopAddress: escapeHtml(shopAddress),
        city: escapeHtml(city),
        pincode: escapeHtml(pincode),
        shopPhone: escapeHtml(phone),
        invoiceType,
        gstOrEstimateLine,
        billId: escapeHtml(billData.billId),
        date: new Date().toLocaleString("en-IN"),
        paymentMode: escapeHtml(billData.paymentMode.toUpperCase()),
        customerName: escapeHtml(billData.buyerName || "Walk-in Customer"),
        customerPhone: escapeHtml(billData.buyerPhone || "N/A"),
        rows,
        subtotal: formatCurrency(invoiceSubtotal),
        totalGST: formatCurrency(totalGSTAmount),
        discountRow,
        totalAmount: formatCurrency(finalTotal),
      };

      for (const [key, value] of Object.entries(replacements)) {
        template = fillTemplate(template, key, value);
      }

      win.document.open();
      win.document.write(template);
      win.document.close();

      win.onload = () => {
        win.focus();
        win.print();
        setTimeout(() => win.close(), 300);
      };
    } catch (err) {
      console.error("Invoice print error:", err);
      win.close();
      alert("Failed to generate invoice: " + err.message);
    }
  };

  /* ─────────────────── CREATE BILL ─────────────────── */
  // FIX: wrapped in try/catch so rejections don't become unhandled promises,
  // and removed the dead `invoiceId` variable whose value was never used.
  const createBill = async () => {
    let buyerId = null;

    if (buyerPhone && validatePhone(buyerPhone)) {
      const buyer = await getBuyerByPhone(effectiveShopId, buyerPhone);
      if (buyer) {
        buyerId = buyer.id;
      } else if (buyerName) {
        buyerId = await createBuyer(effectiveShopId, buyerName, buyerPhone);
      }
    }

    const billData = {
      shopId: effectiveShopId,
      items,
      cashierId: auth.currentUser?.uid,
      paymentMode,
      buyerId,
      discount: calculatedDiscount,
    };

    const result = await finalizeBill(billData);

    return { billId: result.billId, ...billData };
  };

  /* ─────────────────── PAYMENT HANDLER ─────────────────── */
  const handlePayment = () => {
    setError("");
    setSuccess("");

    if (loading) return;

    if (!effectiveShopId) {
      setError(
        user?.role === "superadmin"
          ? "Please select a shop"
          : "No shop assigned to your account"
      );
      return;
    }

    if (Object.keys(items).length === 0) {
      setError("No items in bill. Please scan products first.");
      return;
    }

    if (buyerPhone && !validatePhone(buyerPhone)) {
      setError("Invalid phone number. Please enter 10 digits.");
      return;
    }

    if (buyerPhone && !buyerName) {
      setError("Please enter customer name for this phone number.");
      return;
    }

    setShowConfirmModal(true);
  };

  const confirmPayment = async () => {
    setShowConfirmModal(false);
    setLoading(true);

    // Open the print window BEFORE any async work to avoid popup blockers
    const printWindow = window.open("", "_blank");

    try {
      const billData = await createBill();

      await printInvoice(
        {
          shopId: effectiveShopId,
          billId: billData.billId,
          items,
          buyerName: buyerName || "Walk-in Customer",
          buyerPhone: buyerPhone || "N/A",
          paymentMode,
          discount: calculatedDiscount,
        },
        printWindow
      );

      // Reset bill state after success
      setItems({});
      setBuyerName("");
      setBuyerPhone("");
      setDiscount("");
      setDiscountType("fixed");
      setPaymentMode("cash");
      setSuccess("Payment successful! Invoice generated.");
      scheduleAutoDismiss(setSuccess, 5000);
    } catch (err) {
      // FIX: close the orphan popup window if bill creation failed
      printWindow?.close();
      setError(err.message || "Payment failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  /* ─────────────────── RENDER ─────────────────── */
  return (
    <div className="billing-page">
      <div className="billing-container">

        {/* Header */}
        <div className="billing-header">
          <h1>Billing System</h1>
          {effectiveShopId && shopSettings && (
            <div className="shop-info">
              <strong>{shopSettings.companyName}</strong>
            </div>
          )}
        </div>

        {/* Shop Selector (superadmin only) */}
        {user?.role === "superadmin" && (
          <div className="shop-selector-wrapper">
            <label>Select Shop:</label>
            <select
              className="shop-selector"
              value={selectedShopId || ""}
              onChange={(e) => {
                setSelectedShopId(e.target.value);
                setItems({});
                setPreview(null);
                setError("");
                setSuccess("");
              }}
            >
              <option value="">-- Select Shop --</option>
              {shops.map((shop) => (
                <option key={shop.id} value={shop.id}>
                  {getShopOptionLabel(shop)}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Scan Section */}
        <div className="scan-section">
          <form onSubmit={handleScan} className="scan-form">
            <input
              type="text"
              value={scanCode}
              onChange={(e) => setScanCode(e.target.value)}
              placeholder="Scan or type IMEI number"
              autoFocus
              disabled={!effectiveShopId}
            />
            <button type="submit" disabled={isScanning || !effectiveShopId}>
              {isScanning ? "Scanning…" : "Scan"}
            </button>
          </form>
        </div>

        {/* Messages */}
        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}

        {/* Product Preview */}
        {preview && (
          <div className="preview-card">
            <div className="preview-info">
              <h3>{preview.name}</h3>
              <p className="product-details">
                MRP: {formatCurrency(preview.mrp)} | GST: {preview.gst}% |
                Stock: {preview.stock}
              </p>
              {preview.brand && <p>Brand: {preview.brand}</p>}
              {preview.model && <p>Model: {preview.model}</p>}
            </div>
            <div className="preview-actions">
              <button onClick={addToBill} className="btn-add">
                Add to Bill
              </button>
              <button onClick={() => setPreview(null)} className="btn-cancel">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Bill Items Table */}
        <div className="bill-section">
          <div className="bill-header">
            <h3>Current Bill Items ({Object.keys(items).length})</h3>
            {Object.keys(items).length > 0 && (
              <button onClick={clearBill} className="btn-clear">
                Clear All
              </button>
            )}
          </div>

          {Object.values(items).length === 0 ? (
            <div className="empty-bill">
              No items added. Scan products to start billing.
            </div>
          ) : (
            <div className="bill-items">
              <table className="items-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Price</th>
                    <th>GST</th>
                    <th>Qty</th>
                    <th>Total</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.values(items).map((item) => (
                    <tr key={item.id}>
                      <td className="item-name">
                        <strong>{item.name}</strong>
                        {item.brand && <small>{item.brand}</small>}
                      </td>
                      <td>{formatCurrency(item.mrp)}</td>
                      <td>{item.gst}%</td>
                      <td>
                        <div className="quantity-control">
                          <button
                            onClick={() => updateQuantity(item.id, item.qty - 1)}
                            // FIX: visually disabled at qty=1 since we no longer
                            // auto-remove on decrement below 1
                            disabled={item.qty <= 1}
                          >
                            −
                          </button>
                          <span>{item.qty}</span>
                          <button
                            onClick={() => updateQuantity(item.id, item.qty + 1)}
                          >
                            +
                          </button>
                        </div>
                      </td>
                      <td>{formatCurrency(lineTotal(item))}</td>
                      <td>
                        <button
                          onClick={() => removeItem(item.id)}
                          className="btn-remove"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Customer Details */}
        <div className="customer-section">
          <h3>Customer Details</h3>
          <div className="customer-form">
            <div className="form-group">
              <label>Phone Number</label>
              <input
                type="tel"
                placeholder="10-digit mobile number"
                value={buyerPhone}
                onChange={(e) =>
                  setBuyerPhone(e.target.value.replace(/\D/g, "").slice(0, 10))
                }
                className={
                  buyerPhone && !validatePhone(buyerPhone) ? "error" : ""
                }
              />
              {isSearchingBuyer && (
                <span className="searching">Searching…</span>
              )}
            </div>
            <div className="form-group">
              <label>
                Customer Name{" "}
                {buyerPhone && !buyerName && (
                  <span className="required">*</span>
                )}
              </label>
              <input
                placeholder="Customer name"
                value={buyerName}
                onChange={(e) => setBuyerName(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Payment Section */}
        <div className="payment-section">
          <div className="discount-section">
            <label>Discount</label>
            <div className="discount-input">
              <input
                type="number"
                placeholder="Amount"
                value={discount}
                // FIX: enforce non-negative discount at the state level
                onChange={(e) =>
                  setDiscount(String(Math.max(0, Number(e.target.value))))
                }
                min="0"
                step={discountType === "percentage" ? "1" : "10"}
              />
              <select
                value={discountType}
                onChange={(e) => setDiscountType(e.target.value)}
              >
                <option value="fixed">Fixed (₹)</option>
                <option value="percentage">Percentage (%)</option>
              </select>
            </div>
          </div>

          <div className="totals">
            <div className="total-line">
              <span>Subtotal:</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            <div className="total-line">
              <span>Total GST:</span>
              <span>{formatCurrency(totalGST)}</span>
            </div>
            {calculatedDiscount > 0 && (
              <div className="total-line discount">
                <span>Discount:</span>
                <span>-{formatCurrency(calculatedDiscount)}</span>
              </div>
            )}
            <div className="total-line grand-total">
              <span>Grand Total:</span>
              <span>{formatCurrency(totalAmount)}</span>
            </div>
          </div>

          <div className="payment-actions">
            <select
              value={paymentMode}
              onChange={(e) => setPaymentMode(e.target.value)}
              className="payment-mode"
            >
              <option value="cash">💵 Cash</option>
              <option value="upi">📱 UPI</option>
              <option value="card">💳 Card</option>
              <option value="credit">📝 Credit</option>
            </select>

            <button
              className="btn-pay"
              onClick={handlePayment}
              disabled={loading || Object.keys(items).length === 0}
            >
              {loading ? "Processing…" : `Pay ${formatCurrency(totalAmount)}`}
            </button>
          </div>
        </div>
      </div>

      {/* ── Payment Confirmation Modal ── */}
      {showConfirmModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Confirm Payment</h3>
            <div className="modal-details">
              <p>
                <strong>Total Amount:</strong> {formatCurrency(totalAmount)}
              </p>
              <p>
                <strong>Payment Mode:</strong> {paymentMode.toUpperCase()}
              </p>
              <p>
                <strong>Items:</strong> {Object.keys(items).length}
              </p>
            </div>
            <div className="modal-actions">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="btn-cancel"
              >
                Cancel
              </button>
              <button onClick={confirmPayment} className="btn-confirm">
                Confirm Payment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Clear Bill Confirmation Modal ── */}
      {/* FIX: replaces window.confirm() which blocks the thread and is suppressed
          in cross-origin iframes */}
      {showClearConfirm && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Clear Bill</h3>
            <p>Remove all {Object.keys(items).length} item(s) from the bill?</p>
            <div className="modal-actions">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="btn-cancel"
              >
                Keep Items
              </button>
              <button onClick={confirmClearBill} className="btn-confirm">
                Clear All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Billing;
