import { db } from "../services/firebase";
import { ref, get } from "firebase/database";

/* ===============================
   SAFE NUMBER
================================ */

const safeNumber = (value) => {

  const n = Number(value);

  if (!Number.isFinite(n)) return 0;

  return Number(n.toFixed(2));

};

/* ===============================
   GET LEDGER HISTORY
================================ */

export const getLedgerHistory = async (shopId, ledgerId) => {

  try {

    if (!shopId) {
      throw new Error("Missing shopId");
    }

    if (!ledgerId) {
      throw new Error("Missing ledgerId");
    }

    const journalRef = ref(
      db,
      `shops/${shopId}/accounting/journals`
    );

    const snap = await get(journalRef);

    if (!snap.exists()) {
      return [];
    }

    const journals = snap.val();

    const history = [];

    Object.entries(journals).forEach(([journalId, journal]) => {

      if (!journal?.entries || !Array.isArray(journal.entries)) {
        return;
      }

      journal.entries.forEach(entry => {

        if (entry.ledgerId === ledgerId) {

          const amount = safeNumber(entry.amount);

          history.push({

            journalId,

            date: journal.date || 0,

            narration: journal.narration || "",

            debit: entry.type === "debit" ? amount : 0,

            credit: entry.type === "credit" ? amount : 0

          });

        }

      });

    });

    /* ===============================
       SORT BY DATE
    ================================= */

    history.sort((a, b) => a.date - b.date);

    /* ===============================
       CALCULATE RUNNING BALANCE
    ================================= */

    let runningBalance = 0;

    const ledgerHistory = history.map(row => {

      runningBalance =
        runningBalance + row.debit - row.credit;

      return {

        ...row,

        balance: safeNumber(runningBalance)

      };

    });

    return ledgerHistory;

  } catch (err) {

    console.error("Ledger history fetch failed:", err);

    return [];

  }

};