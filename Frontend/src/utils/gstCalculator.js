/**
 * Calculate GST amount from MRP
 * Assumes MRP is GST-INCLUSIVE (most retail products)
 *
 * @param {number} mrp - MRP including GST
 * @param {number} gstPercent - GST percentage (e.g. 5, 12, 18)
 * @returns {number} GST amount per unit
 */
export const calculateGST = (mrp, gstPercent) => {
  if (!gstPercent || gstPercent <= 0) return 0;

  const gstAmount = mrp - mrp / (1 + gstPercent / 100);

  return roundToTwo(gstAmount);
};

/**
 * Get base price (price without GST)
 *
 * @param {number} mrp - GST-inclusive MRP
 * @param {number} gstPercent
 * @returns {number} Base price
 */
export const getBasePrice = (mrp, gstPercent) => {
  if (!gstPercent || gstPercent <= 0) return mrp;

  const basePrice = mrp / (1 + gstPercent / 100);
  return roundToTwo(basePrice);
};

/**
 * Helper: round to 2 decimal places
 */
const roundToTwo = (value) => {
  return Math.round(value * 100) / 100;
};
