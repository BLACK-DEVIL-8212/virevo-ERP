import React from "react";
import "./ErrorBoundary.scss"; // Optional: add styling

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorCount: 0
    };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error: error
    };
  }

  componentDidCatch(error, errorInfo) {
    // Log error to console
    console.error("ErrorBoundary caught an error:", error, errorInfo);
    
    // Update state with error info
    this.setState({
      errorInfo: errorInfo,
      errorCount: this.state.errorCount + 1
    });
    
    // Optionally send error to your error tracking service
    this.logErrorToService(error, errorInfo);
  }

  /**
   * Log error to external service (Sentry, LogRocket, etc.)
   */
  logErrorToService = (error, errorInfo) => {
    // Example: Send to your backend
    // if (window.navigator.onLine) {
    //   fetch('/api/log-error', {
    //     method: 'POST',
    //     headers: { 'Content-Type': 'application/json' },
    //     body: JSON.stringify({
    //       error: error.toString(),
    //       stack: error.stack,
    //       componentStack: errorInfo.componentStack,
    //       url: window.location.href,
    //       userAgent: navigator.userAgent,
    //       timestamp: new Date().toISOString()
    //     })
    //   }).catch(e => console.error('Failed to log error:', e));
    // }
    
    // You can also send to console in development
    if (process.env.NODE_ENV === 'development') {
      console.group('🔴 ErrorBoundary Details');
      console.error('Error:', error);
      console.error('Error Info:', errorInfo);
      console.groupEnd();
    }
  };

  /**
   * Reset error state and retry
   */
  handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });
    
    // Optional: Reload the page or specific data
    if (this.props.onRetry) {
      this.props.onRetry();
    }
  };

  /**
   * Reload the entire page
   */
  handleReload = () => {
    window.location.reload();
  };

  /**
   * Go back to previous page
   */
  handleGoBack = () => {
    window.history.back();
  };

  /**
   * Copy error details to clipboard
   */
  copyErrorDetails = () => {
    const errorDetails = {
      error: this.state.error?.toString(),
      stack: this.state.error?.stack,
      url: window.location.href,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent
    };
    
    navigator.clipboard.writeText(JSON.stringify(errorDetails, null, 2))
      .then(() => {
        // Show success message
        this.setState({ copied: true });
        setTimeout(() => this.setState({ copied: false }), 2000);
      })
      .catch(err => console.error('Failed to copy:', err));
  };

  render() {
    const { hasError, error, errorInfo, errorCount, copied } = this.state;
    const { 
      fallback = null,
      showDetails = process.env.NODE_ENV === 'development',
      maxRetries = 3,
      children 
    } = this.props;

    if (hasError) {
      // Custom fallback UI
      if (fallback) {
        return fallback;
      }

      // Default fallback UI
      return (
        <div className="error-boundary" role="alert">
          <div className="error-boundary-container">
            <div className="error-icon">
              <span role="img" aria-label="Error">⚠️</span>
            </div>
            
            <h1 className="error-title">Something went wrong</h1>
            
            <p className="error-message">
              {error?.message || "An unexpected error occurred while rendering this component."}
            </p>
            
            {errorCount >= maxRetries && (
              <div className="error-warning">
                <strong>⚠️ Multiple errors detected</strong>
                <p>This might indicate a recurring issue. Please contact support if the problem persists.</p>
              </div>
            )}
            
            <div className="error-actions">
              <button 
                onClick={this.handleRetry} 
                className="error-btn error-btn-primary"
              >
                🔄 Try Again
              </button>
              
              <button 
                onClick={this.handleReload} 
                className="error-btn error-btn-secondary"
              >
                🔄 Reload Page
              </button>
              
              <button 
                onClick={this.handleGoBack} 
                className="error-btn error-btn-secondary"
              >
                ⬅️ Go Back
              </button>
              
              <button 
                onClick={this.copyErrorDetails} 
                className="error-btn error-btn-outline"
              >
                {copied ? "✅ Copied!" : "📋 Copy Error Details"}
              </button>
            </div>
            
            {showDetails && error && (
              <details className="error-details">
                <summary>Technical Details</summary>
                <div className="error-details-content">
                  <h3>Error:</h3>
                  <pre>{error.toString()}</pre>
                  
                  {error.stack && (
                    <>
                      <h3>Stack Trace:</h3>
                      <pre>{error.stack}</pre>
                    </>
                  )}
                  
                  {errorInfo && (
                    <>
                      <h3>Component Stack:</h3>
                      <pre>{errorInfo.componentStack}</pre>
                    </>
                  )}
                  
                  <h3>Environment:</h3>
                  <pre>
                    URL: {window.location.href}
                    User Agent: {navigator.userAgent}
                    Timestamp: {new Date().toISOString()}
                  </pre>
                </div>
              </details>
            )}
          </div>
        </div>
      );
    }

    return children;
  }
}

export default ErrorBoundary;