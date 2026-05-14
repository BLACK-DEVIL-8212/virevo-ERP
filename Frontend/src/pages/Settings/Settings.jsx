/**
 * Settings.jsx — Fixed & production-ready
 *
 * Fixes applied:
 *  [BUG]      paySalary() and addStaff() used alert() for feedback — blocks the
 *             main thread and is suppressed in iframes. Replaced with the existing
 *             success/error state pattern used everywhere else.
 *
 *  [BUG]      markAttendance() also used alert() — same fix.
 *
 *  [BUG]      handleChangePassword() and the inline security buttons used alert()
 *             — replaced with state-based feedback.
 *
 *  [BUG]      handleSave() used `return setError(x)` (returns undefined from
 *             setState). Replaced with `setError(x); return;`.
 *
 *  [BUG]      paySalary() had no loading guard — rapid clicks would fire multiple
 *             Firebase writes. Added payingSalary loading state.
 *
 *  [BUG]      addStaff() had no loading guard — same issue. Added addingStaff
 *             loading state.
 *
 *  [BUG]      Salary calculation was duplicated verbatim between the staff table
 *             and the attendance KPI grid (identical loop, identical math).
 *             Extracted into a shared pure helper calcMonthStats().
 *
 *  [BUG]      perDay = baseSalary / workingDays crashed with division-by-zero
 *             when workingDays is 0. Added a guard.
 *
 *  [BUG]      Inline style on the status <td> (color, fontWeight) bypassed the
 *             design system. Replaced with className-based badge styling.
 *
 *  [BUG]      The `employees` and `payments` local variables in the staff
 *             useEffect were assigned but never read — dead code. Removed.
 *
 *  [SECURITY] sendPasswordResetEmail, updatePassword, and signOut were defined as
 *             inline async arrow functions on onClick props — uncacheable and
 *             untestable. Extracted to named handler functions.
 *
 *  [DESIGN]   success/error auto-dismiss used bare setTimeout with no cleanup.
 *             Replaced with a single useRef-based timer cleared on unmount.
 *
 *  [DESIGN]   Firebase imports were split across two import statements from the
 *             same module. Consolidated into one.
 *
 *  [DESIGN]   Loading state showed an unstyled plain-text "Loading..." string.
 *             Replaced with a classed spinner.
 *
 *  [DESIGN]   Billing Settings tab had no Save button. Added one using the
 *             existing handleSave() which covers all form fields.
 *
 *  [DESIGN]   employeeData preview card was rendered outside all tab panels so
 *             it was always visible regardless of active tab. Moved inside the
 *             staff tab, right below the employee search input.
 */

import { useEffect, useRef, useState } from "react";
import "./Settings.scss";
import { useAuth } from "../../context/AuthContext";
import { getShopSettings, saveShopSettings } from "../../services/settings.service";
import { sendPasswordResetEmail, updatePassword, signOut } from "firebase/auth";
import { auth, db } from "../../services/firebase";
import { ref, onValue, push, set, update, get } from "firebase/database";
import { getShopOptionLabel, normalizeShopRecord } from "../../services/shop.service";

/* ─────────────────────────── PURE HELPERS ─────────────────────────── */

/**
 * Compute attendance & salary stats for one employee for the current month.
 * Extracted from the duplicated inline logic in both the salary table and KPI grid.
 */
const calcMonthStats = (emp, attendanceData) => {
  const now = new Date();
  const totalDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  let sundays = 0, present = 0, absent = 0, medical = 0;

  for (let d = 1; d <= totalDays; d++) {
    const date = new Date(now.getFullYear(), now.getMonth(), d);
    if (date.getDay() === 0) { sundays++; continue; }
    const dateKey = date.toLocaleDateString("en-CA");
    const status = attendanceData?.[dateKey]?.[emp.id]?.status;
    if (status === "present") present++;
    else if (status === "medical") medical++;
    else absent++;
  }

  const workingDays = totalDays - sundays;
  const effectivePresent = present + medical;
  const extraLeaves = Math.max(0, workingDays - effectivePresent);
  const baseSalary = Number(emp.salary || 0);
  // FIX: guard against division-by-zero
  const perDay = workingDays > 0 ? baseSalary / workingDays : 0;
  const finalSalary = Math.max(0, baseSalary - extraLeaves * perDay);
  const percentage = workingDays > 0
    ? ((effectivePresent / workingDays) * 100).toFixed(1)
    : "0.0";

  return { workingDays, present, absent, medical, effectivePresent, extraLeaves, finalSalary, percentage };
};

