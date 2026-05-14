import React from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useLocation
} from "react-router-dom";

import "./App.scss";
import { useAuth } from "./context/AuthContext";

/* ================= COMPONENTS ================= */

import Navbar from "./components/Navbar/Navbar";
import ProtectedRoute from "./components/ProtectedRoute/ProtectedRoute";
import ErrorBoundary from "./components/ErrorBoundary/ErrorBoundary";
import Loader from "./components/Loader/Loader";

/* ================= PAGES ================= */

import Login from "./pages/Login/Login";
import SignUp from "./pages/SignUp/SignUp";
import ForgotPassword from "./pages/Forgot-Password/Forgot-Password";
import Home from "./pages/Home/Home";
import Dashboard from "./pages/Dashboard/Dashboard";
import SuperAdmin from "./pages/SuperAdmin/SuperAdmin";
import Attendence from "./pages/Attendance/Attendance";
import Billing from "./pages/Billing/Billing";
import Inventory from "./pages/Inventory/Inventory";
import Profile from "./pages/Profile/Profile";
import CreateIDemploe from "./pages/CreateIDemploe/CreateIDemploe";
import Settings from "./pages/Settings/Settings";
import Payment from "./pages/Payment/Payment";

/* ================= ACCOUNTING ================= */

import LedgerList from "./pages/Accounting/LedgerList/LedgerList";
import TrialBalance from "./pages/Accounting/TrialBalance/TrialBalance";
import JournalEntry from "./pages/Accounting/JournalEntry/JournalEntry";

/* ================= LAYOUT ================= */

const Layout = ({ children }) => {

  const location = useLocation();

  const hideNavbarRoutes = [
    "/",
    "/login",
    "/signup"
  ];

  const hideNavbar =
    hideNavbarRoutes.includes(location.pathname);

  return (

    <div className="app">

      {!hideNavbar && <Navbar />}

      <main className="main-content">
        {children}
      </main>

    </div>

  );

};

/* ================= ROUTES ================= */

const AppRoutes = () => {

  const { user, loading } = useAuth();

  /* ---------- GLOBAL LOADER ---------- */

  if (loading) {

    return (
      <div className="global-loader">
        <Loader />
      </div>
    );

  }

  /* ---------- SUBSCRIPTION CHECK ---------- */

  const hasValidSubscription = () => {

    if (!user) return false;

    /* Employees never need subscription */
    if (user.type === "employee") return true;

    /* Superadmin bypass */
    if (user.role === "superadmin") return true;

    /* Admin must have subscription */
    if (!user.plan || !user.planExpiry) return false;

    const expiry = new Date(user.planExpiry);

    return expiry > new Date();

  };

  const shopId = user?.shopId;

  const requireSubscription = (component) => {

    return hasValidSubscription()
      ? component
      : <Navigate to="/payment" replace />;

  };

  /* ================= ROUTES ================= */

  return (

    <Layout>

      <Routes>

        {/* ================= PUBLIC ================= */}

        <Route path="/" element={<Home />} />

        <Route
          path="/login"
          element={
            user
              ? <Navigate to="/dashboard" replace />
              : <Login />
          }
        />

        <Route
          path="/signup"
          element={
            user
              ? <Navigate to="/dashboard" replace />
              : <SignUp />
          }
        />

        {/* ================= PAYMENT ================= */}

        <Route
          path="/payment"
          element={
            <ProtectedRoute>
              <Payment />
            </ProtectedRoute>
          }
        />

        <Route
          path="/forgot-password"
          element={
            user
              ? <Navigate to="/dashboard" replace />
              : <ForgotPassword />
          }
        />

        {/* ================= DASHBOARD ================= */}

        <Route
          path="/dashboard"
          element={
            <ProtectedRoute allowedRoles={["admin","superadmin"]}>
              {requireSubscription(<Dashboard />)}
            </ProtectedRoute>
          }
        />

        <Route
          path="/superadmin"
          element={
            <ProtectedRoute allowedRoles={["superadmin"]}>
              <SuperAdmin />
            </ProtectedRoute>
          }
        />

        <Route
          path="/attendance"
          element={
            <ProtectedRoute allowedRoles={["admin","manager","cashier","employee","superadmin"]}>
              {requireSubscription(<Attendence />)}
            </ProtectedRoute>
          }
        />

        {/* ================= BILLING ================= */}

        <Route
          path="/billing"
          element={
            <ProtectedRoute allowedRoles={["admin","cashier","manager","superadmin"]}>
              {requireSubscription(<Billing />)}
            </ProtectedRoute>
          }
        />

        {/* ================= INVENTORY ================= */}

        <Route
          path="/inventory"
          element={
            <ProtectedRoute allowedRoles={["admin","manager","superadmin"]}>
              {requireSubscription(<Inventory />)}
            </ProtectedRoute>
          }
        />

        {/* ================= EMPLOYEE MANAGEMENT ================= */}

        <Route
          path="/create-employee"
          element={
            <ProtectedRoute allowedRoles={["admin","superadmin"]}>
              {requireSubscription(<CreateIDemploe />)}
            </ProtectedRoute>
          }
        />

        {/* ================= ACCOUNTING ================= */}

        <Route
          path="/ledgers"
          element={
            <ProtectedRoute allowedRoles={["admin","manager","superadmin"]}>
              {requireSubscription(<LedgerList shopId={shopId} />)}
            </ProtectedRoute>
          }
        />

        <Route
          path="/journal-entry"
          element={
            <ProtectedRoute allowedRoles={["admin","manager","superadmin"]}>
              {requireSubscription(<JournalEntry shopId={shopId} />)}
            </ProtectedRoute>
          }
        />

        <Route
          path="/trial-balance"
          element={
            <ProtectedRoute allowedRoles={["admin","manager","superadmin"]}>
              {requireSubscription(<TrialBalance shopId={shopId} />)}
            </ProtectedRoute>
          }
        />

        {/* ================= PROFILE ================= */}

        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          }
        />

        {/* ================= SETTINGS ================= */}

        <Route
          path="/settings"
          element={
            <ProtectedRoute allowedRoles={["admin","superadmin"]}>
              {requireSubscription(<Settings />)}
            </ProtectedRoute>
          }
        />

        {/* ================= FALLBACK ================= */}

        <Route
          path="*"
          element={<Navigate to="/" replace />}
        />

      </Routes>

    </Layout>

  );

};

/* ================= ROOT ================= */

const App = () => {

  return (

    <Router>

      <ErrorBoundary>
        <AppRoutes />
      </ErrorBoundary>

    </Router>

  );

};

export default App;