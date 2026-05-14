const journalAttempts = new Map();

// Clean up old entries periodically (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [userId, timestamp] of journalAttempts.entries()) {
    if (now - timestamp > 60000) { // Remove entries older than 1 minute
      journalAttempts.delete(userId);
    }
  }
}, 300000); // Run every 5 minutes

export const checkJournalRateLimit = (userId) => {
  if (!userId) {
    throw new Error("User ID is required for rate limiting");
  }

  const now = Date.now();
  const lastAttempt = journalAttempts.get(userId);
  const rateLimitMs = 2000; // 2 seconds between attempts

  if (lastAttempt && (now - lastAttempt) < rateLimitMs) {
    const waitTime = Math.ceil((rateLimitMs - (now - lastAttempt)) / 1000);
    throw new Error(`Too many journal requests. Please wait ${waitTime} seconds.`);
  }

  journalAttempts.set(userId, now);
  return true;
};

// Optional: Function to reset rate limit for a specific user
export const resetJournalRateLimit = (userId) => {
  if (userId && journalAttempts.has(userId)) {
    journalAttempts.delete(userId);
  }
};

// Optional: Function to get remaining wait time
export const getJournalRateLimitWaitTime = (userId) => {
  if (!userId) return 0;
  
  const now = Date.now();
  const lastAttempt = journalAttempts.get(userId);
  const rateLimitMs = 2000;
  
  if (lastAttempt) {
    const timeSinceLast = now - lastAttempt;
    if (timeSinceLast < rateLimitMs) {
      return Math.ceil((rateLimitMs - timeSinceLast) / 1000);
    }
  }
  
  return 0;
};