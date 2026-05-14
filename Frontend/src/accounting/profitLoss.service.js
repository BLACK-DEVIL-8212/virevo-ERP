import { fetchLedgers } from "./ledger.service";

/* ===============================
   SAFE NUMBER
================================ */

const safeNumber = (value) => {

  const n = Number(value);

  if (!Number.isFinite(n)) return 0;

  return Number(n.toFixed(2));

};

/* ===============================
   PROFIT & LOSS REPORT
================================ */

export const getProfitLoss = async (shopId) => {

  try {

    if (!shopId) {
      throw new Error("Missing shopId");
    }

    const ledgers = await fetchLedgers(shopId);

    if (!Array.isArray(ledgers)) {
      return {
        income: 0,
        expense: 0,
        profit: 0,
        incomeLedgers: [],
        expenseLedgers: []
      };
    }

    let totalIncome = 0;
    let totalExpense = 0;

    const incomeLedgers = [];
    const expenseLedgers = [];

    ledgers.forEach((ledger) => {

      if (!ledger) return;

      const balance = safeNumber(ledger.balance);

      if (ledger.type === "income") {

        const value = Math.abs(balance);

        totalIncome += value;

        incomeLedgers.push({
          id: ledger.id,
          name: ledger.name,
          amount: value
        });

      }

      if (ledger.type === "expense") {

        const value = Math.abs(balance);

        totalExpense += value;

        expenseLedgers.push({
          id: ledger.id,
          name: ledger.name,
          amount: value
        });

      }

    });

    const profit = safeNumber(totalIncome - totalExpense);

    return {

      income: safeNumber(totalIncome),

      expense: safeNumber(totalExpense),

      profit,

      incomeLedgers,

      expenseLedgers

    };

  } catch (err) {

    console.error("Profit & Loss calculation failed:", err);

    return {
      income: 0,
      expense: 0,
      profit: 0,
      incomeLedgers: [],
      expenseLedgers: []
    };

  }

};