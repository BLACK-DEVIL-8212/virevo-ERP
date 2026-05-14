import { ref, get, set } from "firebase/database";
import { db } from "../services/firebase";

export const rebuildAccounting = async (shopId) => {

  const journalsSnap = await get(
    ref(db, `shops/${shopId}/accounting/journals`)
  );

  if (!journalsSnap.exists()) return;

  const ledgerBalances = {};

  journalsSnap.forEach((journal) => {

    const data = journal.val();

    data.entries.forEach((entry) => {

      if (!ledgerBalances[entry.ledgerId]) {
        ledgerBalances[entry.ledgerId] = 0;
      }

      if (entry.type === "debit") {
        ledgerBalances[entry.ledgerId] += entry.amount;
      } else {
        ledgerBalances[entry.ledgerId] -= entry.amount;
      }

    });

  });

  for (const ledgerId in ledgerBalances) {

    await set(
      ref(db, `shops/${shopId}/accounting/ledgers/${ledgerId}`),
      {
        name: ledgerId,
        balance: ledgerBalances[ledgerId],
        rebuiltAt: Date.now()
      }
    );

  }

};