/* ─────────────────────────── COMPONENT ─────────────────────────── */

const Settings = () => {
  const { user } = useAuth();

  const [shops, setShops] = useState([]);
  const [selectedShopId, setSelectedShopId] = useState("");
  const [activeTab, setActiveTab] = useState("shop");

  const effectiveShopId = user?.role === "superadmin" ? selectedShopId : user?.shopId;

  const [form, setForm] = useState({
    companyName: "", address: "", city: "", pincode: "",
    gstin: "", upiId: "", invoicePrefix: "INV", estimatePrefix: "EST", phone: "",
  });

  const [staffList, setStaffList] = useState([]);
  const [staffName, setStaffName] = useState("");
  const [salary, setSalary] = useState("");
  const [employeeData, setEmployeeData] = useState(null);
  const [selectedStaff, setSelectedStaff] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [salaryPayments, setSalaryPayments] = useState([]);
  const [attendanceData, setAttendanceData] = useState({});

  const [newPassword, setNewPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [payingSalary, setPayingSalary] = useState(false);
  const [addingStaff, setAddingStaff] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  // FIX: single ref-based dismiss timer — avoids setState-after-unmount leaks
  const dismissTimer = useRef(null);
  const flash = (setter, msg, duration = 4000) => {
    setter(msg);
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    dismissTimer.current = setTimeout(() => setter(""), duration);
  };
  useEffect(() => () => { if (dismissTimer.current) clearTimeout(dismissTimer.current); }, []);

  /* ── Load shops (superadmin) ── */
  useEffect(() => {
    if (user?.role !== "superadmin") return;
    const unsub = onValue(ref(db, "shops"), (snap) => {
      const list = [];
      snap.forEach((child) =>
        list.push(normalizeShopRecord(child.key, child.val()))
      );
      setShops(list.sort((a, b) => a.name.localeCompare(b.name)));
    });
    return () => unsub();
  }, [user]);

  /* ── Load settings ── */
  useEffect(() => {
    if (!effectiveShopId) { setLoading(false); return; }
    const load = async () => {
      try {
        setLoading(true);
        const data = await getShopSettings(effectiveShopId);
        if (data) setForm((prev) => ({ ...prev, ...data }));
      } catch {
        flash(setError, "Failed to load settings");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [effectiveShopId]);

  /* ── Load staff + payments ── */
  useEffect(() => {
    if (!effectiveShopId) return;
    // FIX: removed dead local `employees` / `payments` variables
    const unsubStaff = onValue(ref(db, `shops/${effectiveShopId}/employees`), (snap) => {
      const list = [];
      snap.forEach((child) => list.push({ id: child.key, ...child.val() }));
      setStaffList(list);
    });
    const unsubPayments = onValue(ref(db, `shops/${effectiveShopId}/salaryPayments`), (snap) => {
      const list = [];
      snap.forEach((child) => list.push({ id: child.key, ...child.val() }));
      setSalaryPayments(list);
    });
    return () => { unsubStaff(); unsubPayments(); };
  }, [effectiveShopId]);

  /* ── Load attendance ── */
  useEffect(() => {
    if (!effectiveShopId) return;
    const unsub = onValue(ref(db, `shops/${effectiveShopId}/attendance`), (snap) => {
      setAttendanceData(snap.exists() ? snap.val() : {});
    });
    return () => unsub();
  }, [effectiveShopId]);

  /* ─────────── Handlers ─────────── */

  const handleChange = (e) => setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSave = async (e) => {
    e.preventDefault();
    if (!effectiveShopId) {
      flash(setError, "Select a shop first");
      return; // FIX: was `return setError(x)` which returns undefined
    }
    setSaving(true);
    setError(""); setSuccess("");
    try {
      await saveShopSettings(effectiveShopId, form);
      flash(setSuccess, "Settings saved successfully");
    } catch {
      flash(setError, "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleEmployeeSearch = async (empId) => {
    setStaffName(empId);
    if (!empId) { setEmployeeData(null); return; }
    const snap = await get(ref(db, `shops/${effectiveShopId}/employees/${empId}`));
    setEmployeeData(snap.exists() ? { id: empId, ...snap.val() } : null);
  };

  const addStaff = async () => {
    if (!employeeData || !salary || addingStaff) return;
    setAddingStaff(true);
    try {
      await update(ref(db, `shops/${effectiveShopId}/employees/${employeeData.id}`), {
        salary: Number(salary),
      });
      flash(setSuccess, `Salary ₹${salary} assigned to ${employeeData.name}`);
      setStaffName(""); setSalary(""); setEmployeeData(null);
    } catch {
      flash(setError, "Failed to assign salary");
    } finally {
      setAddingStaff(false);
    }
  };

  const paySalary = async () => {
    if (!selectedStaff || !payAmount || payingSalary) return;
    setPayingSalary(true);
    try {
      const paymentRef = push(ref(db, `shops/${effectiveShopId}/salaryPayments`));
      await set(paymentRef, {
        employeeId: selectedStaff,
        amount: Number(payAmount),
        month: new Date().toISOString().slice(0, 7),
        paidAt: Date.now(),
      });
      flash(setSuccess, `Salary ₹${payAmount} recorded successfully`);
      setPayAmount(""); setSelectedStaff("");
    } catch {
      flash(setError, "Failed to record salary payment");
    } finally {
      setPayingSalary(false);
    }
  };

  const markAttendance = async () => {
    if (!staffList.length) return;
    const today = new Date().toLocaleDateString("en-CA");
    const updates = {};
    staffList.forEach((emp) => { updates[emp.id] = { status: "present" }; });
    try {
      await set(ref(db, `shops/${effectiveShopId}/attendance/${today}`), updates);
      flash(setSuccess, "Attendance marked for all employees");
    } catch {
      flash(setError, "Failed to mark attendance");
    }
  };

  // FIX: extracted from inline onClick props
  const handleSendPasswordReset = async () => {
    try {
      await sendPasswordResetEmail(auth, user.email);
      flash(setSuccess, `Password reset email sent to ${user.email}`);
    } catch {
      flash(setError, "Failed to send password reset email");
    }
  };

  const handleChangePassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      flash(setError, "Password must be at least 6 characters");
      return;
    }
    setChangingPassword(true);
    try {
      await updatePassword(auth.currentUser, newPassword);
      flash(setSuccess, "Password updated successfully");
      setNewPassword("");
    } catch (err) {
      console.error(err);
      flash(setError, "Password update failed — please sign in again and retry");
    } finally {
      setChangingPassword(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      window.location.href = "/login";
    } catch {
      flash(setError, "Logout failed. Please try again.");
    }
  };

  /* ─────────── Tab config ─────────── */
  const tabs = [
    { id: "shop",       label: "🏪 Shop" },
    { id: "staff",      label: "👥 Staff" },
    { id: "attendance", label: "📅 Attendance" },
    { id: "billing",    label: "🧾 Billing" },
    { id: "security",   label: "🔒 Security" },
  ];

  const currentMonth = new Date().toISOString().slice(0, 7);

  /* ─────────── Render ─────────── */
  if (loading) {
    return (
      <div className="settings-page">
        <div className="settings-loading">
          <div className="settings-spinner" />
          <p>Loading settings…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-page">
      <div className="settings-layout">

        {/* ── Sidebar ── */}
        <aside className="settings-sidebar">
          <p className="sidebar-title">Settings</p>
          <nav className="sidebar-nav">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={`sidebar-btn${activeTab === tab.id ? " active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* ── Main content ── */}
        <main className="settings-content">

          {error   && <div className="feedback feedback--error">{error}</div>}
          {success && <div className="feedback feedback--success">{success}</div>}

          {/* ══ SHOP ══ */}
          {activeTab === "shop" && (
            <section className="content-section">
              <h2 className="section-title">Shop Settings</h2>

              {user?.role === "superadmin" && (
                <div className="field-group">
                  <label className="field-label">Select Shop</label>
                  <select
                    className="field-select"
                    value={selectedShopId}
                    onChange={(e) => setSelectedShopId(e.target.value)}
                  >
                    <option value="">— Select Shop —</option>
                    {shops.map((s) => (
                      <option key={s.id} value={s.id}>{getShopOptionLabel(s)}</option>
                    ))}
                  </select>
                </div>
              )}

              <form onSubmit={handleSave} className="settings-form">
                <div className="form-grid">
                  {[
                    { name: "companyName", label: "Company Name", required: true },
                    { name: "address",     label: "Address" },
                    { name: "city",        label: "City" },
                    { name: "pincode",     label: "Pincode" },
                    { name: "gstin",       label: "GSTIN" },
                    { name: "upiId",       label: "UPI ID" },
                    { name: "phone",       label: "Company Phone" },
                  ].map(({ name, label, required }) => (
                    <div className="field-group" key={name}>
                      <label className="field-label">{label}{required && " *"}</label>
                      <input
                        className="field-input"
                        name={name}
                        value={form[name]}
                        onChange={handleChange}
                        required={!!required}
                        placeholder={label}
                      />
                    </div>
                  ))}
                </div>
                <button type="submit" className="btn btn--primary" disabled={saving}>
                  {saving ? "Saving…" : "Save Settings"}
                </button>
              </form>
            </section>
          )}

          {/* ══ STAFF ══ */}
          {activeTab === "staff" && (
            <section className="content-section">
              <h2 className="section-title">Staff Salary Management</h2>

              <div className="staff-split">
                {/* Left */}
                <div className="staff-left">
                  <div className="settings-card">
                    <h3 className="card-title">Assign Salary</h3>

                    <div className="field-group">
                      <label className="field-label">Employee ID</label>
                      <input
                        className="field-input"
                        placeholder="Search by Employee ID"
                        value={staffName}
                        onChange={(e) => handleEmployeeSearch(e.target.value)}
                      />
                    </div>

                    {/* FIX: moved inside staff tab, not floating outside all tabs */}
                    {employeeData && (
                      <div className="employee-preview">
                        <p><span className="preview-label">Name</span> {employeeData.name}</p>
                        <p><span className="preview-label">Role</span> {employeeData.role}</p>
                        <p>
                          <span className="preview-label">Status</span>
                          <span className={`badge ${employeeData.active ? "badge--active" : "badge--inactive"}`}>
                            {employeeData.active ? "Active" : "Inactive"}
                          </span>
                        </p>
                      </div>
                    )}

                    <div className="field-group">
                      <label className="field-label">Monthly Salary (₹)</label>
                      <input
                        className="field-input"
                        type="number"
                        min="0"
                        placeholder="Enter salary amount"
                        value={salary}
                        onChange={(e) => setSalary(e.target.value)}
                      />
                    </div>

                    <button
                      className="btn btn--primary"
                      onClick={addStaff}
                      disabled={addingStaff || !employeeData || !salary}
                    >
                      {addingStaff ? "Assigning…" : "Assign Salary"}
                    </button>

                    <div className="card-divider" />

                    <h3 className="card-title">Pay Salary</h3>

                    <div className="field-group">
                      <label className="field-label">Select Employee</label>
                      <select
                        className="field-select"
                        value={selectedStaff}
                        onChange={(e) => setSelectedStaff(e.target.value)}
                      >
                        <option value="">— Select Employee —</option>
                        {staffList.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} (₹{s.salary ?? "—"})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="field-group">
                      <label className="field-label">Amount (₹)</label>
                      <input
                        className="field-input"
                        type="number"
                        min="0"
                        placeholder="Enter amount"
                        value={payAmount}
                        onChange={(e) => setPayAmount(e.target.value)}
                      />
                    </div>

                    <button
                      className="btn btn--primary"
                      onClick={paySalary}
                      disabled={payingSalary || !selectedStaff || !payAmount}
                    >
                      {payingSalary ? "Processing…" : "Pay Salary"}
                    </button>
                  </div>
                </div>

                {/* Right */}
                <div className="staff-right">
                  <div className="settings-card">
                    <h3 className="card-title">All Employees</h3>
                    <div className="table-wrapper">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>#</th><th>ID</th><th>Name</th>
                            <th>Base Salary</th><th>Month Due</th><th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {staffList.map((emp, i) => {
                            const { finalSalary } = calcMonthStats(emp, attendanceData);
                            const paid = salaryPayments
                              .filter((p) => p.employeeId === emp.id && p.month === currentMonth)
                              .reduce((s, p) => s + p.amount, 0);
                            const remaining = Math.max(0, finalSalary - paid);
                            const isPaid = remaining <= 0;
                            return (
                              <tr key={emp.id}>
                                <td>{i + 1}</td>
                                <td className="td-mono">{emp.id}</td>
                                <td>{emp.name}</td>
                                <td>₹{Number(emp.salary || 0).toLocaleString("en-IN")}</td>
                                <td>₹{Math.round(remaining).toLocaleString("en-IN")}</td>
                                {/* FIX: className badge instead of inline style */}
                                <td>
                                  <span className={`badge ${isPaid ? "badge--paid" : "badge--unpaid"}`}>
                                    {isPaid ? "Paid" : "Unpaid"}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                          {staffList.length === 0 && (
                            <tr><td colSpan={6} className="td-empty">No employees found</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* ══ ATTENDANCE ══ */}
          {activeTab === "attendance" && (
            <section className="content-section">
              <div className="section-header">
                <h2 className="section-title">Attendance KPI</h2>
                <button className="btn btn--outline" onClick={markAttendance}>
                  ✅ Mark All Present Today
                </button>
              </div>

              <div className="kpi-grid">
                {staffList.map((emp) => {
                  // FIX: shared helper — no more duplicated loop
                  const { percentage, present, absent, medical, extraLeaves, finalSalary } =
                    calcMonthStats(emp, attendanceData);
                  const pct = Number(percentage);

                  return (
                    <div className="kpi-card" key={emp.id}>
                      <div className="kpi-header">
                        <h3>{emp.name}</h3>
                        <span className="kpi-id">{emp.id}</span>
                      </div>

                      <div className="kpi-attendance-bar">
                        <div
                          className="kpi-attendance-fill"
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>

                      <div className="kpi-stats">
                        <div className="kpi-stat">
                          <span>Attendance</span>
                          <strong className={pct >= 90 ? "text-green" : pct >= 70 ? "text-yellow" : "text-red"}>
                            {percentage}%
                          </strong>
                        </div>
                        <div className="kpi-stat">
                          <span>Present</span>
                          <strong>{present}</strong>
                        </div>
                        <div className="kpi-stat">
                          <span>Medical</span>
                          <strong>{medical}</strong>
                        </div>
                        <div className="kpi-stat">
                          <span>Absent</span>
                          <strong className={absent > 0 ? "text-red" : ""}>{absent}</strong>
                        </div>
                        <div className="kpi-stat">
                          <span>Leaves Deducted</span>
                          <strong>{extraLeaves}</strong>
                        </div>
                        <div className="kpi-stat kpi-stat--highlight">
                          <span>Payable</span>
                          <strong>₹{Math.round(finalSalary).toLocaleString("en-IN")}</strong>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {staffList.length === 0 && (
                  <p className="empty-state">No employees found.</p>
                )}
              </div>
            </section>
          )}

          {/* ══ BILLING ══ */}
          {activeTab === "billing" && (
            <section className="content-section">
              <h2 className="section-title">Billing Settings</h2>
              <p className="section-desc">Configure invoice prefixes used on printed invoices.</p>

              <form onSubmit={handleSave} className="settings-form">
                <div className="form-grid form-grid--narrow">
                  <div className="field-group">
                    <label className="field-label">Invoice Prefix</label>
                    <input
                      className="field-input"
                      name="invoicePrefix"
                      placeholder="e.g. INV"
                      value={form.invoicePrefix}
                      onChange={handleChange}
                    />
                  </div>
                  <div className="field-group">
                    <label className="field-label">Estimate Prefix</label>
                    <input
                      className="field-input"
                      name="estimatePrefix"
                      placeholder="e.g. EST"
                      value={form.estimatePrefix}
                      onChange={handleChange}
                    />
                  </div>
                </div>
                {/* FIX: billing tab had no save button */}
                <button type="submit" className="btn btn--primary" disabled={saving}>
                  {saving ? "Saving…" : "Save Settings"}
                </button>
              </form>
            </section>
          )}

          {/* ══ SECURITY ══ */}
          {activeTab === "security" && (
            <section className="content-section">
              <h2 className="section-title">Security Settings</h2>

              <div className="security-card">

                <div className="security-info-row">
                  <span className="info-label">Account Email</span>
                  <span className="info-value">{user?.email}</span>
                </div>

                <div className="security-action-row">
                  <div>
                    <p className="action-title">Reset Password via Email</p>
                    <p className="action-desc">We will send a reset link to {user?.email}</p>
                  </div>
                  {/* FIX: extracted from inline onClick */}
                  <button className="btn btn--outline" onClick={handleSendPasswordReset}>
                    Send Reset Email
                  </button>
                </div>

                <div className="security-action-row">
                  <div className="password-change-group">
                    <p className="action-title">Change Password Directly</p>
                    <input
                      className="field-input"
                      type="password"
                      placeholder="New password (min 6 chars)"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                    />
                  </div>
                  <button
                    className="btn btn--primary"
                    onClick={handleChangePassword}
                    disabled={changingPassword}
                  >
                    {changingPassword ? "Updating…" : "Update Password"}
                  </button>
                </div>

                <div className="security-action-row security-action-row--danger">
                  <div>
                    <p className="action-title">Sign Out</p>
                    <p className="action-desc">Sign out from this device</p>
                  </div>
                  {/* FIX: extracted from inline onClick */}
                  <button className="btn btn--danger" onClick={handleLogout}>
                    Sign Out
                  </button>
                </div>

              </div>
            </section>
          )}

        </main>
      </div>
    </div>
  );
};

export default Settings;
