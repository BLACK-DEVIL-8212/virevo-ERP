import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { fetchLedgers, createLedger } from "../../../accounting/ledger.service";
import "./LedgerList.scss";
import { FaBook, FaPlus, FaSync, FaTrash, FaEdit, FaChartLine, FaWallet, FaMoneyBillWave, FaPercent, FaBuilding, FaSearch, FaFilter, FaDownload } from "react-icons/fa";

const currencyFormatter = new Intl.NumberFormat("en-IN");

const LedgerList = ({ shopId }) => {

  const [ledgers, setLedgers] = useState([]);
  const [filteredLedgers, setFilteredLedgers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [ledgerName, setLedgerName] = useState("");
  const [ledgerType, setLedgerType] = useState("asset");
  const [creating, setCreating] = useState(false);
  
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [balanceFilter, setBalanceFilter] = useState("all");

  const mountedRef = useRef(true);

  /* ================= SAFE NUMBER ================= */

  const safeNumber = (value) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return 0;
    return Number(num.toFixed(2));
  };

  /* ================= FORMAT BALANCE ================= */

  const formatBalance = useCallback((balance = 0) => {

    const safe = safeNumber(balance);
    const formatted = currencyFormatter.format(Math.abs(safe));

    return safe >= 0
      ? `₹${formatted} DR`
      : `₹${formatted} CR`;

  }, []);

  /* ================= GET BALANCE COLOR ================= */

  const getBalanceColor = (balance) => {
    if (balance > 0) return "debit";
    if (balance < 0) return "credit";
    return "zero";
  };

  /* ================= GET TYPE ICON ================= */

  const getTypeIcon = (type) => {
    switch(type?.toLowerCase()) {
      case "asset": return <FaBuilding />;
      case "liability": return <FaWallet />;
      case "income": return <FaMoneyBillWave />;
      case "expense": return <FaPercent />;
      case "equity": return <FaChartLine />;
      default: return <FaBook />;
    }
  };

  /* ================= GET TYPE COLOR ================= */

  const getTypeColor = (type) => {
    switch(type?.toLowerCase()) {
      case "asset": return "#22c55e";
      case "liability": return "#ef4444";
      case "income": return "#3b82f6";
      case "expense": return "#facc15";
      case "equity": return "#a855f7";
      default: return "#00e0ff";
    }
  };

  /* ================= SORT LEDGERS ================= */

  const sortedLedgers = useMemo(() => {
    return [...ledgers].sort((a, b) =>
      (a.name || "").localeCompare(b.name || "")
    );
  }, [ledgers]);

  /* ================= FILTER LEDGERS ================= */

  useEffect(() => {
    let filtered = [...sortedLedgers];
    
    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(ledger =>
        ledger.name?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    // Type filter
    if (typeFilter !== "all") {
      filtered = filtered.filter(ledger =>
        ledger.type?.toLowerCase() === typeFilter.toLowerCase()
      );
    }
    
    // Balance filter
    if (balanceFilter !== "all") {
      filtered = filtered.filter(ledger => {
        const balance = safeNumber(ledger.balance);
        if (balanceFilter === "debit") return balance > 0;
        if (balanceFilter === "credit") return balance < 0;
        if (balanceFilter === "zero") return balance === 0;
        return true;
      });
    }
    
    setFilteredLedgers(filtered);
  }, [sortedLedgers, searchTerm, typeFilter, balanceFilter]);

  /* ================= LOAD LEDGERS ================= */

  const loadLedgers = useCallback(async () => {

    if (!shopId) {
      setLoading(false);
      return;
    }

    try {

      setLoading(true);
      setError("");

      const data = await fetchLedgers(shopId);

      if (!mountedRef.current) return;

      if (!Array.isArray(data)) {
        throw new Error("Invalid ledger data");
      }

      setLedgers(data);

    } catch (err) {

      console.error("Ledger load failed:", err);

      if (!mountedRef.current) return;

      setError("Failed to load ledgers");

    } finally {

      if (mountedRef.current) {
        setLoading(false);
      }

    }

  }, [shopId]);

  /* ================= CREATE LEDGER ================= */

  const handleCreateLedger = async () => {

    if (!ledgerName.trim()) {
      setError("Ledger name required");
      setTimeout(() => setError(""), 3000);
      return;
    }

    try {

      setCreating(true);
      setError("");

      const result = await createLedger(shopId, {
        name: ledgerName.trim(),
        type: ledgerType
      });

      if (!result?.success) {
        throw new Error(result?.error || "Ledger creation failed");
      }

      setSuccess(`Ledger "${ledgerName}" created successfully!`);
      setLedgerName("");
      setLedgerType("asset");
      setShowForm(false);

      await loadLedgers();
      
      setTimeout(() => setSuccess(""), 3000);

    } catch (err) {

      console.error("Create ledger error:", err);
      setError(err.message);
      setTimeout(() => setError(""), 3000);

    } finally {

      setCreating(false);

    }

  };

  /* ================= EXPORT LEDGERS ================= */

  const exportToCSV = () => {
    const headers = ["Ledger Name", "Type", "Balance", "Balance Type"];
    const csvData = filteredLedgers.map(ledger => {
      const balance = safeNumber(ledger.balance);
      return [
        ledger.name,
        ledger.type?.toUpperCase() || "UNKNOWN",
        Math.abs(balance).toFixed(2),
        balance >= 0 ? "DEBIT" : "CREDIT"
      ];
    });
    
    const csvContent = [headers, ...csvData].map(row => row.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ledgers_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /* ================= STATISTICS ================= */

  const getStats = () => {
    let totalDebit = 0;
    let totalCredit = 0;
    let totalBalance = 0;
    
    ledgers.forEach(ledger => {
      const balance = safeNumber(ledger.balance);
      totalBalance += balance;
      if (balance > 0) totalDebit += balance;
      if (balance < 0) totalCredit += Math.abs(balance);
    });
    
    return {
      totalLedgers: ledgers.length,
      totalDebit,
      totalCredit,
      totalBalance,
      byType: ledgers.reduce((acc, ledger) => {
        const type = ledger.type || "unknown";
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {})
    };
  };

  const stats = getStats();

  /* ================= INITIAL LOAD ================= */

  useEffect(() => {

    mountedRef.current = true;

    loadLedgers();

    return () => {
      mountedRef.current = false;
    };

  }, [loadLedgers]);

  /* ================= UI ================= */

  if (!shopId) {
    return (
      <div className="ledger-page">
        <div className="empty-state">
          <FaBook className="empty-icon" />
          <h2>No Shop Selected</h2>
          <p>Please select a shop to view ledger accounts</p>
        </div>
      </div>
    );
  }

  return (

    <div className="ledger-page">

      {/* Header */}
      <div className="ledger-header">
        <div className="header-content">
          <FaBook className="header-icon" />
          <div>
            <h1>Ledger Accounts</h1>
            <p>Manage your financial accounts and track balances</p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon total-icon">
            <FaBook />
          </div>
          <div className="stat-info">
            <span className="stat-label">Total Ledgers</span>
            <span className="stat-value">{stats.totalLedgers}</span>
          </div>
        </div>
        
        <div className="stat-card">
          <div className="stat-icon debit-icon">
            <FaMoneyBillWave />
          </div>
          <div className="stat-info">
            <span className="stat-label">Total Debit</span>
            <span className="stat-value">₹{currencyFormatter.format(stats.totalDebit)}</span>
          </div>
        </div>
        
        <div className="stat-card">
          <div className="stat-icon credit-icon">
            <FaWallet />
          </div>
          <div className="stat-info">
            <span className="stat-label">Total Credit</span>
            <span className="stat-value">₹{currencyFormatter.format(stats.totalCredit)}</span>
          </div>
        </div>
        
        <div className="stat-card">
          <div className="stat-icon balance-icon">
            <FaChartLine />
          </div>
          <div className="stat-info">
            <span className="stat-label">Net Balance</span>
            <span className={`stat-value ${stats.totalBalance >= 0 ? "debit" : "credit"}`}>
              ₹{currencyFormatter.format(Math.abs(stats.totalBalance))} {stats.totalBalance >= 0 ? "DR" : "CR"}
            </span>
          </div>
        </div>
      </div>

      {/* Actions Bar */}
      <div className="actions-bar">
        <div className="ledger-actions">
          <button
            className="create-btn"
            onClick={() => setShowForm(!showForm)}
          >
            <FaPlus /> {showForm ? "Cancel" : "Create Ledger"}
          </button>

          <button
            className="refresh-btn"
            onClick={loadLedgers}
            disabled={loading}
          >
            <FaSync className={loading ? "spin" : ""} />
            {loading ? "Refreshing..." : "Refresh"}
          </button>

          <button
            className="export-btn"
            onClick={exportToCSV}
            disabled={filteredLedgers.length === 0}
          >
            <FaDownload /> Export CSV
          </button>
        </div>
      </div>

      {/* Filters Section */}
      <div className="filters-section">
        <div className="search-box">
          <FaSearch className="search-icon" />
          <input
            type="text"
            placeholder="Search ledgers by name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <div className="filter-controls">
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="all">All Types</option>
            <option value="asset">Assets</option>
            <option value="liability">Liabilities</option>
            <option value="income">Income</option>
            <option value="expense">Expenses</option>
            <option value="equity">Equity</option>
          </select>
          
          <select value={balanceFilter} onChange={(e) => setBalanceFilter(e.target.value)}>
            <option value="all">All Balances</option>
            <option value="debit">Debit Balance</option>
            <option value="credit">Credit Balance</option>
            <option value="zero">Zero Balance</option>
          </select>
        </div>
      </div>

      {/* CREATE LEDGER FORM */}
      {showForm && (
        <div className="ledger-create-form">
          <div className="form-header">
            <h3>
              <FaPlus className="form-icon" />
              Create New Ledger
            </h3>
          </div>
          
          <div className="form-grid">
            <div className="input-group">
              <input
                type="text"
                placeholder="Ledger Name"
                value={ledgerName}
                onChange={(e) => setLedgerName(e.target.value)}
                autoFocus
              />
            </div>

            <div className="input-group">
              <select
                value={ledgerType}
                onChange={(e) => setLedgerType(e.target.value)}
              >
                <option value="asset">📊 Asset</option>
                <option value="liability">📋 Liability</option>
                <option value="income">💰 Income</option>
                <option value="expense">💸 Expense</option>
                <option value="equity">⚖️ Equity</option>
              </select>
            </div>
          </div>

          <div className="form-actions">
            <button
              onClick={handleCreateLedger}
              disabled={creating}
              className="btn-submit"
            >
              {creating ? (
                <span className="spinner"></span>
              ) : (
                <>
                  <FaPlus /> Create Ledger
                </>
              )}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="btn-cancel"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Messages */}
      {error && (
        <div className="message error">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}
      
      {success && (
        <div className="message success">
          <span>✓</span>
          <span>{success}</span>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="ledger-loading">
          <div className="spinner"></div>
          <p>Loading ledgers...</p>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && filteredLedgers.length === 0 && (
        <div className="empty-state">
          <FaBook className="empty-icon" />
          <h3>No Ledgers Found</h3>
          <p>
            {searchTerm || typeFilter !== "all" || balanceFilter !== "all"
              ? "No ledgers match your filters"
              : "Click 'Create Ledger' to add your first account"}
          </p>
        </div>
      )}

      {/* Table */}
      {!loading && !error && filteredLedgers.length > 0 && (
        <>
          <div className="ledger-table-wrapper">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Ledger Name</th>
                  <th>Type</th>
                  <th>Balance</th>
                </tr>
              </thead>
              <tbody>
                {filteredLedgers.map((ledger, index) => {
                  const balance = safeNumber(ledger.balance);
                  const balanceColor = getBalanceColor(balance);
                  const typeColor = getTypeColor(ledger.type);
                  
                  return (
                    <tr key={ledger.id || ledger.name}>
                      <td className="sno">{index + 1}</td>
                      <td className="ledger-name">
                        <div className="name-cell">
                          <span className="ledger-icon" style={{ color: typeColor }}>
                            {getTypeIcon(ledger.type)}
                          </span>
                          <span>{ledger.name || "Unnamed"}</span>
                        </div>
                      </td>
                      <td className="ledger-type">
                        <span className="type-badge" style={{ background: `${typeColor}20`, color: typeColor }}>
                          {getTypeIcon(ledger.type)}
                          {(ledger.type || "Unknown").toUpperCase()}
                        </span>
                      </td>
                      <td className={`balance ${balanceColor}`}>
                        <div className="balance-cell">
                          <span className="balance-amount">
                            ₹{currencyFormatter.format(Math.abs(balance))}
                          </span>
                          <span className="balance-type">{balance >= 0 ? "DR" : "CR"}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          
          {/* Footer Stats */}
          <div className="table-footer">
            <div className="footer-stats">
              <span>Showing {filteredLedgers.length} of {ledgers.length} ledgers</span>
              {Object.entries(stats.byType).map(([type, count]) => (
                <span key={type} className="type-stat">
                  {type.toUpperCase()}: {count}
                </span>
              ))}
            </div>
          </div>
        </>
      )}

    </div>

  );

};

export default LedgerList;