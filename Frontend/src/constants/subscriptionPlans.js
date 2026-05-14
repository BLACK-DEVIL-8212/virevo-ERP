// src/constants/subscriptionPlans.js

export const SUBSCRIPTION_PLANS = [
  {
    id: "BASIC",
    name: "Basic",
    price: 799,
    duration: "month",
    durationMonths: 1,
    features: [
      "Billing System",
      "Inventory Tracking",
      "Basic Reports",
      "Up to 500 Products",
      "Up to 3 Staff Members",
      "Email Support"
    ],
    popular: false,
    color: "#3B82F6",
    icon: "🚀"
  },
  {
    id: "PRO",
    name: "Pro",
    price: 1499,
    duration: "month",
    durationMonths: 1,
    features: [
      "Everything in Basic",
      "Employee Management",
      "Advanced Reports",
      "Unlimited Products",
      "Up to 10 Staff Members",
      "Priority Support",
      "GST Reports",
      "Profit/Loss Analysis"
    ],
    popular: true,
    color: "#8B5CF6",
    icon: "💎"
  },
  {
    id: "ENTERPRISE",
    name: "Enterprise",
    price: 15999,
    duration: "year",
    durationMonths: 12,
    features: [
      "Everything in Pro",
      "Multi-Store Support",
      "Priority Support",
      "Unlimited Staff Members",
      "Dedicated Account Manager",
      "API Access",
      "Custom Integration",
      "White-label Solution",
      "24/7 Phone Support"
    ],
    popular: false,
    color: "#10B981",
    icon: "🏢"
  }
];

// Yearly plan (12 months for the price of 10)
export const YEARLY_PLANS = [
  {
    id: "BASIC_YEARLY",
    name: "Basic (Yearly)",
    basePlan: "BASIC",
    price: 7990, // 10 months price for 12 months
    duration: "year",
    durationMonths: 12,
    features: SUBSCRIPTION_PLANS.find(p => p.id === "BASIC").features,
    popular: false,
    savings: "Save 16%",
    color: "#3B82F6",
    icon: "🚀"
  },
  {
    id: "PRO_YEARLY",
    name: "Pro (Yearly)",
    basePlan: "PRO",
    price: 14990, // 10 months price for 12 months
    duration: "year",
    durationMonths: 12,
    features: SUBSCRIPTION_PLANS.find(p => p.id === "PRO").features,
    popular: true,
    savings: "Save 16%",
    color: "#8B5CF6",
    icon: "💎"
  },
  {
    id: "ENTERPRISE_YEARLY",
    name: "Enterprise (Yearly)",
    basePlan: "ENTERPRISE",
    price: 159990, // 10 months price for 12 months
    duration: "year",
    durationMonths: 12,
    features: SUBSCRIPTION_PLANS.find(p => p.id === "ENTERPRISE").features,
    popular: false,
    savings: "Save 16%",
    color: "#10B981",
    icon: "🏢"
  }
];

// All plans combined
export const ALL_PLANS = [...SUBSCRIPTION_PLANS, ...YEARLY_PLANS];

// Helper function to get plan details by ID
export const getPlanDetails = (planId) => {
  return ALL_PLANS.find(plan => plan.id === planId);
};

// Helper function to get plan by base plan ID and duration
export const getPlanByBaseAndDuration = (basePlanId, duration = "month") => {
  if (duration === "month") {
    return SUBSCRIPTION_PLANS.find(plan => plan.id === basePlanId);
  } else {
    return YEARLY_PLANS.find(plan => plan.basePlan === basePlanId);
  }
};

// Calculate GST amount
export const calculateGST = (amount, rate = 18) => {
  return (amount * rate) / 100;
};

// Calculate total amount with GST
export const calculateTotalWithGST = (amount, rate = 18) => {
  const gst = calculateGST(amount, rate);
  return amount + gst;
};

