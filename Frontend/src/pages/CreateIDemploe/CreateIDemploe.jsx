import { useEffect, useState, useCallback } from "react";
import "./CreateIDemploe.scss";

import { auth, db } from "../../services/firebase";
import { ref, get } from "firebase/database";

import {
  createEmployee,
  fetchEmployees,
  removeEmployee,
  updateEmployee,
  resetEmployeePassword,
  getEmployeeStatistics
} from "../../services/employee.service";

import { fetchAllShops } from "../../services/shop.service";
import { sanitizeInput } from "../../utils/sanitizeInput";

import { useAuth } from "../../context/AuthContext";
import usePageTitle from "../../hooks/usePageTitle";

import Barcode from "react-barcode";

const CreateIDemploe = () => {

  usePageTitle("Virevo – Employee Management");

  const { user, loading: authLoading } = useAuth();

  // Shop selection
  const [selectedShop, setSelectedShop] = useState("");
  const [shops, setShops] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [statistics, setStatistics] = useState(null);

  // Form fields
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("cashier");
  const [email, setEmail] = useState("");
  const [salary, setSalary] = useState("");
  const [department, setDepartment] = useState("");
  const [address, setAddress] = useState("");

  // Edit mode
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [resetPasswordId, setResetPasswordId] = useState(null);
  const [newPassword, setNewPassword] = useState("");

  // UI states
  const [loadingCreate, setLoadingCreate] = useState(false);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [loadingStats, setLoadingStats] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const isSuperadmin = user?.role === "superadmin";
  const canManage = isSuperadmin || user?.role === "admin";

  /* ================= INITIAL SHOP ================= */

  useEffect(() => {
    if (!user) return;

    if (isSuperadmin) {
      setSelectedShop("");
    } else {
      setSelectedShop(user.shopId || "");
    }
  }, [user, isSuperadmin]);

  /* ================= LOAD SHOPS ================= */

  useEffect(() => {
    if (!isSuperadmin) return;

    const loadShops = async () => {
      try {
        const data = await fetchAllShops();
        setShops(data || []);
      } catch (err) {
        console.error(err);
        setError("Failed to load shops");
      }
    };

    loadShops();
  }, [isSuperadmin]);

  /* ================= LOAD EMPLOYEES ================= */

  const loadEmployees = useCallback(async (shopId) => {
    if (!shopId) return;

    try {
      setLoadingEmployees(true);
      setError("");

      const data = await fetchEmployees(shopId);
      setEmployees(data || []);

      // Load statistics
      await loadStatistics(shopId);

    } catch (err) {
      console.error(err);
      setError("Failed to load employees");
    } finally {
      setLoadingEmployees(false);
    }
  }, []);

  const loadStatistics = async (shopId) => {
    try {
      setLoadingStats(true);
      const stats = await getEmployeeStatistics(shopId);
      setStatistics(stats);
    } catch (err) {
      console.error("Failed to load statistics:", err);
    } finally {
      setLoadingStats(false);
    }
  };

  useEffect(() => {
    if (!selectedShop) return;
    loadEmployees(selectedShop);
  }, [selectedShop, loadEmployees]);

  /* ================= VALIDATION ================= */

  const validatePhone = (phone) => /^\d{10}$/.test(phone);
  const validateEmail = (email) => !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const formatTime = (ts) => ts ? new Date(ts).toLocaleString() : "—";

  /* ================= RESET FORM ================= */

  const resetForm = () => {
    setName("");
    setPhone("");
    setUsername("");
    setPassword("");
    setRole("cashier");
    setEmail("");
    setSalary("");
    setDepartment("");
    setAddress("");
    setEditingEmployee(null);
    setError("");
    setSuccess("");
    setResetPasswordId(null);
    setNewPassword("");
  };

  /* ================= CREATE EMPLOYEE ================= */

  const handleCreate = async (e) => {
    e.preventDefault();

    if (loadingCreate) return;

    setError("");
    setSuccess("");

    if (!auth.currentUser) {
      setError("Authentication error. Please login again.");
      return;
    }

    if (!selectedShop) {
      setError("Select a shop first");
      return;
    }

    const cleanName = sanitizeInput(name.trim());
    const cleanPhone = sanitizeInput(phone.trim());
    const cleanUsername = sanitizeInput(username.trim());
    const cleanEmail = sanitizeInput(email.trim());

    if (!cleanName) {
      setError("Employee name required");
      return;
    }

    if (!validatePhone(cleanPhone)) {
      setError("Phone must be exactly 10 digits");
      return;
    }

    if (!cleanUsername) {
      setError("Username required");
      return;
    }

    if (!password || password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    if (cleanEmail && !validateEmail(cleanEmail)) {
      setError("Invalid email format");
      return;
    }

    try {
      setLoadingCreate(true);

      const result = await createEmployee({
        shopId: selectedShop,
        username: cleanUsername,
        password,
        role,
        name: cleanName,
        phone: cleanPhone,
        email: cleanEmail || null,
        salary: salary ? parseFloat(salary) : 0,
        department: department || null,
        address: address || null
      });

      if (result.success) {
        setSuccess(
          `✅ Employee created successfully!\nID: ${result.employeeId} | Username: ${result.username}`
        );
        resetForm();
        await loadEmployees(selectedShop);
      } else {
        setError(result.error || "Failed to create employee");
      }

    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to create employee");
    } finally {
      setLoadingCreate(false);
    }
  };

  /* ================= UPDATE EMPLOYEE ================= */

  const handleEdit = (emp) => {
    setEditingEmployee(emp);
    setName(emp.name || "");
    setPhone(emp.phone || "");
    setUsername(emp.username || "");
    setRole(emp.role || "cashier");
    setEmail(emp.email || "");
    setSalary(emp.salary || "");
    setDepartment(emp.department || "");
    setAddress(emp.address || "");
    setPassword(""); // Don't pre-fill password
    setError("");
    setSuccess("");
    
    // Scroll to form
    document.querySelector('.employee-form')?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleUpdate = async (e) => {
    e.preventDefault();

    if (loadingCreate) return;
    if (!editingEmployee) return;

    setError("");
    setSuccess("");

    const cleanName = sanitizeInput(name.trim());
    const cleanPhone = sanitizeInput(phone.trim());
    const cleanEmail = sanitizeInput(email.trim());

    if (!cleanName) {
      setError("Employee name required");
      return;
    }

    if (!validatePhone(cleanPhone)) {
      setError("Phone must be exactly 10 digits");
      return;
    }

    if (cleanEmail && !validateEmail(cleanEmail)) {
      setError("Invalid email format");
      return;
    }

    try {
      setLoadingCreate(true);

      const updates = {
        name: cleanName,
        phone: cleanPhone,
        role,
        email: cleanEmail || null,
        salary: salary ? parseFloat(salary) : 0,
        department: department || null,
        address: address || null
      };

      if (password && password.length >= 6) {
        updates.password = password;
      }

      const result = await updateEmployee(selectedShop, editingEmployee.id, updates);

      if (result.success) {
        setSuccess("✅ Employee updated successfully!");
        resetForm();
        await loadEmployees(selectedShop);
      } else {
        setError(result.error || "Failed to update employee");
      }

    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to update employee");
    } finally {
      setLoadingCreate(false);
    }
  };

  /* ================= RESET PASSWORD ================= */

  const handleResetPassword = async (emp) => {
    if (!newPassword) {
      setError("Please enter a new password");
      return;
    }

    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    try {
      const result = await resetEmployeePassword(selectedShop, emp.id, newPassword);
      if (result.success) {
        setSuccess(`✅ Password reset for ${emp.name}`);
        setResetPasswordId(null);
        setNewPassword("");
      } else {
        setError(result.error || "Failed to reset password");
      }
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to reset password");
    }
  };

  /* ================= REMOVE EMPLOYEE ================= */

  const handleRemove = async (emp) => {
    if (!selectedShop) return;

    if (!window.confirm(`⚠️ Remove ${emp.name}?\nThis action can be undone by reactivating the employee.`)) return;

    try {
      await removeEmployee(selectedShop, emp.id, false);
      setSuccess(`✅ ${emp.name} has been deactivated`);
      await loadEmployees(selectedShop);
    } catch (err) {
      console.error(err);
      setError("Failed to remove employee");
    }
  };

  /* ================= ACCESS CONTROL ================= */

  if (authLoading) {
    return <div className="loading">Loading...</div>;
  }

  if (!user || !canManage) {
    return (
      <div className="unauthorized">
        <h2>Access Denied</h2>
        <p>You don't have permission to access this page.</p>
      </div>
    );
  }

  /* ================= UI ================= */

  return (
    <div className="employee-management">
      <h2>👥 Employee Management</h2>

      {/* Shop Selection (Superadmin Only) */}
      {isSuperadmin && (
        <div className="shop-selector">
          <label>Select Shop:</label>
          <select
            value={selectedShop}
            onChange={(e) => setSelectedShop(e.target.value)}
            className="shop-select"
          >
            <option value="">-- Select Shop --</option>
            {shops.map((shop) => (
              <option key={shop.id} value={shop.id}>
                {shop.name} ({shop.id})
              </option>
            ))}
          </select>
        </div>
      )}

      {selectedShop && (
        <>
          {/* Statistics Cards */}
          {statistics && !loadingStats && (
            <div className="stats-cards">
              <div className="stat-card">
                <span className="stat-value">{statistics.total}</span>
                <span className="stat-label">Total Employees</span>
              </div>
              <div className="stat-card success">
                <span className="stat-value">{statistics.active}</span>
                <span className="stat-label">Active</span>
              </div>
              <div className="stat-card warning">
                <span className="stat-value">{statistics.online}</span>
                <span className="stat-label">Online Now</span>
              </div>
              <div className="stat-card info">
                <span className="stat-value">₹{statistics.totalSalary?.toLocaleString()}</span>
                <span className="stat-label">Monthly Salary</span>
              </div>
            </div>
          )}

          {/* Employee Form */}
          <form onSubmit={editingEmployee ? handleUpdate : handleCreate} className="employee-form">
            <h3>{editingEmployee ? "✏️ Edit Employee" : "➕ Add New Employee"}</h3>
            
            <div className="form-row">
              <div className="form-group">
                <label>Full Name *</label>
                <input
                  type="text"
                  placeholder="Employee Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label>Phone Number *</label>
                <input
                  type="tel"
                  placeholder="10-digit phone number"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  required
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Username *</label>
                <input
                  type="text"
                  placeholder="Username (login ID)"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase())}
                  required
                  disabled={!!editingEmployee}
                />
              </div>

              <div className="form-group">
                <label>Password {!editingEmployee && "*"}</label>
                <input
                  type="password"
                  placeholder={editingEmployee ? "New password (optional)" : "Password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required={!editingEmployee}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Role *</label>
                <select value={role} onChange={(e) => setRole(e.target.value)}>
                  <option value="manager">Manager</option>
                  <option value="cashier">Cashier</option>
                  <option value="employee">Employee</option>
                  <option value="supervisor">Supervisor</option>
                </select>
              </div>

              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  placeholder="Email (optional)"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Monthly Salary (₹)</label>
                <input
                  type="number"
                  placeholder="Salary"
                  value={salary}
                  onChange={(e) => setSalary(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Department</label>
                <input
                  type="text"
                  placeholder="Department"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label>Address</label>
              <input
                type="text"
                placeholder="Address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>

            <div className="form-actions">
              <button type="submit" disabled={loadingCreate} className="btn-primary">
                {loadingCreate 
                  ? (editingEmployee ? "Updating..." : "Creating...") 
                  : (editingEmployee ? "Update Employee" : "Create Employee")}
              </button>
              
              {editingEmployee && (
                <button type="button" onClick={resetForm} className="btn-secondary">
                  Cancel Edit
                </button>
              )}
            </div>
          </form>

          {/* Messages */}
          {error && <div className="error-message">❌ {error}</div>}
          {success && <div className="success-message">✅ {success}</div>}

          {/* Password Reset Modal */}
          {resetPasswordId && (
            <div className="modal-overlay">
              <div className="modal">
                <h3>Reset Password</h3>
                <input
                  type="password"
                  placeholder="New password (min 6 characters)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
                <div className="modal-actions">
                  <button onClick={() => handleResetPassword(resetPasswordId)}>Confirm</button>
                  <button onClick={() => setResetPasswordId(null)}>Cancel</button>
                </div>
              </div>
            </div>
          )}

          {/* Employee List */}
          <div className="employee-list">
            <h3>📋 Employees ({employees.length})</h3>

            {loadingEmployees && <p className="loading-text">Loading employees...</p>}

            {!loadingEmployees && employees.length === 0 && (
              <p className="empty-state">No employees found. Create your first employee above.</p>
            )}

            <div className="employee-grid">
              {employees.map((emp) => (
                <div className="employee-card" key={emp.id}>
                  <div className="card-header">
                    <div className="employee-info">
                      <strong className="employee-name">{emp.name}</strong>
                      <span className={`role-badge role-${emp.role}`}>{emp.role}</span>
                      {emp.online && <span className="online-dot">● Online</span>}
                    </div>
                    <div className="card-actions">
                      <button className="icon-btn edit" onClick={() => handleEdit(emp)} title="Edit">
                        ✏️
                      </button>
                      <button 
                        className="icon-btn reset" 
                        onClick={() => setResetPasswordId(emp)} 
                        title="Reset Password"
                      >
                        🔑
                      </button>
                      <button className="icon-btn delete" onClick={() => handleRemove(emp)} title="Deactivate">
                        🗑️
                      </button>
                    </div>
                  </div>

                  <div className="card-body">
                    <p><strong>ID:</strong> {emp.id}</p>
                    <p><strong>Username:</strong> {emp.username}</p>
                    <p><strong>Phone:</strong> {emp.phone || "—"}</p>
                    <p><strong>Email:</strong> {emp.email || "—"}</p>
                    {emp.salary > 0 && <p><strong>Salary:</strong> ₹{emp.salary.toLocaleString()}</p>}
                    {emp.department && <p><strong>Dept:</strong> {emp.department}</p>}
                    <p><strong>Last Login:</strong> {formatTime(emp.lastLoginAt)}</p>
                    <p><strong>Created:</strong> {formatTime(emp.createdAt)}</p>
                  </div>

                  <div className="card-barcode">
                    <Barcode value={emp.id} width={1.5} height={40} margin={0} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default CreateIDemploe;