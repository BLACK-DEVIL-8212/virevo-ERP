import {
  calculateProfit,
  calculateProfitMargin,
  calculateProfitAfterDiscount,
  calculateBulkProfit,
  getProfitCategory
} from './profitCalculator';

// Basic profit calculation
const profit = calculateProfit(500, 1000, 18);
console.log(`Profit per unit: ₹${profit}`);

// Profit margin analysis
const margin = calculateProfitMargin(1000, 500, 18);
console.log(`Margin: ${margin.marginPercent}%`);
console.log(`Markup: ${margin.markupPercent}%`);

// Profit after discount
const discountedProfit = calculateProfitAfterDiscount(500, 1000, 10, 18);
console.log(`Profit after 10% discount: ₹${discountedProfit.profit}`);

// Bulk profit calculation
const bulkItems = [
  { costPrice: 500, mrp: 1000, gstPercent: 18, qty: 5 },
  { costPrice: 300, mrp: 600, gstPercent: 18, qty: 3 }
];
const bulkProfit = calculateBulkProfit(bulkItems);
console.log(`Total profit: ₹${bulkProfit.totalProfit}`);

// Get profit category
const category = getProfitCategory(25);
console.log(`Category: ${category.category}`);
console.log(`Recommendation: ${category.recommendation}`);

// Price for desired margin
const pricing = calculatePriceForMargin(500, 30, 18);
console.log(`Suggested selling price: ₹${pricing.sellingPriceIncludingGST}`);