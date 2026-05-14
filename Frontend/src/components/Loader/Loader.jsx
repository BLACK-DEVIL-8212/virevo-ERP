import React from "react";
import "./Loader.scss";

const Loader = ({ message = "Loading...", size = "medium", fullScreen = false }) => {
  return (
    <div className={`loader-wrapper ${fullScreen ? "fullscreen" : ""} ${size}`}>
      <div className="water-loader">
        {/* Water waves background */}
        <div className="water-background">
          <div className="wave wave1"></div>
          <div className="wave wave2"></div>
          <div className="wave wave3"></div>
        </div>
        
        {/* Main drop */}
        <div className="drop-container">
          <div className="drop"></div>
          <div className="drop-shadow"></div>
        </div>
        
        {/* Ripple effects */}
        <div className="pond">
          <span className="ripple ripple1"></span>
          <span className="ripple ripple2"></span>
          <span className="ripple ripple3"></span>
          <span className="ripple ripple4"></span>
          <span className="ripple ripple5"></span>
        </div>
        
        {/* Loading text */}
        {message && (
          <div className="loading-text">
            <span className="letter">L</span>
            <span className="letter">o</span>
            <span className="letter">a</span>
            <span className="letter">d</span>
            <span className="letter">i</span>
            <span className="letter">n</span>
            <span className="letter">g</span>
            <span className="dot">.</span>
            <span className="dot">.</span>
            <span className="dot">.</span>
          </div>
        )}
        
        {/* Percentage (optional) */}
        <div className="percentage">
          <span className="percent-number">0</span>
          <span className="percent-symbol">%</span>
        </div>
      </div>
    </div>
  );
};

// Optional: Loader with progress tracking
export const ProgressLoader = ({ progress = 0, message = "Loading..." }) => {
  return (
    <div className="loader-wrapper fullscreen">
      <div className="progress-loader">
        <div className="progress-circle">
          <svg className="progress-svg" viewBox="0 0 100 100">
            <circle className="progress-bg" cx="50" cy="50" r="45" />
            <circle 
              className="progress-bar" 
              cx="50" 
              cy="50" 
              r="45" 
              style={{
                strokeDasharray: 283,
                strokeDashoffset: 283 - (283 * progress) / 100
              }}
            />
          </svg>
          <div className="progress-text">
            <span className="progress-percent">{Math.round(progress)}</span>
            <span className="progress-symbol">%</span>
          </div>
        </div>
        <div className="progress-message">{message}</div>
        <div className="progress-bar-linear">
          <div className="progress-fill" style={{ width: `${progress}%` }}></div>
        </div>
      </div>
    </div>
  );
};

// Optional: Skeleton loader
export const SkeletonLoader = ({ type = "card", count = 3 }) => {
  const renderSkeleton = () => {
    switch(type) {
      case "card":
        return (
          <div className="skeleton-card">
            <div className="skeleton-image shimmer"></div>
            <div className="skeleton-content">
              <div className="skeleton-title shimmer"></div>
              <div className="skeleton-text shimmer"></div>
              <div className="skeleton-text short shimmer"></div>
            </div>
          </div>
        );
      case "table":
        return (
          <div className="skeleton-table">
            <div className="skeleton-header shimmer"></div>
            {[...Array(count)].map((_, i) => (
              <div key={i} className="skeleton-row shimmer"></div>
            ))}
          </div>
        );
      case "list":
        return (
          <div className="skeleton-list">
            {[...Array(count)].map((_, i) => (
              <div key={i} className="skeleton-list-item shimmer">
                <div className="skeleton-avatar"></div>
                <div className="skeleton-line"></div>
              </div>
            ))}
          </div>
        );
      default:
        return null;
    }
  };
  
  return (
    <div className="skeleton-wrapper">
      {renderSkeleton()}
    </div>
  );
};

export default Loader;