// Calculate savings between monthly and yearly
export const calculateYearlySavings = (monthlyPlanId) => {
  const monthlyPlan = SUBSCRIPTION_PLANS.find(p => p.id === monthlyPlanId);
  const yearlyPlan = YEARLY_PLANS.find(p => p.basePlan === monthlyPlanId);
  
  if (!monthlyPlan || !yearlyPlan) return 0;
  
  const yearlyCostMonthly = monthlyPlan.price * 12;
  const savings = yearlyCostMonthly - yearlyPlan.price;
  const savingsPercentage = (savings / yearlyCostMonthly) * 100;
  
  return {
    amount: savings,
    percentage: Math.round(savingsPercentage)
  };
};

// Format price for display
export const formatPrice = (price) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(price);
};

// Get subscription status
export const getSubscriptionStatus = (expiryDate) => {
  if (!expiryDate) return "inactive";
  
  const now = new Date();
  const expiry = new Date(expiryDate);
  const daysUntilExpiry = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
  
  if (daysUntilExpiry < 0) return "expired";
  if (daysUntilExpiry <= 7) return "expiring_soon";
  return "active";
};

// Get status color and text
export const getStatusInfo = (expiryDate) => {
  const status = getSubscriptionStatus(expiryDate);
  
  switch(status) {
    case "active":
      return { text: "Active", color: "#10B981", bg: "#D1FAE5" };
    case "expiring_soon":
      return { text: "Expiring Soon", color: "#F59E0B", bg: "#FEF3C7" };
    case "expired":
      return { text: "Expired", color: "#EF4444", bg: "#FEE2E2" };
    default:
      return { text: "Inactive", color: "#6B7280", bg: "#F3F4F6" };
  }
};

// Calculate days until expiry
export const getDaysUntilExpiry = (expiryDate) => {
  if (!expiryDate) return null;
  
  const now = new Date();
  const expiry = new Date(expiryDate);
  const days = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
  
  return days;
};

// Get available upgrades from current plan
export const getAvailableUpgrades = (currentPlanId) => {
  const planOrder = ["BASIC", "PRO", "ENTERPRISE"];
  const currentIndex = planOrder.findIndex(id => id === currentPlanId);
  
  if (currentIndex === -1) return [];
  
  return planOrder.slice(currentIndex + 1).map(planId => {
    return SUBSCRIPTION_PLANS.find(p => p.id === planId);
  });
};

// Check if plan can be downgraded
export const getAvailableDowngrades = (currentPlanId) => {
  const planOrder = ["BASIC", "PRO", "ENTERPRISE"];
  const currentIndex = planOrder.findIndex(id => id === currentPlanId);
  
  if (currentIndex === -1) return [];
  
  return planOrder.slice(0, currentIndex).map(planId => {
    return SUBSCRIPTION_PLANS.find(p => p.id === planId);
  });
};

// Calculate prorated amount for plan change
export const calculateProratedAmount = (currentPlan, newPlan, daysRemaining) => {
  if (!currentPlan || !newPlan) return 0;
  
  const currentDailyRate = currentPlan.price / 30;
  const newDailyRate = newPlan.price / 30;
  const refundAmount = currentDailyRate * daysRemaining;
  const newPlanCost = newDailyRate * daysRemaining;
  
  if (newPlan.price > currentPlan.price) {
    // Upgrade: Customer pays the difference
    return newPlanCost - refundAmount;
  } else {
    // Downgrade: Customer gets refund
    return refundAmount - newPlanCost;
  }
};

// Export all as default
const subscriptionPlans = {
  SUBSCRIPTION_PLANS,
  YEARLY_PLANS,
  ALL_PLANS,
  getPlanDetails,
  getPlanByBaseAndDuration,
  calculateGST,
  calculateTotalWithGST,
  calculateYearlySavings,
  formatPrice,
  getSubscriptionStatus,
  getStatusInfo,
  getDaysUntilExpiry,
  getAvailableUpgrades,
  getAvailableDowngrades,
  calculateProratedAmount
};

export default subscriptionPlans;