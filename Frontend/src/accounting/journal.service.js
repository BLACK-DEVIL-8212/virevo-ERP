import { db } from "../services/firebase";
import {
  ref,
  push,
  get,
  update,
  serverTimestamp
} from "firebase/database";

import { createAuditLog } from "./audit.service";

/* =====================================
   SAFE NUMBER
===================================== */

const safeNumber = (value) => {

  const n = Number(value);

  if (!Number.isFinite(n)) return 0;

  return Number(n.toFixed(2));

};

/* =====================================
   SANITIZE TEXT
===================================== */

const sanitizeText = (text, limit = 250) => {

  if (!text) return "";

  return text
    .toString()
    .trim()
    .replace(/\s+/g, " ")
    .substring(0, limit);

};

/* =====================================
   VALIDATE JOURNAL ENTRY
===================================== */

const validateJournal = (entries) => {

  if (!Array.isArray(entries) || entries.length < 2) {
    throw new Error("Journal must contain at least 2 entries");
  }

  if (entries.length > 20) {
    throw new Error("Journal entry too large");
  }

  let debit = 0;
  let credit = 0;

  const ledgerIds = new Set();

  for (const entry of entries) {

    if (!entry.ledgerId) {
      throw new Error("LedgerId missing");
    }

    if (ledgerIds.has(entry.ledgerId)) {
      throw new Error("Duplicate ledger in journal");
    }

    ledgerIds.add(entry.ledgerId);

    if (!["debit", "credit"].includes(entry.type)) {
      throw new Error("Invalid entry type");
    }

    const amount = safeNumber(entry.amount);

    if (amount <= 0) {
      throw new Error("Invalid amount");
    }

    if (entry.type === "debit") debit += amount;
    else credit += amount;

  }

  if (safeNumber(debit) !== safeNumber(credit)) {
    throw new Error("Journal not balanced (Debit ≠ Credit)");
  }

};

/* =====================================
   ACCOUNTING LOCK CHECK
===================================== */

const checkAccountingLock = async (shopId, date) => {

  const lockRef = ref(
    db,
    `shops/${shopId}/accounting/settings/lockDate`
  );

  const snap = await get(lockRef);

  if (!snap.exists()) return;

  const lockDate = snap.val();

  if (date < lockDate) {
    throw new Error("Accounting period is locked");
  }

};

/* =====================================
   GET ACCOUNTING YEAR
===================================== */

const getAccountingYear = () => {
  return new Date().getFullYear();
};

/* =====================================
   CREATE JOURNAL ENTRY
===================================== */

export const createJournalEntry = async (shopId, journal) => {

  try {

    if (!shopId) {
      throw new Error("Shop ID missing");
    }

    if (!journal?.entries) {
      throw new Error("Journal entries missing");
    }

    const narration = sanitizeText(journal.narration);

    const date = Number(journal.date) || Date.now();

    const year = getAccountingYear();

    validateJournal(journal.entries);

    await checkAccountingLock(shopId, date);

    /* =====================================
       FETCH LEDGERS
    ===================================== */

    const ledgerRef = ref(
      db,
      `shops/${shopId}/accounting/ledgers`
    );

    const ledgerSnap = await get(ledgerRef);

    if (!ledgerSnap.exists()) {
      throw new Error("No ledgers found");
    }

    const ledgers = ledgerSnap.val();

    const balanceMap = {};
    const newBalances = {};

    for (const entry of journal.entries) {

      const ledger = ledgers[entry.ledgerId];

      if (!ledger) {
        throw new Error("Ledger not found");
      }

      if (!ledger.type) {
        throw new Error("Ledger type missing");
      }

      balanceMap[entry.ledgerId] = safeNumber(ledger.balance);

    }

    /* =====================================
       CALCULATE NEW BALANCES
    ===================================== */

    for (const entry of journal.entries) {

      const current = balanceMap[entry.ledgerId];

      const amount = safeNumber(entry.amount);

      if (entry.type === "debit") {
        newBalances[entry.ledgerId] =
          safeNumber(current + amount);
      } else {
        newBalances[entry.ledgerId] =
          safeNumber(current - amount);
      }

    }

    /* =====================================
       CREATE JOURNAL
    ===================================== */

    const journalRef = ref(
      db,
      `shops/${shopId}/accounting/journals`
    );

    const newJournal = push(journalRef);

    const updates = {};

    updates[
      `shops/${shopId}/accounting/journals/${newJournal.key}`
    ] = {

      date,

      narration,

      year,

      entries: journal.entries.map((entry) => ({

        ledgerId: entry.ledgerId,

        type: entry.type,

        amount: safeNumber(entry.amount),

        costCenter: sanitizeText(entry.costCenter || "", 100)

      })),

      createdAt: serverTimestamp()

    };

    /* =====================================
       UPDATE LEDGER BALANCES
    ===================================== */

    for (const ledgerId in newBalances) {

      updates[
        `shops/${shopId}/accounting/ledgers/${ledgerId}/balance`
      ] = newBalances[ledgerId];

    }

    /* =====================================
       LEDGER HISTORY
    ===================================== */

    for (const entry of journal.entries) {

      const historyRef = push(
        ref(
          db,
          `shops/${shopId}/accounting/ledgerHistory/${entry.ledgerId}`
        )
      );

      updates[
        `shops/${shopId}/accounting/ledgerHistory/${entry.ledgerId}/${historyRef.key}`
      ] = {

        journalId: newJournal.key,

        type: entry.type,

        amount: safeNumber(entry.amount),

        balanceAfter: newBalances[entry.ledgerId],

        narration,

        date,

        createdAt: serverTimestamp()

      };

    }

    /* =====================================
       ATOMIC UPDATE
    ===================================== */

    await update(ref(db), updates);

    /* =====================================
       AUDIT LOG
    ===================================== */

    await createAuditLog({

      shopId,

      userId: journal.userId || "system",

      action: "CREATE_JOURNAL",

      module: "accounting",

      details: `Journal ${newJournal.key} created`

    });

    return {

      success: true,

      id: newJournal.key

    };

  } catch (err) {

    console.error("Journal creation failed:", err);

    return {

      success: false,

      error: err.message

    };

  }

};