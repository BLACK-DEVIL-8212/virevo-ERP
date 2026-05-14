import "./Home.scss";
import { useNavigate } from "react-router-dom";
import { SUBSCRIPTION_PLANS } from "../../constants/subscriptionPlans";
import { useAuth } from "../../context/AuthContext";
import { signOut } from "firebase/auth";
import { auth } from "../../services/firebase";

/* IMPORT LOGO FROM ASSETS */
import images from "../../assets/index";

const Home = () => {

  const navigate = useNavigate();
  const { user } = useAuth();

  /* ============================
     CHECK ACTIVE PLAN
  ============================ */

  const hasActivePlan = () => {

    if (!user) return false;

    // Super admin always has access
    if (user.role === "superadmin") return true;

    // Check if user has a valid plan
    if (!user.plan || !user.planExpiry) return false;

    const expiry = new Date(user.planExpiry);
    const today = new Date();
    
    // Reset time part for accurate date comparison
    today.setHours(0, 0, 0, 0);
    expiry.setHours(0, 0, 0, 0);

    return expiry >= today;
  };

  /* ============================
     GET DAYS REMAINING
  ============================ */

  const getDaysRemaining = () => {
    if (!user || !user.planExpiry) return 0;
    
    const expiry = new Date(user.planExpiry);
    const today = new Date();
    const diffTime = expiry - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays > 0 ? diffDays : 0;
  };

  /* ============================
     LOGOUT
  ============================ */

  const handleLogout = async () => {

    try {

      await signOut(auth);
      localStorage.removeItem("user");
      localStorage.removeItem("userData");
      navigate("/login");

    } catch (err) {

      console.error("Logout error:", err);

    }

  };

  /* ============================
     SCROLL TO PRICING
  ============================ */

  const scrollToPricing = () => {
    const pricingSection = document.querySelector(".pricing");
    if (pricingSection) {
      pricingSection.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (

    <div className="landing">

      {/* ================= NAVBAR ================= */}

      <header className="landing-header">

        <div
          className="logo"
          onClick={() => navigate("/")}
          role="button"
          tabIndex={0}
          onKeyPress={(e) => e.key === 'Enter' && navigate("/")}
        >

          <img
            src={images.logo}
            alt="Virevo Logo"
            className="logo-img"
          />

        </div>

        <div className="nav-actions">

          {user ? (
            <>
              <span className="user-name">
                👤 {user.name || user.email || "User"}
              </span>

              {hasActivePlan() && (
                <button 
                  className="dashboard-btn"
                  onClick={() => navigate("/dashboard")}
                >
                  Dashboard
                </button>
              )}

              {!hasActivePlan() && user.role !== "superadmin" && (
                <button 
                  className="subscribe-btn"
                  onClick={scrollToPricing}
                >
                  Subscribe Now
                </button>
              )}

              <button 
                className="logout-btn"
                onClick={handleLogout}
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <button
                className="login-btn"
                onClick={() => navigate("/login")}
              >
                Login
              </button>

              <button
                className="signup-btn"
                onClick={() => navigate("/signup")}
              >
                Get Started
              </button>
            </>
          )}

        </div>

      </header>


      {/* ================= HERO ================= */}

      <section className="hero">

        <h1>Powerful POS System for Modern Retail</h1>

        <p>
          Manage billing, inventory, employees, and reports —
          all in one intelligent platform.
        </p>

        {user && !hasActivePlan() && user.role !== "superadmin" && (
          <div className="plan-warning">
            <p>⚠️ Your subscription has expired or you don't have an active plan.</p>
            {getDaysRemaining() === 0 && (
              <p>Please purchase a subscription to access the dashboard features.</p>
            )}
          </div>
        )}

        {user && hasActivePlan() && user.planExpiry && user.role !== "superadmin" && (
          <div className="plan-active">
            <p>✅ Active Plan: {user.plan} - {getDaysRemaining()} days remaining</p>
          </div>
        )}

        <div className="hero-buttons">

          {!user && (
            <>
              <button
                className="primary"
                onClick={() => navigate("/signup")}
              >
                Start Free Trial
              </button>

              <button
                className="secondary"
                onClick={() => navigate("/login")}
              >
                Login
              </button>
            </>
          )}

          {hasActivePlan() && (
            <button
              className="primary"
              onClick={() => navigate("/dashboard")}
            >
              Go to Dashboard
            </button>
          )}

          {user && !hasActivePlan() && user.role !== "superadmin" && (
            <button
              className="primary"
              onClick={scrollToPricing}
            >
              View Pricing Plans
            </button>
          )}

        </div>

      </section>


      {/* ================= SERVICES ================= */}

      <section className="services">

        <h2>Our Services</h2>

        <div className="services-grid">

          <div className="service-card">
            <h3>🛒 POS Billing Software</h3>
            <p>
              Fast retail billing system with GST invoices,
              barcode scanning, and receipt printing.
            </p>
          </div>

          <div className="service-card">
            <h3>📦 Inventory Management</h3>
            <p>
              Track stock levels, manage IMEI products,
              and get automatic low stock alerts.
            </p>
          </div>

          <div className="service-card">
            <h3>📊 Retail Analytics</h3>
            <p>
              Detailed sales reports, profit insights,
              and business performance tracking.
            </p>
          </div>

          <div className="service-card">
            <h3>👥 Employee Management</h3>
            <p>
              Assign roles to staff like Admin,
              Manager, and Cashier with full access control.
            </p>
          </div>

        </div>

      </section>


      {/* ================= WHY CHOOSE US ================= */}

      <section className="why-us">

        <h2>Why Choose Virevo</h2>

        <div className="why-grid">

          <div className="why-card">
            <h3>⚡ Lightning Fast</h3>
            <p>
              Our POS system processes billing and inventory
              operations instantly without delays.
            </p>
          </div>

          <div className="why-card">
            <h3>🔒 Secure</h3>
            <p>
              Secure authentication and encrypted
              cloud database to protect your business data.
            </p>
          </div>

          <div className="why-card">
            <h3>📊 Smart Reports</h3>
            <p>
              Track your business performance with
              intelligent dashboards and analytics.
            </p>
          </div>

          <div className="why-card">
            <h3>☁️ Cloud Based</h3>
            <p>
              Access your store data anywhere
              from desktop or mobile devices.
            </p>
          </div>

        </div>

      </section>


      {/* ================= FEATURES ================= */}

      <section className="features">

        <h2>Everything You Need to Run Your Store</h2>

        <div className="feature-grid">

          <div className="feature-card">
            <h3>💳 Smart Billing</h3>
            <p>Fast GST invoices, UPI payments & receipt printing.</p>
          </div>

          <div className="feature-card">
            <h3>📦 Inventory Control</h3>
            <p>Track stock, IMEI devices & low stock alerts.</p>
          </div>

          <div className="feature-card">
            <h3>👔 Employee Roles</h3>
            <p>Admin, Manager, Cashier with role-based access.</p>
          </div>

          <div className="feature-card">
            <h3>📈 Analytics & Reports</h3>
            <p>Track profit, sales trends & yearly performance.</p>
          </div>

        </div>

      </section>


      {/* ================= PRICING ================= */}

      {(!hasActivePlan() || !user) && (

        <section className="pricing">

          <h2>Simple Pricing</h2>
          <p className="pricing-subtitle">Choose the plan that fits your business</p>

          <div className="pricing-grid">

            {SUBSCRIPTION_PLANS.map((plan) => (

              <div
                key={plan.id}
                className={`price-card ${plan.popular ? "featured" : ""}`}
              >

                {plan.popular && (
                  <div className="popular-badge">
                    Most Popular
                  </div>
                )}

                <h3>{plan.name}</h3>

                <p className="price">
                  ₹{plan.price.toLocaleString()} / {plan.duration}
                </p>

                <ul>
                  {plan.features.map((feature, index) => (
                    <li key={index}>✓ {feature}</li>
                  ))}
                </ul>

                <button
                  className="pricing-btn"
                  onClick={() => {
                    if (user) {
                      navigate("/payment", {
                        state: { selectedPlan: plan.id }
                      });
                    } else {
                      navigate("/signup", {
                        state: { selectedPlan: plan.id }
                      });
                    }
                  }}
                >
                  {user ? "Subscribe Now" : "Get Started"}
                </button>

              </div>

            ))}

          </div>

        </section>

      )}

      {/* ================= STATS SECTION ================= */}

      <section className="stats">

        <div className="stats-grid">

          <div className="stat-card">
            <h3>5000+</h3>
            <p>Happy Customers</p>
          </div>

          <div className="stat-card">
            <h3>1M+</h3>
            <p>Transactions Processed</p>
          </div>

          <div className="stat-card">
            <h3>99.9%</h3>
            <p>Uptime Guarantee</p>
          </div>

          <div className="stat-card">
            <h3>24/7</h3>
            <p>Customer Support</p>
          </div>

        </div>

      </section>


      {/* ================= FAQ ================= */}

      <section className="faq">

        <h2>Frequently Asked Questions</h2>

        <div className="faq-list">

          <div className="faq-item">
            <h3>What is Virevo POS?</h3>
            <p>
              Virevo POS is a cloud-based retail management system
              that helps manage billing, inventory, employees,
              and reports in one platform.
            </p>
          </div>

          <div className="faq-item">
            <h3>Can I use it on multiple devices?</h3>
            <p>
              Yes. Virevo POS works on desktop and mobile,
              allowing you to manage your business anywhere.
            </p>
          </div>

          <div className="faq-item">
            <h3>Does it support GST billing?</h3>
            <p>
              Yes. The system generates GST-compliant invoices
              suitable for retail businesses in India.
            </p>
          </div>

          <div className="faq-item">
            <h3>Is my data secure?</h3>
            <p>
              Absolutely. All data is stored securely
              using encrypted cloud infrastructure.
            </p>
          </div>

          <div className="faq-item">
            <h3>Can I upgrade or downgrade my plan?</h3>
            <p>
              Yes, you can change your subscription plan at any time
              from your dashboard settings.
            </p>
          </div>

          <div className="faq-item">
            <h3>Do you offer free trial?</h3>
            <p>
              Yes, we offer a 14-day free trial on all plans
              with no credit card required.
            </p>
          </div>

        </div>

      </section>


      {/* ================= CTA SECTION ================= */}

      {!user && (
        <section className="cta">

          <h2>Ready to Transform Your Business?</h2>
          <p>Join thousands of retailers using Virevo POS to grow their business</p>
          
          <button
            className="cta-btn"
            onClick={() => navigate("/signup")}
          >
            Start Your Free Trial Today
          </button>

        </section>
      )}


      {/* ================= FOOTER ================= */}

      <footer className="footer">

        <div className="footer-content">

          <div className="footer-section">
            <img src={images.logo} alt="Virevo Logo" className="footer-logo" />
            <p>Modern POS solution for retail businesses</p>
          </div>

          <div className="footer-section">
            <h4>Quick Links</h4>
            <ul>
              <li onClick={() => navigate("/")}>Home</li>
              <li onClick={() => navigate("/about")}>About Us</li>
              <li onClick={() => navigate("/contact")}>Contact</li>
              <li onClick={() => navigate("/privacy")}>Privacy Policy</li>
            </ul>
          </div>

          <div className="footer-section">
            <h4>Support</h4>
            <ul>
              <li>help@virevo.com</li>
              <li>+91 1234567890</li>
              <li>24/7 Customer Support</li>
            </ul>
          </div>

          <div className="footer-section">
            <h4>Follow Us</h4>
            <div className="social-links">
              <span>📘 Facebook</span>
              <span>📸 Instagram</span>
              <span>🐦 Twitter</span>
              <span>💼 LinkedIn</span>
            </div>
          </div>

        </div>

        <div className="footer-bottom">
          © {new Date().getFullYear()} Virevo POS. All rights reserved.
        </div>

      </footer>

    </div>

  );

};

export default Home;