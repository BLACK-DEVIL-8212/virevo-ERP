// src/pages/ForgotPassword/ForgotPassword.jsx

import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { 
  FaEnvelope, 
  FaArrowLeft, 
  FaCheckCircle, 
  FaSpinner,
  FaTimesCircle,
  FaPaperPlane 
} from "react-icons/fa";
import { resetPassword } from "../../services/auth.service";
import "./Forgot-Password.scss";

const ForgotPassword = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [resendDisabled, setResendDisabled] = useState(false);

  // Countdown timer for resend
  useEffect(() => {
    let timer;
    if (countdown > 0) {
      timer = setTimeout(() => {
        setCountdown(prev => prev - 1);
      }, 1000);
    } else if (countdown === 0 && resendDisabled) {
      setResendDisabled(false);
    }
    return () => clearTimeout(timer);
  }, [countdown, resendDisabled]);

  const sanitize = (value) => value.replace(/[<>]/g, "").trim();

  const validEmail = (value) => {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(value);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (loading) return;
    
    setError("");
    
    const cleanEmail = sanitize(email);
    
    if (!validEmail(cleanEmail)) {
      setError("Please enter a valid email address");
      return;
    }
    
    try {
      setLoading(true);
      const result = await resetPassword(cleanEmail);
      
      if (result.success) {
        setSuccess(true);
        setCountdown(60);
        setResendDisabled(true);
      } else {
        setError(result.message || "Failed to send reset email. Please try again.");
      }
    } catch (err) {
      setError(err.message || "Failed to send reset email. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendDisabled || loading) return;
    
    setError("");
    
    const cleanEmail = sanitize(email);
    
    if (!validEmail(cleanEmail)) {
      setError("Please enter a valid email address");
      return;
    }
    
    try {
      setLoading(true);
      const result = await resetPassword(cleanEmail);
      
      if (result.success) {
        setCountdown(60);
        setResendDisabled(true);
        setError("");
      } else {
        setError(result.message || "Failed to resend email. Please try again.");
      }
    } catch (err) {
      setError(err.message || "Failed to resend email. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoBack = () => {
    navigate("/login");
  };

  return (
    <div className="forgot-password-page">
      <div className="forgot-password-container">
        <div className="forgot-password-card">
          {/* Back Button */}
          <button onClick={handleGoBack} className="back-button">
            <FaArrowLeft /> Back to Login
          </button>

          {/* Icon */}
          <div className="icon-wrapper">
            {success ? (
              <div className="success-icon">
                <FaCheckCircle />
              </div>
            ) : (
              <div className="email-icon">
                <FaEnvelope />
              </div>
            )}
          </div>

          {/* Header */}
          <div className="header">
            <h2>{success ? "Check Your Email" : "Forgot Password?"}</h2>
            <p>
              {success
                ? `We've sent a password reset link to ${email}`
                : "Enter your email address and we'll send you a link to reset your password"}
            </p>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="error-alert">
              <FaTimesCircle className="error-icon" />
              <span>{error}</span>
              <button className="close-error" onClick={() => setError("")}>
                ×
              </button>
            </div>
          )}

          {/* Success Message */}
          {success ? (
            <div className="success-content">
              <div className="email-sent-info">
                <p className="instruction-text">
                  Click the link in the email to reset your password. 
                  The link will expire in 1 hour.
                </p>
                <div className="email-tips">
                  <h4>Didn&apos;t receive the email?</h4>
                  <ul>
                    <li>Check your spam/junk folder</li>
                    <li>Make sure you entered the correct email address</li>
                    <li>Add support@virevomart.gt.tc to your contacts</li>
                  </ul>
                </div>
              </div>

              <div className="action-buttons">
                <button 
                  onClick={handleResend} 
                  className="resend-btn"
                  disabled={resendDisabled || loading}
                >
                  {loading ? (
                    <FaSpinner className="spinner" />
                  ) : (
                    <FaPaperPlane />
                  )}
                  {resendDisabled 
                    ? `Resend in ${countdown}s` 
                    : "Resend Email"}
                </button>

                <Link to="/login" className="back-to-login-btn">
                  Back to Login
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="input-group">
                <FaEnvelope className="input-icon" />
                <input
                  type="email"
                  placeholder="Enter your email address"
                  value={email}
                  onChange={(e) => setEmail(sanitize(e.target.value))}
                  maxLength={80}
                  required
                  disabled={loading}
                  autoFocus
                  autoComplete="email"
                />
              </div>

              <button
                type="submit"
                className="reset-btn"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <FaSpinner className="spinner" />
                    Sending...
                  </>
                ) : (
                  <>
                    <FaPaperPlane />
                    Send Reset Link
                  </>
                )}
              </button>

              <div className="help-links">
                <Link to="/login" className="help-link">
                  Remember your password? Sign In
                </Link>
                <Link to="/signup" className="help-link">
                  Don&apos;t have an account? Sign Up
                </Link>
              </div>
            </form>
          )}

          {/* Footer */}
          <div className="footer">
            <p className="security-note">
              🔒 We take security seriously. Your data is encrypted and protected.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;