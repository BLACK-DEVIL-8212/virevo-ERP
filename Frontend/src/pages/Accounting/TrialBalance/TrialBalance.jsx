import {
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef
} from "react";

import { getTrialBalance } from "../../../accounting/trialbalance.service";
import "./TrialBalance.scss";
import { FaBalanceScale, FaSync, FaCheckCircle, FaExclamationTriangle, FaChartLine, FaBook, FaDownload, FaPrint } from "react-icons/fa";

const currencyFormatter = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const TrialBalance = ({ shopId }) => {

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const mountedRef = useRef(true);

  /* ================= SAFE NUMBER ================= */

  const safeNumber = (value) => {

    const n = Number(value);

    if (!Number.isFinite(n)) return 0;

    return Number(n.toFixed(2));

  };

  /* ================= FORMAT CURRENCY ================= */

  const formatCurrency = useCallback((value = 0) => {

    const amount = safeNumber(value);

    return `₹${currencyFormatter.format(amount)}`;

  }, []);

  /* ================= SORT LEDGERS ================= */

  const sortedLedgers = useMemo(() => {

    if (!data?.ledgers) return [];

    return [...data.ledgers].sort((a, b) =>
      (a.name || "").localeCompare(b.name || "")
    );

  }, [data]);

  /* ================= STATISTICS ================= */

  const getStats = useMemo(() => {
    if (!data) return null;
    
    return {
      totalLedgers: data.ledgers?.length || 0,
      totalDebit: data.debit || 0,
      totalCredit: data.credit || 0,
      difference: data.difference || 0,
      isBalanced: data.balanced || false,
      debitCount: data.ledgers?.filter(l => safeNumber(l.balance) > 0).length || 0,
      creditCount: data.ledgers?.filter(l => safeNumber(l.balance) < 0).length || 0,
      zeroCount: data.ledgers?.filter(l => safeNumber(l.balance) === 0).length || 0
    };
  }, [data]);

  /* ================= LOAD DATA ================= */

  const loadTrialBalance = useCallback(async () => {

    if (!shopId) {
      setLoading(false);
      return;
    }

    try {

      setLoading(true);
      setError("");

      const tb = await getTrialBalance(shopId);

      if (!mountedRef.current) return;

      if (!tb || !Array.isArray(tb.ledgers)) {
        throw new Error("Invalid trial balance data");
      }

      setData({
        ...tb,
        debit: safeNumber(tb.debit),
        credit: safeNumber(tb.credit),
        difference: safeNumber(tb.difference)
      });

    } catch (err) {

      console.error("Trial balance failed:", err);

      if (!mountedRef.current) return;

      setError("Failed to load trial balance");

    } finally {

      if (mountedRef.current) {
        setLoading(false);
      }

    }

  }, [shopId]);

  /* ================= EXPORT TO CSV ================= */

  const exportToCSV = () => {
    if (!data || !sortedLedgers.length) return;

    const headers = ["Ledger Name", "Debit (₹)", "Credit (₹)"];
    const rows = sortedLedgers.map(ledger => {
      const balance = safeNumber(ledger.balance);
      return [
        ledger.name || "Unnamed",
        balance >= 0 ? Math.abs(balance).toFixed(2) : "",
        balance < 0 ? Math.abs(balance).toFixed(2) : ""
      ];
    });
    
    // Add total row
    rows.push(["TOTAL", data.debit.toFixed(2), data.credit.toFixed(2)]);
    
    const csvContent = [headers, ...rows].map(row => row.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trial_balance_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /* ================= PRINT ================= */

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert("Please allow popups to print.");
      return;
    }

    const printContent = document.querySelector('.trialbalance-table-wrapper').cloneNode(true);
    const styles = document.querySelector('style').innerHTML;
    
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Trial Balance Report</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            padding: 40px;
            background: white;
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
          }
          .header h1 {
            color: #000;
            margin-bottom: 10px;
          }
          .header p {
            color: #666;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
          }
          th, td {
            border: 1px solid #ddd;
            padding: 12px;
            text-align: left;
          }
          th {
            background: #f5f5f5;
            font-weight: bold;
          }
          .total-row {
            background: #f5f5f5;
            font-weight: bold;
          }
          .status {
            margin-top: 20px;
            padding: 10px;
            text-align: center;
            font-weight: bold;
          }
          .balanced {
            color: green;
          }
          .error {
            color: red;
          }
          @media print {
            body {
              padding: 20px;
            }
            button {
              display: none;
            }
          }
        </style>
        ${styles}
      </head>
      <body>
        <div class="header">
          <h1>Trial Balance Report</h1>
          <p>Generated on: ${new Date().toLocaleString()}</p>
        </div>
        ${printContent.outerHTML}
      </body>
      </html>
    `);
    
    printWindow.document.close();
    printWindow.print();
    printWindow.close();
  };

  /* ================= INITIAL LOAD ================= */

  useEffect(() => {

    mountedRef.current = true;

    loadTrialBalance();

    return () => {
      mountedRef.current = false;
    };

  }, [loadTrialBalance]);

  /* ================= UI ================= */

  if (!shopId) {
    return (
      <div className="trialbalance-page">
        <div className="empty-state">
          <FaBalanceScale className="empty-icon" />
          <h2>No Shop Selected</h2>
          <p>Please select a shop to view trial balance</p>
        </div>
      </div>
    );
  }

  return (

    <div className="trialbalance-page">

      {/* Header */}
      <div className="trialbalance-header">
        <div className="header-content">
          <FaBalanceScale className="header-icon" />
          <div>
            <h1>Trial Balance</h1>
            <p>Verify the mathematical accuracy of your accounts</p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      {data && !loading && (
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon total-icon">
              <FaBook />
            </div>
            <div className="stat-info">
              <span className="stat-label">Total Ledgers</span>
              <span className="stat-value">{getStats.totalLedgers}</span>
              <div className="stat-breakdown">
                <span className="debit-badge">DR: {getStats.debitCount}</span>
                <span className="credit-badge">CR: {getStats.creditCount}</span>
                <span className="zero-badge">Zero: {getStats.zeroCount}</span>
              </div>
            </div>
          </div>
          
          <div className="stat-card">
            <div className="stat-icon debit-icon">
              <span>📉</span>
            </div>
            <div className="stat-info">
              <span className="stat-label">Total Debit</span>
              <span className="stat-value debit">{formatCurrency(getStats.totalDebit)}</span>
            </div>
          </div>
          
          <div className="stat-card">
            <div className="stat-icon credit-icon">
              <span>📈</span>
            </div>
            <div className="stat-info">
              <span className="stat-label">Total Credit</span>
              <span className="stat-value credit">{formatCurrency(getStats.totalCredit)}</span>
            </div>
          </div>
          
          <div className="stat-card">
            <div className={`stat-icon ${getStats.isBalanced ? 'balanced-icon' : 'difference-icon'}`}>
              {getStats.isBalanced ? <FaCheckCircle /> : <FaExclamationTriangle />}
            </div>
            <div className="stat-info">
              <span className="stat-label">Status</span>
              <span className={`stat-value ${getStats.isBalanced ? 'balanced-text' : 'difference-text'}`}>
                {getStats.isBalanced ? "Balanced" : "Not Balanced"}
              </span>
              {!getStats.isBalanced && (
                <span className="stat-diff">Diff: {formatCurrency(Math.abs(getStats.difference))}</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      {data && !loading && (
        <div className="action-buttons">
          <button className="refresh-btn" onClick={loadTrialBalance} disabled={loading}>
            <FaSync className={loading ? "spin" : ""} />
            {loading ? "Refreshing..." : "Refresh"}
          </button>
          <button className="export-btn" onClick={exportToCSV}>
            <FaDownload /> Export CSV
          </button>
          <button className="print-btn" onClick={handlePrint}>
            <FaPrint /> Print
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading trial balance...</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="error-state">
          <FaExclamationTriangle className="error-icon" />
          <div className="error-content">
            <h3>Failed to Load Data</h3>
            <p>{error}</p>
          </div>
          <button className="retry-btn" onClick={loadTrialBalance}>
            Retry
          </button>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && !data && (
        <div className="empty-state">
          <FaBalanceScale className="empty-icon" />
          <h3>No Data Available</h3>
          <p>No ledger entries found for this shop</p>
        </div>
      )}

      {/* TABLE */}
      {!loading && !error && data && (
        <div className="trialbalance-table-wrapper">
          
          {/* Summary Info */}
          <div className="table-info">
            <div className="info-text">
              <FaChartLine className="info-icon" />
              <span>As of {new Date().toLocaleDateString()}</span>
            </div>
            <div className={`balance-status ${data.balanced ? "balanced" : "unbalanced"}`}>
              {data.balanced ? (
                <>
                  <FaCheckCircle /> Trial Balance is Balanced
                </>
              ) : (
                <>
                  <FaExclamationTriangle /> Difference: {formatCurrency(Math.abs(data.difference))}
                </>
              )}
            </div>
          </div>

          <table className="trialbalance-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Ledger Name</th>
                <th>Type</th>
                <th>Debit (₹)</th>
                <th>Credit (₹)</th>
              </tr>
            </thead>
            <tbody>
              {sortedLedgers.map((ledger, index) => {
                const balance = safeNumber(ledger.balance);
                const isDebit = balance >= 0;
                const absBalance = Math.abs(balance);

                return (
                  <tr key={ledger.id || ledger.name} className={absBalance === 0 ? "zero-balance" : ""}>
                    <td className="sno">{index + 1}</td>
                    <td className="ledger-name">
                      <div className="name-cell">
                        <span className="ledger-icon">
                          {ledger.type === "asset" && "📦"}
                          {ledger.type === "liability" && "📋"}
                          {ledger.type === "income" && "💰"}
                          {ledger.type === "expense" && "💸"}
                          {ledger.type === "equity" && "⚖️"}
                          {!ledger.type && "📘"}
                        </span>
                        <span>{ledger.name || "Unnamed"}</span>
                      </div>
                    </td>
                    <td className="ledger-type">
                      <span className={`type-badge ${ledger.type}`}>
                        {ledger.type?.toUpperCase() || "UNKNOWN"}
                      </span>
                    </td>
                    <td className={`amount debit ${isDebit ? "active" : ""}`}>
                      {isDebit ? formatCurrency(absBalance) : "—"}
                    </td>
                    <td className={`amount credit ${!isDebit ? "active" : ""}`}>
                      {!isDebit ? formatCurrency(absBalance) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="total-row">
                <td colSpan="3" className="total-label">
                  <strong>Total</strong>
                </td>
                <td className="amount debit total">
                  <strong>{formatCurrency(data.debit)}</strong>
                </td>
                <td className="amount credit total">
                  <strong>{formatCurrency(data.credit)}</strong>
                </td>
               </tr>
            </tfoot>
          </table>

          {/* Verification Message */}
          {data.balanced ? (
            <div className="verification-message success">
              <FaCheckCircle className="verification-icon" />
              <div>
                <strong>✓ Accounts are balanced</strong>
                <p>Total Debits equal Total Credits. Your books are mathematically accurate.</p>
              </div>
            </div>
          ) : (
            <div className="verification-message error">
              <FaExclamationTriangle className="verification-icon" />
              <div>
                <strong>⚠ Accounts are not balanced</strong>
                <p>There's a difference of {formatCurrency(Math.abs(data.difference))} between total debits and credits. Please review your journal entries.</p>
              </div>
            </div>
          )}

        </div>
      )}

    </div>

  );

};

export default TrialBalance;