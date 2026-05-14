import React, { useState, useMemo } from "react";
import "./Navbar.scss";
import images from "../../assets/index";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { logoutUser } from "../../services/auth.service";

const Navbar = () => {

  const [isActive, setIsActive] = useState(false);

  const { user } = useAuth();

  const closeMenu = () => setIsActive(false);

  const handleLogout = async () => {

    try {

      localStorage.removeItem("employeeSession");

      await logoutUser();

      closeMenu();

      window.location.replace("/login");

    } catch (err) {

      console.error("Logout failed:", err);

    }

  };

  /* ================= ROLE PERMISSIONS ================= */

  const permissions = useMemo(() => ({

    billing: ["admin","superadmin","manager","cashier"],
    inventory: ["admin","superadmin","manager"],
    employees: ["admin","superadmin"],
    settings: ["admin","superadmin"],
    accounting: ["admin","superadmin","manager"],
    attendance: ["admin","superadmin","manager","cashier","employee"],

  }), []);

  const canAccess = (module) =>
    permissions[module]?.includes(user?.role);

  return (

    <nav className="navbar">

      {/* Logo */}
      <div className="logo">
        <img src={images.logo} alt="Virevo" />
      </div>

      {/* Menu Toggle */}
      <div
        className={`menu-toggle ${isActive ? "active" : ""}`}
        onClick={() => setIsActive(!isActive)}
      >
        <span></span>
        <span></span>
        <span></span>
      </div>

      {/* Side Menu */}
      <div className={`side-menu ${isActive ? "open" : ""}`}>

        <ul>

          {/* 🔥 SUPERADMIN PANEL */}
          {user?.role === "superadmin" && (
            <li>
              <Link to="/superadmin" onClick={closeMenu}>
                Super Admin
              </Link>
            </li>
          )}

          {/* 🔥 DASHBOARD (ONLY ADMIN) */}
          {user?.role === "admin" && (
            <li>
              <Link to="/dashboard" onClick={closeMenu}>
                Dashboard
              </Link>
            </li>
          )}

          {/* 🔥 OPTIONAL: SUPERADMIN CAN ALSO SEE SHOP DASHBOARD */}
          {user?.role === "superadmin" && (
            <li>
              <Link to="/dashboard" onClick={closeMenu}>
                Shop Dashboard
              </Link>
            </li>
          )}

          {/* BILLING */}
          {canAccess("billing") && (
            <li>
              <Link to="/billing" onClick={closeMenu}>
                Billing
              </Link>
            </li>
          )}

          {/* INVENTORY */}
          {canAccess("inventory") && (
            <li>
              <Link to="/inventory" onClick={closeMenu}>
                Inventory
              </Link>
            </li>
          )}

          {/* EMPLOYEES */}
          {canAccess("employees") && (
            <li>
              <Link to="/create-employee" onClick={closeMenu}>
                Employees
              </Link>
            </li>
          )}

          {/* ATTENDANCE */}
          {canAccess("attendance") && (
            <li>
              <Link to="/attendance" onClick={closeMenu}>
                Attendance
              </Link>
            </li>
          )}

          {/* ACCOUNTING */}
          {canAccess("accounting") && (
            <>
              <li>
                <Link to="/ledgers" onClick={closeMenu}>
                  Ledgers
                </Link>
              </li>

              <li>
                <Link to="/journal-entry" onClick={closeMenu}>
                  Journal Entry
                </Link>
              </li>

              <li>
                <Link to="/trial-balance" onClick={closeMenu}>
                  Trial Balance
                </Link>
              </li>
            </>
          )}

          {/* SETTINGS */}
          {canAccess("settings") && (
            <li>
              <Link to="/settings" onClick={closeMenu}>
                Settings
              </Link>
            </li>
          )}

          {/* SUPPORT */}
          <li>
            <a href="tel:+916838604033" onClick={closeMenu}>
              Support
            </a>
          </li>

          {/* PROFILE */}
          {user && (
            <li>
              <Link to="/profile" onClick={closeMenu}>
                Profile
              </Link>
            </li>
          )}

          {/* LOGOUT */}
          {user && (
            <li>
              <button
                className="logout-btn"
                onClick={handleLogout}
              >
                Logout
              </button>
            </li>
          )}

        </ul>

      </div>

      {/* Overlay */}
      {isActive && (
        <div className="overlay" onClick={closeMenu}></div>
      )}

    </nav>

  );

};

export default Navbar;