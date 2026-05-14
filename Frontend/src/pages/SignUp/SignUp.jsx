import { useState } from "react";
import "./SignUp.scss";
import { useNavigate, Link } from "react-router-dom";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { ref, set } from "firebase/database";
import { auth, db } from "../../services/firebase";
import { FaStore, FaUser, FaEnvelope, FaLock, FaEye, FaEyeSlash, FaArrowRight, FaCheckCircle } from "react-icons/fa";

const SignUp = () => {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    shopName: "",
    ownerName: "",
    email: "",
    password: "",
    confirmPassword: ""
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [passwordStrength, setPasswordStrength] = useState(0);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm({
      ...form,
      [name]: value
    });

    // Check password strength
    if (name === "password") {
      calculatePasswordStrength(value);
    }
  };

  const calculatePasswordStrength = (password) => {
    let strength = 0;
    if (password.length >= 6) strength++;
    if (password.length >= 10) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^A-Za-z0-9]/.test(password)) strength++;
    setPasswordStrength(strength);
  };

  const getPasswordStrengthText = () => {
    if (passwordStrength === 0) return "Very Weak";
    if (passwordStrength === 1) return "Weak";
    if (passwordStrength === 2) return "Fair";
    if (passwordStrength === 3) return "Good";
    if (passwordStrength >= 4) return "Strong";
    return "";
  };

  const getPasswordStrengthColor = () => {
    if (passwordStrength === 0) return "#ff4444";
    if (passwordStrength === 1) return "#ff8844";
    if (passwordStrength === 2) return "#ffcc44";
    if (passwordStrength === 3) return "#88ff44";
    if (passwordStrength >= 4) return "#00e0ff";
    return "#666";
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    // Validation
    if (!form.shopName.trim()) {
      return setError("Shop name is required");
    }

    if (!form.ownerName.trim()) {
      return setError("Owner name is required");
    }

    if (!form.email.trim()) {
      return setError("Email is required");
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(form.email)) {
      return setError("Please enter a valid email address");
    }

    if (form.password !== form.confirmPassword) {
      return setError("Passwords do not match");
    }

    if (form.password.length < 6) {
      return setError("Password must be at least 6 characters");
    }

    if (passwordStrength < 2) {
      return setError("Please choose a stronger password");
    }

    try {
      setLoading(true);

      // 1️⃣ Create Firebase Auth user
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        form.email,
        form.password
      );

      const uid = userCredential.user.uid;

      // Update profile with display name
      await updateProfile(auth.currentUser, {
        displayName: form.ownerName
      });

      // 2️⃣ Generate Shop ID
      const shopId = `shop_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

      // 3️⃣ Save shop info
      await set(ref(db, `shops/${shopId}`), {
        info: {
          companyName: form.shopName,
          ownerName: form.ownerName,
          email: form.email,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          status: "active"
        },
        settings: {
          currency: "INR",
          timezone: "Asia/Kolkata",
          invoicePrefix: "INV",
          gstEnabled: true
        }
      });

      // 4️⃣ Save user info with NO PLAN
      await set(ref(db, `users/${uid}`), {
        uid: uid,
        name: form.ownerName,
        email: form.email,
        role: "admin",
        shopId: shopId,
        active: true,
        plan: null,
        planExpiry: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        emailVerified: false
      });

      // 5️⃣ Store session locally
      localStorage.setItem(
        "user",
        JSON.stringify({
          uid,
          name: form.ownerName,
          email: form.email,
          role: "admin",
          shopId,
          plan: null,
          planExpiry: null
        })
      );

      setSuccess("Account created successfully! Redirecting...");

      // 6️⃣ Redirect after short delay
      setTimeout(() => {
        navigate("/");
      }, 2000);

    } catch (err) {
      console.error("Signup Error:", err);
      
      // Handle specific Firebase errors
      if (err.code === "auth/email-already-in-use") {
        setError("Email already registered. Please login instead.");
      } else if (err.code === "auth/weak-password") {
        setError("Password is too weak. Please use a stronger password.");
      } else if (err.code === "auth/invalid-email") {
        setError("Invalid email address format.");
      } else {
        setError(err.message || "Failed to create account. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="signup-page">
      {/* Animated Background */}
      <div className="animated-bg">
        <div className="gradient-sphere"></div>
        <div className="gradient-sphere-2"></div>
        <div className="gradient-sphere-3"></div>
      </div>

      <div className="signup-container">
        {/* Left Side - Info Section */}
        <div className="signup-info">
          <div className="info-content">
            <div className="info-logo">
              <FaStore className="logo-icon" />
              <h1>Virevo</h1>
            </div>
            <h2>Start Your Journey</h2>
            <p>Join thousands of retailers using Virevo POS</p>
            
            <div className="info-features">
              <div className="feature">
                <FaCheckCircle className="feature-icon" />
                <div>
                  <h4>14-Day Free Trial</h4>
                  <p>No credit card required</p>
                </div>
              </div>
              <div className="feature">
                <FaCheckCircle className="feature-icon" />
                <div>
                  <h4>Cloud Based</h4>
                  <p>Access anywhere, anytime</p>
                </div>
              </div>
              <div className="feature">
                <FaCheckCircle className="feature-icon" />
                <div>
                  <h4>24/7 Support</h4>
                  <p>Dedicated customer support</p>
                </div>
              </div>
            </div>

            <div className="stats">
              <div className="stat">
                <h3>5000+</h3>
                <p>Happy Customers</p>
              </div>
              <div className="stat">
                <h3>1M+</h3>
                <p>Transactions</p>
              </div>
              <div className="stat">
                <h3>99.9%</h3>
                <p>Uptime</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side - Signup Form */}
        <div className="signup-form-section">
          <div className="signup-card">
            <div className="form-header">
              <h3>Create Account</h3>
              <p>Start your POS system in seconds</p>
            </div>

            {error && (
              <div className="error-alert">
                <span className="error-icon">⚠️</span>
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div className="success-alert">
                <span className="success-icon">✓</span>
                <span>{success}</span>
              </div>
            )}

            <form onSubmit={handleSignup}>
              <div className="input-group">
                <FaStore className="input-icon" />
                <input
                  type="text"
                  name="shopName"
                  placeholder="Shop Name"
                  value={form.shopName}
                  onChange={handleChange}
                  required
                  disabled={loading}
                  autoComplete="off"
                />
              </div>

              <div className="input-group">
                <FaUser className="input-icon" />
                <input
                  type="text"
                  name="ownerName"
                  placeholder="Owner Name"
                  value={form.ownerName}
                  onChange={handleChange}
                  required
                  disabled={loading}
                  autoComplete="off"
                />
              </div>

              <div className="input-group">
                <FaEnvelope className="input-icon" />
                <input
                  type="email"
                  name="email"
                  placeholder="Email Address"
                  value={form.email}
                  onChange={handleChange}
                  required
                  disabled={loading}
                  autoComplete="off"
                />
              </div>

              <div className="input-group">
                <FaLock className="input-icon" />
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  placeholder="Password"
                  value={form.password}
                  onChange={handleChange}
                  required
                  disabled={loading}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <FaEyeSlash /> : <FaEye />}
                </button>
              </div>

              {form.password && (
                <div className="password-strength">
                  <div className="strength-bar">
                    <div 
                      className="strength-fill"
                      style={{
                        width: `${(passwordStrength / 5) * 100}%`,
                        backgroundColor: getPasswordStrengthColor()
                      }}
                    ></div>
                  </div>
                  <span style={{ color: getPasswordStrengthColor() }}>
                    {getPasswordStrengthText()}
                  </span>
                </div>
              )}

              <div className="input-group">
                <FaLock className="input-icon" />
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  name="confirmPassword"
                  placeholder="Confirm Password"
                  value={form.confirmPassword}
                  onChange={handleChange}
                  required
                  disabled={loading}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  {showConfirmPassword ? <FaEyeSlash /> : <FaEye />}
                </button>
              </div>

              <div className="form-agreement">
                <label className="checkbox-label">
                  <input type="checkbox" required />
                  <span>I agree to the</span>
                </label>
                <Link to="/terms" className="terms-link">Terms of Service</Link>
                <span>and</span>
                <Link to="/privacy" className="terms-link">Privacy Policy</Link>
              </div>

              <button 
                type="submit" 
                className="signup-btn"
                disabled={loading}
              >
                {loading ? (
                  <span className="loading-spinner"></span>
                ) : (
                  <>
                    Create Account <FaArrowRight className="btn-icon" />
                  </>
                )}
              </button>
            </form>

            <div className="login-prompt">
              <p>
                Already have an account?{" "}
                <Link to="/login" className="login-link">
                  Sign in
                </Link>
              </p>
            </div>

            <div className="security-note">
              <FaLock className="security-icon" />
              <p>Your data is encrypted and secure</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SignUp;