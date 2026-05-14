import { fetchLedgers } from "./ledger.service";
import { getProfitLoss } from "./profitloss.service";

/* =============================
   SAFE NUMBER
============================= */

const safeNumber = (value) => {

  const n = Number(value);

  if (!Number.isFinite(n)) return 0;

  return Number(n.toFixed(2));

};

/* =============================
   GET BALANCE SHEET
============================= */

export const getBalanceSheet = async (shopId) => {

  try {

    if (!shopId) throw new Error("Missing shopId");

    const ledgers = await fetchLedgers(shopId);

    const pl = await getProfitLoss(shopId);

    let assets = 0;
    let liabilities = 0;
    let equity = 0;

    const assetLedgers = [];
    const liabilityLedgers = [];
    const equityLedgers = [];

    ledgers.forEach((ledger) => {

      const balance = safeNumber(ledger.balance);

      if (ledger.type === "asset") {

        assets += balance;

        assetLedgers.push({
          name: ledger.name,
          amount: balance
        });

      }

      if (ledger.type === "liability") {

        liabilities += Math.abs(balance);

        liabilityLedgers.push({
          name: ledger.name,
          amount: Math.abs(balance)
        });

      }

      if (ledger.type === "equity") {

        equity += Math.abs(balance);

        equityLedgers.push({
          name: ledger.name,
          amount: Math.abs(balance)
        });

      }

    });

    /* Add Profit to Equity */

    equity += safeNumber(pl.profit);

    return {

      assets,
      liabilities,
      equity,
      profit: safeNumber(pl.profit),

      assetLedgers,
      liabilityLedgers,
      equityLedgers

    };

  } catch (err) {

    console.error("Balance sheet failed:", err);

    return {

      assets: 0,
      liabilities: 0,
      equity: 0,
      profit: 0,

      assetLedgers: [],
      liabilityLedgers: [],
      equityLedgers: []

    };

  }

};