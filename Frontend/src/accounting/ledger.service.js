import { db } from "../services/firebase";
import {
  ref,
  push,
  get,
  set,
  serverTimestamp
} from "firebase/database";

/* =============================
   VALID LEDGER TYPES
============================= */

const VALID_TYPES = [
  "asset",
  "liability",
  "income",
  "expense",
  "equity"
];

/* =============================
   CREATE LEDGER
============================= */

export const createLedger = async (shopId, ledger) => {

  try {

    if (!shopId) {
      throw new Error("Missing shopId");
    }

    if (!ledger?.name || typeof ledger.name !== "string") {
      throw new Error("Ledger name required");
    }

    if (!VALID_TYPES.includes(ledger.type)) {
      throw new Error("Invalid ledger type");
    }

    const ledgerRef = ref(db, `shops/${shopId}/accounting/ledgers`);

    const newLedger = push(ledgerRef);

    const payload = {
      name: ledger.name.trim(),
      type: ledger.type,
      balance: Number(ledger.balance) || 0,
      createdAt: Date.now()
    };

    await set(newLedger, payload);

    return {
      success: true,
      id: newLedger.key
    };

  } catch (err) {

    console.error("Create ledger failed:", err);

    return {
      success: false,
      error: err.message
    };

  }

};

/* =============================
   FETCH LEDGERS
============================= */

export const fetchLedgers = async (shopId) => {

  try {

    if (!shopId) {
      throw new Error("Missing shopId");
    }

    const ledgerRef = ref(
      db,
      `shops/${shopId}/accounting/ledgers`
    );

    const snapshot = await get(ledgerRef);

    if (!snapshot.exists()) {
      return [];
    }

    const data = snapshot.val();

    return Object.keys(data).map((id) => ({
      id,
      name: data[id].name || "Unnamed",
      type: data[id].type || "unknown",
      balance: Number(data[id].balance) || 0,
      createdAt: data[id].createdAt || null
    }));

  } catch (err) {

    console.error("Fetch ledgers failed:", err);

    return [];

  }

};