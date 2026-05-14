import { useState, useEffect, useCallback } from "react";
import { createJournalEntry } from "../../../accounting/journal.service";
import { fetchLedgers } from "../../../accounting/ledger.service";
import "./JournalEntry.scss";
import { FaBook, FaExchangeAlt, FaRupeeSign, FaPen, FaSave, FaTimes, FaCheckCircle, FaExclamationTriangle, FaInfoCircle, FaCalculator } from "react-icons/fa";

const MAX_NARRATION = 300;

const JournalEntry = ({ shopId }) => {

  const [ledgers, setLedgers] = useState([]);

  const [debitLedger, setDebitLedger] = useState("");
  const [creditLedger, setCreditLedger] = useState("");
  const [amount, setAmount] = useState("");
  const [narration, setNarration] = useState("");

  const [loading, setLoading] = useState(false);
  const [ledgerLoading, setLedgerLoading] = useState(true);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  
  const [selectedDebitLedgerDetails, setSelectedDebitLedgerDetails] = useState(null);
  const [selectedCreditLedgerDetails, setSelectedCreditLedgerDetails] = useState(null);

  /* ================= SAFE NUMBER ================= */

  const safeAmount = (value) => {

    const num = Number(value);

    if (!Number.isFinite(num) || num <= 0) {
      return null;
    }

    return Number(num.toFixed(2));
  };

  /* ================= RESET FORM ================= */

  const resetForm = () => {

    setDebitLedger("");
    setCreditLedger("");
    setAmount("");
    setNarration("");
    setSelectedDebitLedgerDetails(null);
    setSelectedCreditLedgerDetails(null);

  };

  /* ================= GET LEDGER DETAILS ================= */

  const getLedgerDetails = (ledgerId) => {
    return ledgers.find(l => l.id === ledgerId);
  };

  const handleDebitChange = (e) => {
    const ledgerId = e.target.value;
    setDebitLedger(ledgerId);
    setSelectedDebitLedgerDetails(getLedgerDetails(ledgerId));
  };

  const handleCreditChange = (e) => {
    const ledgerId = e.target.value;
    setCreditLedger(ledgerId);
    setSelectedCreditLedgerDetails(getLedgerDetails(ledgerId));
  };

  /* ================= LOAD LEDGERS ================= */

  const loadLedgers = useCallback(async () => {

    if (!shopId) return;

    try {

      setLedgerLoading(true);
      setError("");

      const data = await fetchLedgers(shopId);

      if (!Array.isArray(data)) {
        throw new Error("Invalid ledger data");
      }

      setLedgers(data);

    } catch (err) {

      console.error("Ledger loading error:", err);
      setError("Unable to load ledgers");

    } finally {

      setLedgerLoading(false);

    }

  }, [shopId]);

  useEffect(() => {
    loadLedgers();
  }, [loadLedgers]);

  /* ================= VALIDATE FORM ================= */

  const validateForm = () => {

    if (ledgers.length === 0) {
      return "No ledgers available. Please create a ledger first.";
    }

    if (!debitLedger || !creditLedger) {
      return "Please select both ledgers";
    }

    if (debitLedger === creditLedger) {
      return "Debit and Credit ledger cannot be the same";
    }

    const amt = safeAmount(amount);

    if (!amt) {
      return "Please enter a valid amount greater than 0";
    }

    if (narration.length > MAX_NARRATION) {
      return `Narration cannot exceed ${MAX_NARRATION} characters`;
    }

    return null;

  };

  /* ================= SUBMIT ================= */

  const handleSubmit = async (e) => {

    e.preventDefault();

    if (loading) return;

    setError("");
    setSuccess("");

    const validationError = validateForm();

    if (validationError) {
      setError(validationError);
      return;
    }

    try {

      setLoading(true);

      const amt = safeAmount(amount);

      const journal = {

        date: Date.now(),

        narration: narration.trim() || "Journal Entry",

        entries: [
          {
            ledgerId: debitLedger,
            type: "debit",
            amount: amt
          },
          {
            ledgerId: creditLedger,
            type: "credit",
            amount: amt
          }
        ]

      };

      const result = await createJournalEntry(shopId, journal);

      if (!result?.success) {
        throw new Error(result?.error || "Journal save failed");
      }

      setSuccess("Journal entry saved successfully!");
      resetForm();

      setTimeout(() => setSuccess(""), 3000);

    } catch (err) {

      console.error("Journal error:", err);
      setError(err.message || "Failed to save journal entry");
      setTimeout(() => setError(""), 3000);

    } finally {

      setLoading(false);

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

  /* ================= UI ================= */

  if (!shopId) {
    return (
      <div className="journal-page">
        <div className="empty-state">
          <FaBook className="empty-icon" />
          <h2>No Shop Selected</h2>
          <p>Please select a shop to create journal entries</p>
        </div>
      </div>
    );
  }

  return (

    <div className="journal-page">

      {/* Header */}
      <div className="journal-header">
        <div className="header-content">
          <FaBook className="header-icon" />
          <div>
            <h1>Journal Entry</h1>
            <p>Record debit and credit transactions</p>
          </div>
        </div>
      </div>

      {/* Info Card */}
      <div className="info-card">
        <FaInfoCircle className="info-icon" />
        <div className="info-content">
          <h3>Double-Entry Accounting</h3>
          <p>Every journal entry must have equal debit and credit amounts. The total debits must equal total credits.</p>
        </div>
      </div>

      {ledgerLoading ? (

        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading ledgers...</p>
        </div>

      ) : ledgers.length === 0 ? (

        <div className="warning-state">
          <FaExclamationTriangle className="warning-icon" />
          <h3>No Ledgers Found</h3>
          <p>Please create a ledger first before making journal entries.</p>
        </div>

      ) : (

        <form className="journal-form" onSubmit={handleSubmit}>

          {/* Debit Ledger */}
          <div className="form-section">
            <label className="form-label">
              <span className="label-icon debit">📉</span>
              Debit Ledger <span className="required">*</span>
            </label>
            <select
              value={debitLedger}
              onChange={handleDebitChange}
              required
              className="form-select"
            >
              <option value="">-- Select Debit Ledger --</option>
              {ledgers.map((ledger) => (
                <option key={ledger.id} value={ledger.id}>
                  {ledger.name} ({ledger.type?.toUpperCase()})
                </option>
              ))}
            </select>
            {selectedDebitLedgerDetails && (
              <div className="ledger-info">
                <span className="ledger-type" style={{ color: getTypeColor(selectedDebitLedgerDetails.type) }}>
                  Type: {selectedDebitLedgerDetails.type?.toUpperCase()}
                </span>
                {selectedDebitLedgerDetails.balance !== undefined && (
                  <span className={`ledger-balance ${selectedDebitLedgerDetails.balance >= 0 ? 'debit' : 'credit'}`}>
                    Balance: ₹{Math.abs(selectedDebitLedgerDetails.balance).toLocaleString()} 
                    {selectedDebitLedgerDetails.balance >= 0 ? ' DR' : ' CR'}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Credit Ledger */}
          <div className="form-section">
            <label className="form-label">
              <span className="label-icon credit">📈</span>
              Credit Ledger <span className="required">*</span>
            </label>
            <select
              value={creditLedger}
              onChange={handleCreditChange}
              required
              className="form-select"
            >
              <option value="">-- Select Credit Ledger --</option>
              {ledgers.map((ledger) => (
                <option key={ledger.id} value={ledger.id}>
                  {ledger.name} ({ledger.type?.toUpperCase()})
                </option>
              ))}
            </select>
            {selectedCreditLedgerDetails && (
              <div className="ledger-info">
                <span className="ledger-type" style={{ color: getTypeColor(selectedCreditLedgerDetails.type) }}>
                  Type: {selectedCreditLedgerDetails.type?.toUpperCase()}
                </span>
                {selectedCreditLedgerDetails.balance !== undefined && (
                  <span className={`ledger-balance ${selectedCreditLedgerDetails.balance >= 0 ? 'debit' : 'credit'}`}>
                    Balance: ₹{Math.abs(selectedCreditLedgerDetails.balance).toLocaleString()} 
                    {selectedCreditLedgerDetails.balance >= 0 ? ' DR' : ' CR'}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Amount */}
          <div className="form-section">
            <label className="form-label">
              <FaRupeeSign className="label-icon" />
              Amount <span className="required">*</span>
            </label>
            <div className="amount-input-wrapper">
              <span className="currency-symbol">₹</span>
              <input
                type="number"
                placeholder="0.00"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                className="amount-input"
              />
              <FaCalculator className="calc-icon" />
            </div>
            {amount && safeAmount(amount) && (
              <div className="amount-preview">
                <span>Amount in words: </span>
                <strong>{new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(safeAmount(amount))}</strong>
              </div>
            )}
          </div>

          {/* Narration */}
          <div className="form-section">
            <label className="form-label">
              <FaPen className="label-icon" />
              Narration <span className="optional">(Optional)</span>
            </label>
            <textarea
              placeholder="Enter a brief description of the transaction..."
              maxLength={MAX_NARRATION}
              value={narration}
              onChange={(e) => setNarration(e.target.value)}
              className="narration-input"
              rows="3"
            />
            <div className="char-counter">
              {narration.length}/{MAX_NARRATION} characters
            </div>
          </div>

          {/* Preview Section */}
          {debitLedger && creditLedger && amount && safeAmount(amount) && (
            <div className="preview-section">
              <h4>
                <FaExchangeAlt className="preview-icon" />
                Transaction Preview
              </h4>
              <div className="preview-content">
                <div className="preview-item debit">
                  <span>Debit:</span>
                  <strong>{selectedDebitLedgerDetails?.name || 'Selected Ledger'}</strong>
                  <span className="amount">₹{safeAmount(amount)?.toLocaleString()}</span>
                </div>
                <div className="preview-arrow">↓</div>
                <div className="preview-item credit">
                  <span>Credit:</span>
                  <strong>{selectedCreditLedgerDetails?.name || 'Selected Ledger'}</strong>
                  <span className="amount">₹{safeAmount(amount)?.toLocaleString()}</span>
                </div>
              </div>
              {narration && (
                <div className="preview-narration">
                  <FaPen className="narration-icon" />
                  <span>{narration}</span>
                </div>
              )}
            </div>
          )}

          {/* Form Actions */}
          <div className="form-actions">
            <button
              type="submit"
              disabled={loading || ledgers.length === 0}
              className="submit-btn"
            >
              {loading ? (
                <span className="spinner"></span>
              ) : (
                <>
                  <FaSave /> Save Journal Entry
                </>
              )}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="reset-btn"
            >
              <FaTimes /> Reset
            </button>
          </div>

        </form>

      )}

      {/* Error Message */}
      {error && (
        <div className="message error">
          <FaExclamationTriangle className="message-icon" />
          <div className="message-content">
            <strong>Error</strong>
            <p>{error}</p>
          </div>
        </div>
      )}

      {/* Success Message */}
      {success && (
        <div className="message success">
          <FaCheckCircle className="message-icon" />
          <div className="message-content">
            <strong>Success</strong>
            <p>{success}</p>
          </div>
        </div>
      )}

      {/* Tips Section */}
      <div className="tips-section">
        <h4>
          <FaInfoCircle className="tips-icon" />
          Accounting Tips
        </h4>
        <ul>
          <li>Every transaction affects at least two accounts (Debit and Credit)</li>
          <li>Total Debits must always equal Total Credits</li>
          <li>Assets and Expenses increase with Debit</li>
          <li>Liabilities, Equity, and Income increase with Credit</li>
          <li>Use meaningful narrations for better record keeping</li>
        </ul>
      </div>

    </div>

  );

};

export default JournalEntry;