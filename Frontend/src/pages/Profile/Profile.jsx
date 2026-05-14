import React, { useEffect, useState } from "react";
import "./Profile.scss";
import usePageTitle from "../../hooks/usePageTitle";
import { useAuth } from "../../context/AuthContext";
import { logoutUser } from "../../services/auth.service";
import { useNavigate } from "react-router-dom";
import { ref, onValue, off } from "firebase/database";
import { db } from "../../services/firebase";
import images from "../../assets/index";
import { 
  FaUserCircle, FaStore, FaInfoCircle, FaShieldAlt, 
  FaClock, FaSignOutAlt, FaEnvelope, FaPhone, 
  FaMapMarkerAlt, FaBuilding, FaIdCard, FaCalendarAlt,
  FaCheckCircle, FaBox, FaTag, FaUsers, FaChartLine,
  FaEdit, FaKey, FaBell, FaDownload
} from "react-icons/fa";

const Profile = () => {

  usePageTitle("Virevo Mall – Profile");

  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const [userProfile, setUserProfile] = useState({});
  const [shopInfo, setShopInfo] = useState({});
  const [systemInfo, setSystemInfo] = useState({});
  const [stats, setStats] = useState({
    totalBills: 0,
    totalSales: 0,
    totalProducts: 0
  });

  const handleLogout = async () => {
    await logoutUser();
    navigate("/login", { replace: true });
  };

  /* ================= LOAD USER PROFILE ================= */
  useEffect(() => {
    if (!user) return;

    let userRef;

    if (user.type === "employee") {
      userRef = ref(db, `shops/${user.shopId}/employees/${user.employeeId}`);
    } else {
      userRef = ref(db, `users/${user.uid}`);
    }

    const unsub = onValue(userRef, (snap) => {
      if (snap.exists()) {
        setUserProfile(snap.val());
      }
    });

    return () => off(userRef);
  }, [user]);

  /* ================= LOAD SHOP SETTINGS ================= */
  useEffect(() => {
    const shopId = userProfile.shopId || user?.shopId;
    if (!shopId) return;

    const settingsRef = ref(db, `shops/${shopId}/info/settings`);
    const unsub = onValue(settingsRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        setShopInfo({
          companyName: data.companyName || "—",
          gstin: data.gstin || "—",
          phone: data.phone || "—",
          address: data.address || "—",
          city: data.city || "—",
          pincode: data.pincode || "—",
          email: data.email || "—",
          website: data.website || "—",
          upiId: data.upiId || "—"
        });
      }
    });

    return () => off(settingsRef);
  }, [userProfile, user]);

  /* ================= LOAD STATS ================= */
  useEffect(() => {
    const shopId = userProfile.shopId || user?.shopId;
    if (!shopId) return;

    const billsRef = ref(db, `shops/${shopId}/bills`);
    const productsRef = ref(db, `shops/${shopId}/products`);

    const unsubBills = onValue(billsRef, (snap) => {
      let totalBills = 0;
      let totalSales = 0;
      snap.forEach(child => {
        const bill = child.val();
        totalBills++;
        totalSales += bill.totalAmount || 0;
      });
      setStats(prev => ({ ...prev, totalBills, totalSales }));
    });

    const unsubProducts = onValue(productsRef, (snap) => {
      let totalProducts = 0;
      snap.forEach(() => totalProducts++);
      setStats(prev => ({ ...prev, totalProducts }));
    });

    return () => {
      off(billsRef);
      off(productsRef);
    };
  }, [userProfile, user]);

  /* ================= SESSION INFO ================= */
  useEffect(() => {
    setSystemInfo({
      loginTime: new Date().toLocaleString(),
      device: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      appVersion: "2.0.0"
    });
  }, []);

  /* ================= FORMAT DATE ================= */
  const formatDate = (timestamp) => {
    if (!timestamp) return "—";
    return new Date(timestamp).toLocaleString();
  };

  /* ================= GET PLAN STATUS ================= */
  const getPlanStatus = () => {
    const plan = userProfile.plan || user?.plan || "FREE";
    const expiry = userProfile.planExpiry || user?.planExpiry;
    
    if (!expiry || plan === "FREE") return { status: "active", text: "Active", color: "#22c55e" };
    
    const now = new Date();
    const expiryDate = new Date(expiry);
    const daysLeft = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
    
    if (daysLeft < 0) return { status: "expired", text: "Expired", color: "#ef4444" };
    if (daysLeft < 7) return { status: "warning", text: `Expires in ${daysLeft} days`, color: "#facc15" };
    return { status: "active", text: "Active", color: "#22c55e" };
  };

  if (loading) {
    return (
      <div className="profile-page loading-state">
        <div className="spinner"></div>
        <p>Loading profile...</p>
      </div>
    );
  }

  if (!user) return null;

  const planStatus = getPlanStatus();

  return (
    <div className="profile-page">
      {/* Left Side - Brand Section */}
      <div className="profile-left">
        <div className="brand-content">
          <img src={images.logo} alt="Virevo Logo" className="brand-logo" />
          <div className="brand-info">
            <h2>Virevo POS</h2>
            <p>Complete Retail Management Solution</p>
          </div>
        </div>
        
        <div className="stats-sidebar">
          <div className="stat-item">
            <FaBox className="stat-icon" />
            <div>
              <span className="stat-label">Total Products</span>
              <span className="stat-value">{stats.totalProducts}</span>
            </div>
          </div>
          <div className="stat-item">
            <FaChartLine className="stat-icon" />
            <div>
              <span className="stat-label">Total Sales</span>
              <span className="stat-value">₹{stats.totalSales.toLocaleString()}</span>
            </div>
          </div>
          <div className="stat-item">
            <FaTag className="stat-icon" />
            <div>
              <span className="stat-label">Total Bills</span>
              <span className="stat-value">{stats.totalBills}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right Side - Profile Content */}
      <div className="profile-right">
        <div className="profile-card">
          {/* Header */}
          <div className="profile-header">
            <div className="avatar-wrapper">
              <FaUserCircle className="avatar" />
              <div className="status-dot online"></div>
            </div>
            <div className="header-info">
              <h1>{userProfile.name || user.name || "User"}</h1>
              <p className="user-role">
                <span className={`role-badge ${userProfile.role || user.role}`}>
                  {(userProfile.role || user.role || "user").toUpperCase()}
                </span>
              </p>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="stats-grid">
            <div className="stat-card">
              <FaClock className="stat-card-icon" />
              <div>
                <span className="stat-label">Session Started</span>
                <span className="stat-value">{systemInfo.loginTime?.split(',')[0]}</span>
              </div>
            </div>
            <div className="stat-card">
              <FaCheckCircle className="stat-card-icon" style={{ color: planStatus.color }} />
              <div>
                <span className="stat-label">Plan Status</span>
                <span className="stat-value" style={{ color: planStatus.color }}>{planStatus.text}</span>
              </div>
            </div>
            <div className="stat-card">
              <FaCalendarAlt className="stat-card-icon" />
              <div>
                <span className="stat-label">Member Since</span>
                <span className="stat-value">{formatDate(userProfile.createdAt).split(',')[0]}</span>
              </div>
            </div>
          </div>

          {/* Account Information */}
          <div className="info-section">
            <div className="section-header">
              <FaUserCircle className="section-icon" />
              <h3>Account Information</h3>
            </div>
            <div className="info-grid">
              <div className="info-item">
                <span className="info-label">Full Name</span>
                <strong>{userProfile.name || user.name || "—"}</strong>
              </div>
              <div className="info-item">
                <span className="info-label">Email / Username</span>
                <strong>{userProfile.email || user.username || "—"}</strong>
              </div>
              <div className="info-item">
                <span className="info-label">User ID</span>
                <strong className="mono">{user.uid || user.employeeId || "—"}</strong>
              </div>
              <div className="info-item">
                <span className="info-label">Role</span>
                <strong className={`role-text ${userProfile.role || user.role}`}>
                  {(userProfile.role || user.role || "").toUpperCase()}
                </strong>
              </div>
            </div>
          </div>

          {/* Shop Information */}
          <div className="info-section">
            <div className="section-header">
              <FaStore className="section-icon" />
              <h3>Shop Information</h3>
            </div>
            <div className="info-grid">
              <div className="info-item">
                <span className="info-label">Shop ID</span>
                <strong className="mono">{userProfile.shopId || user.shopId || "—"}</strong>
              </div>
              <div className="info-item">
                <span className="info-label">Company Name</span>
                <strong>{shopInfo.companyName}</strong>
              </div>
              <div className="info-item">
                <span className="info-label">GST Number</span>
                <strong>{shopInfo.gstin}</strong>
              </div>
              <div className="info-item">
                <span className="info-label">Phone</span>
                <strong>{shopInfo.phone}</strong>
              </div>
              <div className="info-item">
                <span className="info-label">Email</span>
                <strong>{shopInfo.email}</strong>
              </div>
              <div className="info-item">
                <span className="info-label">UPI ID</span>
                <strong>{shopInfo.upiId}</strong>
              </div>
              <div className="info-item full-width">
                <span className="info-label">Address</span>
                <strong>{shopInfo.address}, {shopInfo.city} - {shopInfo.pincode}</strong>
              </div>
            </div>
          </div>

          {/* Subscription Information */}
          <div className="info-section">
            <div className="section-header">
              <FaBox className="section-icon" />
              <h3>Subscription Details</h3>
            </div>
            <div className="info-grid">
              <div className="info-item">
                <span className="info-label">Current Plan</span>
                <strong className="plan-name">{userProfile.plan || user?.plan || "FREE"}</strong>
              </div>
              <div className="info-item">
                <span className="info-label">Plan Expiry</span>
                <strong>{formatDate(userProfile.planExpiry || user?.planExpiry)}</strong>
              </div>
              <div className="info-item">
                <span className="info-label">Status</span>
                <span className={`plan-status ${planStatus.status}`}>{planStatus.text}</span>
              </div>
            </div>
          </div>

          {/* Session Information */}
          <div className="info-section">
            <div className="section-header">
              <FaInfoCircle className="section-icon" />
              <h3>Session Information</h3>
            </div>
            <div className="info-grid">
              <div className="info-item full-width">
                <span className="info-label">Login Time</span>
                <strong>{systemInfo.loginTime}</strong>
              </div>
              <div className="info-item full-width">
                <span className="info-label">Device</span>
                <strong className="mono small">{systemInfo.device}</strong>
              </div>
              <div className="info-item">
                <span className="info-label">Platform</span>
                <strong>{systemInfo.platform}</strong>
              </div>
              <div className="info-item">
                <span className="info-label">Language</span>
                <strong>{systemInfo.language}</strong>
              </div>
            </div>
          </div>

          {/* Security Information */}
          <div className="info-section">
            <div className="section-header">
              <FaShieldAlt className="section-icon" />
              <h3>Security</h3>
            </div>
            <div className="info-grid">
              <div className="info-item">
                <span className="info-label">Last Logout</span>
                <strong>{formatDate(userProfile.lastLogoutAt)}</strong>
              </div>
              <div className="info-item">
                <span className="info-label">App Version</span>
                <strong>{systemInfo.appVersion}</strong>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="action-buttons">
            <button className="btn-logout" onClick={handleLogout}>
              <FaSignOutAlt /> Logout
            </button>
            <button className="btn-secondary" onClick={() => navigate("/settings")}>
              <FaEdit /> Edit Profile
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;