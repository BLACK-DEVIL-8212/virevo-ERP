// src/pages/Login/Login.jsx

import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { FaEnvelope, FaLock, FaEye, FaEyeSlash, FaStore, FaArrowRight } from "react-icons/fa";
import { MdSecurity, MdSpeed, MdCloudQueue } from "react-icons/md";

import {
  loginWithEmail,
} from "../../services/auth.service";

import "./Login.scss";

const MAX_ATTEMPTS = 5;
const LOCKOUT_TIME = 15 * 60 * 1000; // 15 minutes

const Login = () => {

  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [lockoutTimeLeft, setLockoutTimeLeft] = useState(0);

  /* ==============================
     CHECK LOCKOUT STATUS
  ============================== */

  useEffect(() => {
    const lockoutData = localStorage.getItem("loginLockout");
    
    if (lockoutData) {
      const { timestamp, attempts: savedAttempts } = JSON.parse(lockoutData);
      const timeElapsed = Date.now() - timestamp;
      
      if (timeElapsed < LOCKOUT_TIME) {
        setIsLocked(true);
        setAttempts(savedAttempts);
        const remaining = Math.ceil((LOCKOUT_TIME - timeElapsed) / 1000);
        setLockoutTimeLeft(remaining);
      } else {
        localStorage.removeItem("loginLockout");
        setAttempts(0);
        setIsLocked(false);
      }
    }
  }, []);

  /* ==============================
     LOCKOUT TIMER
  ============================== */

  useEffect(() => {
    let timer;
    if (isLocked && lockoutTimeLeft > 0) {
      timer = setInterval(() => {
        setLockoutTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            setIsLocked(false);
            setAttempts(0);
            localStorage.removeItem("loginLockout");
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isLocked, lockoutTimeLeft]);

  /* ==============================
     INPUT SANITIZER
  ============================== */

  const sanitize = (value) =>
    value.replace(/[<>]/g, "").trim();

  /* ==============================
     EMAIL VALIDATION
  ============================== */

  const validEmail = (value) => {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(value);
  };

  /* ==============================
     HANDLE EMAIL LOGIN
  ============================== */

  const handleEmailLogin = async (e) => {
    e.preventDefault();

    if (loading || isLocked) return;

    if (attempts >= MAX_ATTEMPTS) {
      const lockoutData = {
        timestamp: Date.now(),
        attempts: MAX_ATTEMPTS
      };
      localStorage.setItem("loginLockout", JSON.stringify(lockoutData));
      setIsLocked(true);
      setLockoutTimeLeft(LOCKOUT_TIME / 1000);
      setError(`Too many failed attempts. Please try again in ${Math.ceil(LOCKOUT_TIME / 60000)} minutes.`);
      return;
    }

    setError("");

    const cleanEmail = sanitize(email);
    const cleanPassword = sanitize(password);

    /* ---------- validation ---------- */

    if (!validEmail(cleanEmail)) {
      setError("Please enter a valid email address");
      return;
    }

    if (!cleanPassword) {
      setError("Password is required");
      return;
    }

    if (cleanPassword.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    try {
      setLoading(true);

      const user = await loginWithEmail(cleanEmail, cleanPassword);

      if (!user) {
        setAttempts(prev => prev + 1);
        setError(`Invalid email or password. ${MAX_ATTEMPTS - (attempts + 1)} attempts remaining.`);
        return;
      }

      /* ---------- reset attempts on success ---------- */
      setAttempts(0);
      localStorage.removeItem("loginLockout");

      /* ---------- save employee session ---------- */
      if (user.type === "employee") {
        localStorage.setItem("employeeSession", JSON.stringify(user));
      }

      /* ---------- save user data ---------- */
      localStorage.setItem("user", JSON.stringify(user));

      /* ---------- subscription check ---------- */
      if (user.subscriptionInactive || user.subscriptionExpired) {
        navigate("/payment");
        return;
      }

      /* ---------- success ---------- */
      navigate("/dashboard");

    } catch (err) {
      console.error("LOGIN ERROR:", err);
      setAttempts(prev => prev + 1);
      setError(err.message || "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  /* ==============================
     FORMAT LOCKOUT TIME
  ============================== */

  const formatLockoutTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="login-page">
      {/* Animated Background */}
      <div className="animated-bg">
        <div className="gradient-sphere"></div>
        <div className="gradient-sphere-2"></div>
        <div className="gradient-sphere-3"></div>
      </div>

      <div className="login-container">
        {/* Left Side - Brand Section */}
        <div className="login-brand">
          <div className="brand-content">
            <div className="brand-logo">
              <FaStore className="logo-icon" />
              <h1>Virevo</h1>
            </div>
            <h2>Welcome Back!</h2>
            <p>Login to access your retail management dashboard</p>
            
            <div className="brand-features">
              <div className="feature">
                <MdSpeed className="feature-icon" />
                <div>
                  <h4>Lightning Fast</h4>
                  <p>Process billing in seconds</p>
                </div>
              </div>
              <div className="feature">
                <MdSecurity className="feature-icon" />
                <div>
                  <h4>Secure Platform</h4>
                  <p>Your data is encrypted</p>
                </div>
              </div>
              <div className="feature">
                <MdCloudQueue className="feature-icon" />
                <div>
                  <h4>Cloud Based</h4>
                  <p>Access anywhere, anytime</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side - Login Form */}
        <div className="login-form-section">
          <div className="login-box">
            <div className="form-header">
              <h3>Sign In</h3>
              <p>Enter your credentials to continue</p>
            </div>

            {error && (
              <div className="error-alert">
                <span className="error-icon">⚠️</span>
                <span>{error}</span>
              </div>
            )}

            {isLocked && (
              <div className="lockout-alert">
                <span className="lockout-icon">🔒</span>
                <span>Too many attempts. Try again in {formatLockoutTime(lockoutTimeLeft)}</span>
              </div>
            )}

            <form onSubmit={handleEmailLogin} autoComplete="off">
              <div className="input-group">
                <FaEnvelope className="input-icon" />
                <input
                  type="email"
                  id="email"
                  name="email"
                  placeholder="Email address"
                  value={email}
                  onChange={(e) => setEmail(sanitize(e.target.value))}
                  maxLength={80}
                  required
                  disabled={loading || isLocked}
                />
              </div>

              <div className="input-group">
                <FaLock className="input-icon" />
                <input
                  type={showPassword ? "text" : "password"}
                  id="password"
                  name="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  maxLength={128}
                  required
                  disabled={loading || isLocked}
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <FaEyeSlash /> : <FaEye />}
                </button>
              </div>

              <div className="form-options">
                <label className="checkbox-label">
                  <input type="checkbox" />
                  <span>Remember me</span>
                </label>
                <Link to="/forgot-password" className="forgot-link">
                  Forgot Password?
                </Link>
              </div>

              <button
                type="submit"
                className="login-btn primary-btn"
                disabled={loading || isLocked}
              >
                {loading ? (
                  <span className="loading-spinner"></span>
                ) : (
                  <>
                    Sign In <FaArrowRight className="btn-icon" />
                  </>
                )}
              </button>
            </form>

            <div className="divider">
              <span>Or continue with</span>
            </div>

            <div className="signup-prompt">
              <p>
                Don&apos;t have an account?{" "}
                <Link to="/signup" className="signup-link">
                  Create one now
                </Link>
              </p>
            </div>

            <div className="demo-credentials">
              <p className="demo-title">Support : </p>
              <div className="demo-info">
                <code>support@virevo.gt.tc</code>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;