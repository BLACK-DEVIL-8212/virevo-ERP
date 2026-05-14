// src/pages/SuperAdmin/SuperAdmin.jsx

import { useEffect, useMemo, useState } from "react";
import { ref, onValue, off } from "firebase/database";
import { db } from "../../services/firebase";
import { useAuth } from "../../context/AuthContext";
import { Navigate } from "react-router-dom";
import { getPlanDetails } from "../../constants/subscriptionPlans";
import "./SuperAdmin.scss";

const SuperAdmin = () => {
  const { user } = useAuth();

  const isSuperadmin = user?.role === "superadmin";

  const [stats, setStats] = useState({
    totalUsers: 0,
    totalShops: 0,
    revenue: 0,
    profit: 0,
    gst: 0,
    itr: 0,
    mrr: 0,
    activeSubscriptions: 0,
    expiredSubscriptions: 0
  });

  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedFilter, setSelectedFilter] = useState("all"); // all, active, expired

  /* 💰 FORMATTER */
  const formatCurrency = useMemo(
    () =>
      new Intl.NumberFormat("en-IN", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      }),
    []
  );

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    try {
      return new Date(dateString).toLocaleDateString("en-IN");
    } catch {
      return "Invalid date";
    }
  };

  useEffect(() => {
    if (!isSuperadmin) return;

    const usersRef = ref(db, "users");

    const unsubscribe = onValue(
      usersRef,
      (snapshot) => {
        try {
          let revenue = 0;
          const usersSet = new Set();
          const shopsSet = new Set();
          let activeCount = 0;
          let expiredCount = 0;

          const list = [];
          const now = new Date();

          snapshot.forEach((child) => {
            const u = child.val();
            if (!u || u.role !== "admin") return;

            const plan = u.plan;
            const planExpiry = u.planExpiry;
            if (!plan) return;

            const planData = getPlanDetails(plan);
            const amount = planData?.price || 0;

            const isActive = planExpiry && new Date(planExpiry) > now;

            if (isActive) {
              revenue += amount;
              activeCount += 1;
            } else {
              expiredCount += 1;
            }

            usersSet.add(child.key);
            if (u.shopId) shopsSet.add(u.shopId);

            list.push({
              id: child.key,
              shopId: u.shopId || "N/A",
              shopName: u.shopName || u.companyName || "N/A",
              ownerName: u.name || "Unknown",
              email: u.email || "N/A",
              plan,
              planName: planData?.name || plan,
              amount,
              planExpiry: u.planExpiry,
              status: isActive ? "active" : "expired",
              createdAt: u.createdAt,
              lastLoginAt: u.lastLoginAt
            });
          });

          const totalUsers = usersSet.size;
          const totalShops = shopsSet.size;

          const profit = revenue * 0.7; // 70% profit margin
          const gst = profit * 0.18; // 18% GST
          const mrr = revenue / 12; // Monthly recurring revenue

          // Income Tax Calculation (Indian tax slabs) - estimated
          let tax = 0;
          const taxableIncome = profit - gst;
          if (taxableIncome <= 250000) {
            tax = 0;
          } else if (taxableIncome <= 500000) {
            tax = (taxableIncome - 250000) * 0.05;
          } else if (taxableIncome <= 1000000) {
            tax = 12500 + (taxableIncome - 500000) * 0.2;
          } else {
            tax = 112500 + (taxableIncome - 1000000) * 0.3;
          }

          setStats({
            totalUsers,
            totalShops,
            revenue,
            profit,
            gst,
            itr: tax,
            mrr,
            activeSubscriptions: activeCount,
            expiredSubscriptions: expiredCount
          });

          setSubscriptions(
            list.sort((a, b) => {
              const dateA = a.createdAt || 0;
              const dateB = b.createdAt || 0;
              return dateB - dateA;
            })
          );

          setLoading(false);
        } catch (err) {
          console.error("Error loading dashboard:", err);
          setError("Failed to load dashboard data");
          setLoading(false);
        }
      },
      (firebaseErr) => {
        console.error("Firebase error:", firebaseErr);
        setError("Database connection error. Please check your permissions.");
        setLoading(false);
      }
    );

    return () => {
      off(usersRef);
      unsubscribe();
    };
  }, [isSuperadmin]);

  const filteredSubscriptions = useMemo(() => {
    return subscriptions.filter((sub) => {
      if (selectedFilter === "active") return sub.status === "active";
      if (selectedFilter === "expired") return sub.status === "expired";
      return true;
    });
  }, [subscriptions, selectedFilter]);

  const escapeCsvCell = (value) => {
    const str = value == null ? "" : String(value);
    // Escape quotes and wrap in quotes to be safe with commas/newlines.
    return `"${str.replace(/"/g, '""')}"`;
  };

  const exportToCSV = () => {
    const headers = [
      "Shop Name",
      "Owner Name",
      "Email",
      "Plan",
      "Amount",
      "Status",
      "Expiry Date"
    ];

    const csvRows = filteredSubscriptions.map((sub) => [
      escapeCsvCell(sub.shopName),
      escapeCsvCell(sub.ownerName),
      escapeCsvCell(sub.email),
      escapeCsvCell(sub.planName),
      escapeCsvCell(sub.amount),
      escapeCsvCell(sub.status),
      escapeCsvCell(formatDate(sub.planExpiry))
    ]);

    const csvContent = [
      headers.map(escapeCsvCell).join(","),
      ...csvRows.map((row) => row.join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `subscriptions_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isSuperadmin) {
    // Render a normal component (no conditional hooks) but redirect.
    return <Navigate to="/dashboard" replace />;
  }

  if (loading) {
    return (
      <div className="superadmin">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading SaaS dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="superadmin">
        <div className="error-container">
          <h2>⚠️ {error}</h2>
          <button onClick={() => window.location.reload()}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="superadmin">
      <div className="dashboard-header">
        <h1>SaaS Owner Dashboard</h1>
        <div className="header-actions">
          <button onClick={exportToCSV} className="export-btn">
            📊 Export to CSV
          </button>
        </div>
      </div>

      {/* ================= KPI CARDS ================= */}
      <div className="kpi-grid">
        <div className="card">
          <div className="card-icon">👥</div>
          <div className="card-content">
            <h3>Total Users</h3>
            <span className="value">{stats.totalUsers}</span>
            <small>Active Shops: {stats.totalShops}</small>
          </div>
        </div>

        <div className="card">
          <div className="card-icon">💰</div>
          <div className="card-content">
            <h3>Total Revenue</h3>
            <span className="value">₹ {formatCurrency.format(stats.revenue)}</span>
            <small>Lifetime revenue</small>
          </div>
        </div>

        <div className="card success">
          <div className="card-icon">📈</div>
          <div className="card-content">
            <h3>Profit</h3>
            <span className="value">₹ {formatCurrency.format(stats.profit)}</span>
            <small>70% margin</small>
          </div>
        </div>

        <div className="card">
          <div className="card-icon">📅</div>
          <div className="card-content">
            <h3>MRR (Monthly)</h3>
            <span className="value">₹ {formatCurrency.format(stats.mrr)}</span>
            <small>Recurring revenue</small>
          </div>
        </div>

        <div className="card">
          <div className="card-icon">📊</div>
          <div className="card-content">
            <h3>Active Subs</h3>
            <span className="value">{stats.activeSubscriptions}</span>
            <small>Active plans</small>
          </div>
        </div>

        <div className="card warning">
          <div className="card-icon">🧾</div>
          <div className="card-content">
            <h3>GST (18%)</h3>
            <span className="value">₹ {formatCurrency.format(stats.gst)}</span>
            <small>Tax payable</small>
          </div>
        </div>

        <div className="card danger">
          <div className="card-icon">🏛️</div>
          <div className="card-content">
            <h3>Income Tax</h3>
            <span className="value">₹ {formatCurrency.format(stats.itr)}</span>
            <small>Estimated tax</small>
          </div>
        </div>
      </div>

      {/* ================= FILTERS ================= */}
      <div className="filters-section">
        <div className="filter-buttons">
          <button
            className={selectedFilter === "all" ? "active" : ""}
            onClick={() => setSelectedFilter("all")}
          >
            All Subscriptions ({subscriptions.length})
          </button>
          <button
            className={selectedFilter === "active" ? "active" : ""}
            onClick={() => setSelectedFilter("active")}
          >
            Active ({stats.activeSubscriptions})
          </button>
          <button
            className={selectedFilter === "expired" ? "active" : ""}
            onClick={() => setSelectedFilter("expired")}
          >
            Expired ({stats.expiredSubscriptions})
          </button>
        </div>
      </div>

      {/* ================= TABLE ================= */}
      <div className="subscriptions-table">
        <h2>Subscription Management</h2>

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Shop Name</th>
                <th>Owner Name</th>
                <th>Email</th>
                <th>Plan</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Expiry Date</th>
              </tr>
            </thead>
            <tbody>
              {filteredSubscriptions.map((s, i) => (
                <tr key={s.id}>
                  <td>{i + 1}</td>
                  <td>
                    <strong>{s.shopName}</strong>
                    <small className="shop-id">{s.shopId}</small>
                  </td>
                  <td>{s.ownerName}</td>
                  <td className="email-cell">{s.email}</td>
                  <td>
                    <span className="plan-badge">{s.planName}</span>
                  </td>
                  <td className="amount-cell">₹ {formatCurrency.format(s.amount)}</td>
                  <td>
                    <span className={`status-badge ${s.status}`}>
                      {s.status === "active" ? "✅ Active" : "❌ Expired"}
                    </span>
                  </td>
                  <td className="date-cell">{formatDate(s.planExpiry)}</td>
                </tr>
              ))}

              {filteredSubscriptions.length === 0 && (
                <tr>
                  <td colSpan="8" className="no-data">
                    📭 No subscriptions found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default SuperAdmin;

