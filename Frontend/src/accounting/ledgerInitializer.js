import { ref, set, get } from "firebase/database";
import { db } from "../services/firebase";

export const initializeDefaultLedgers = async (shopId) => {

  const ledgersRef = ref(db, `shops/${shopId}/accounting/ledgers`);

  const snap = await get(ledgersRef);

  if (snap.exists()) return;

  const defaultLedgers = {

    cash: {
      name: "Cash",
      type: "asset",
      balance: 0
    },

    bank: {
      name: "Bank",
      type: "asset",
      balance: 0
    },

    sales: {
      name: "Sales",
      type: "income",
      balance: 0
    },

    inventory: {
      name: "Inventory",
      type: "asset",
      balance: 0
    },

    cogs: {
      name: "Cost of Goods Sold",
      type: "expense",
      balance: 0
    },

    gst_payable: {
      name: "GST Payable",
      type: "liability",
      balance: 0
    },

    capital: {
      name: "Capital",
      type: "equity",
      balance: 0
    }

  };

  await set(ledgersRef, defaultLedgers);

};