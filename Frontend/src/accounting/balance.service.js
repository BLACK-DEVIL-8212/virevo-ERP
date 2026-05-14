import { db } from "../services/firebase";
import { ref, runTransaction } from "firebase/database";

/* ===============================
   SAFE NUMBER
================================ */

const safeNumber = (value) => {
  const n = Number(value);
  if (Number.isNaN(n)) return 0;
  return Number(n.toFixed(2));
};

/* ===============================
   UPDATE LEDGER BALANCES
================================ */

export const updateLedgerBalances = async (shopId, entries = []) => {

  if (!shopId) {
    throw new Error("Shop ID is required");
  }

  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error("Journal entries required");
  }

  try {

    const updates = entries.map(async (entry) => {

      if (!entry.ledgerId) return;

      const ledgerBalanceRef = ref(
        db,
        `shops/${shopId}/accounting/ledgers/${entry.ledgerId}/balance`
      );

      const amount = safeNumber(entry.amount);

      if (amount <= 0) return;

      await runTransaction(ledgerBalanceRef, (currentBalance) => {

        const balance = safeNumber(currentBalance);

        if (entry.type === "debit") {
          return safeNumber(balance + amount);
        }

        if (entry.type === "credit") {
          return safeNumber(balance - amount);
        }

        return balance;

      });

    });

    await Promise.all(updates);

  } catch (err) {

    console.error("Ledger balance update failed:", err);

    throw new Error("Failed to update ledger balances");

  }

};