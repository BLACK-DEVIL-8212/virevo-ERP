import { fetchLedgers } from "./ledger.service";

/* ===============================
   SAFE NUMBER
================================ */

const safeNumber = (value) => {

  const n = Number(value);

  if (Number.isNaN(n)) return 0;

  return Number(n.toFixed(2));

};

/* ===============================
   VALID LEDGER TYPES
================================ */

const VALID_TYPES = [
  "asset",
  "liability",
  "income",
  "expense",
  "equity"
];

/* ===============================
   GET TRIAL BALANCE
================================ */

export const getTrialBalance = async (shopId) => {

  if (!shopId) {
    throw new Error("Shop ID is required");
  }

  try {

    const ledgers = await fetchLedgers(shopId);

    if (!Array.isArray(ledgers)) {
      throw new Error("Invalid ledger data");
    }

    let debitTotal = 0;
    let creditTotal = 0;

    const normalizedLedgers = [];

    for (const ledger of ledgers) {

      const balance = safeNumber(ledger.balance || 0);

      const ledgerType = VALID_TYPES.includes(ledger.type)
        ? ledger.type
        : "unknown";

      if (balance >= 0) {
        debitTotal += balance;
      } else {
        creditTotal += Math.abs(balance);
      }

      normalizedLedgers.push({
        id: ledger.id,
        name: ledger.name || "Unnamed Ledger",
        type: ledgerType,
        balance
      });

    }

    debitTotal = safeNumber(debitTotal);
    creditTotal = safeNumber(creditTotal);

    const difference = safeNumber(debitTotal - creditTotal);

    const balanced = difference === 0;

    return {

      ledgers: normalizedLedgers.sort((a, b) =>
        a.name.localeCompare(b.name)
      ),

      debit: debitTotal,

      credit: creditTotal,

      balanced,

      difference,

      integrity: balanced
        ? "OK"
        : "Trial balance mismatch detected"

    };

  } catch (err) {

    console.error("Trial balance error:", err);

    throw new Error("Failed to generate trial balance");

  }

};

/* ===============================
   TRIAL BALANCE VALIDATOR
================================ */

export const validateTrialBalance = async (shopId) => {

  const tb = await getTrialBalance(shopId);

  if (!tb.balanced) {

    throw new Error(
      `Accounting mismatch: difference ${tb.difference}`
    );

  }

  return true;

};