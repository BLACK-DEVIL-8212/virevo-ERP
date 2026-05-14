// src/services/firebase.js

import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  setPersistence,
  browserLocalPersistence,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  sendEmailVerification,
  onAuthStateChanged
} from "firebase/auth";

import { 
  getDatabase, 
  ref, 
  get, 
  set, 
  update, 
  remove, 
  query, 
  orderByChild, 
  equalTo,
  push,
  onValue,
  serverTimestamp,
  runTransaction
} from "firebase/database";

import {
  initializeAppCheck,
  ReCaptchaV3Provider,
  getToken
} from "firebase/app-check";

/* =============================
   ENVIRONMENT
============================= */

const isDev = import.meta.env.DEV;
const isProduction = import.meta.env.PROD;

/* =============================
   VALIDATE CONFIGURATION
============================= */

const validateFirebaseConfig = (config) => {
  const requiredFields = [
    'apiKey',
    'authDomain',
    'databaseURL',
    'projectId',
    'storageBucket',
    'messagingSenderId',
    'appId'
  ];
  
  const missingFields = requiredFields.filter(field => !config[field]);
  
  if (missingFields.length > 0) {
    console.error('Missing Firebase configuration fields:', missingFields);
    throw new Error(`Missing required Firebase config: ${missingFields.join(', ')}`);
  }
  
  return true;
};

/* =============================
   FIREBASE CONFIG
============================= */

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DB_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE,
  messagingSenderId: import.meta.env.VITE_FIREBASE_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

// Validate config before initialization
try {
  validateFirebaseConfig(firebaseConfig);
} catch (error) {
  console.error('Firebase configuration error:', error.message);
  if (isDev) {
    console.warn('Please check your environment variables. Make sure all required Firebase config values are set.');
  }
}

/* =============================
   INITIALIZE FIREBASE APP
============================= */

let app;

try {
  app = getApps().length
    ? getApp()
    : initializeApp(firebaseConfig);
  
  if (isDev) {
    console.log('Firebase app initialized successfully');
  }
} catch (error) {
  console.error('Failed to initialize Firebase app:', error);
  throw error;
}

/* =============================
   APP CHECK (ONLY PRODUCTION)
============================= */

const recaptchaKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;

// App Check is only enabled in production with valid key
if (!isDev && recaptchaKey && recaptchaKey !== 'your_recaptcha_site_key') {
  try {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(recaptchaKey),
      isTokenAutoRefreshEnabled: true
    });
    
    if (isProduction) {
      console.log('Firebase App Check enabled');
    }
  } catch (err) {
    console.warn('Firebase App Check initialization failed:', err.message);
    // App Check is optional, continue without it
  }
} else if (isDev) {
  console.log('Firebase App Check disabled (development mode)');
} else if (!recaptchaKey) {
  console.warn('Firebase App Check not configured - missing reCAPTCHA key');
}

/* =============================
   AUTH
============================= */

export const auth = getAuth(app);

// Set persistence to local (keeps user logged in)
try {
  setPersistence(auth, browserLocalPersistence)
    .then(() => {
      if (isDev) {
        console.log('Auth persistence set to local');
      }
    })
    .catch((error) => {
      console.error('Auth persistence error:', error);
    });
} catch (error) {
  console.error('Failed to set auth persistence:', error);
}

/* =============================
   GOOGLE LOGIN PROVIDER
============================= */

export const googleProvider = new GoogleAuthProvider();

// Add scopes for additional user data
googleProvider.addScope('email');
googleProvider.addScope('profile');

// Set custom parameters
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

/* =============================
   REALTIME DATABASE
============================= */

export const db = getDatabase(app);

// Database reference helpers
export const dbRef = (path) => ref(db, path);
export const dbPush = (path, data) => push(ref(db, path), data);
export const dbSet = (path, data) => set(ref(db, path), data);
export const dbGet = (path) => get(ref(db, path));
export const dbUpdate = (path, data) => update(ref(db, path), data);
export const dbRemove = (path) => remove(ref(db, path));
export const dbQuery = (path, ...conditions) => query(ref(db, path), ...conditions);

/* =============================
   AUTH HELPER FUNCTIONS
============================= */

// Check if user is authenticated
export const isAuthenticated = () => {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(!!user);
    });
  });
};

// Get current user token
export const getCurrentUserToken = async () => {
  const user = auth.currentUser;
  if (!user) return null;
  
  try {
    return await user.getIdToken();
  } catch (error) {
    console.error('Error getting user token:', error);
    return null;
  }
};

// Refresh user token
export const refreshUserToken = async () => {
  const user = auth.currentUser;
  if (!user) return null;
  
  try {
    return await user.getIdToken(true);
  } catch (error) {
    console.error('Error refreshing user token:', error);
    return null;
  }
};

// Get App Check token (for production)
export const getAppCheckToken = async () => {
  if (isDev) return null;
  
  try {
    const appCheck = getApp();
    const token = await getToken(appCheck);
    return token.token;
  } catch (error) {
    console.error('Error getting App Check token:', error);
    return null;
  }
};

/* =============================
   DATABASE HELPER FUNCTIONS
============================= */

// Check if path exists
export const pathExists = async (path) => {
  try {
    const snapshot = await get(ref(db, path));
    return snapshot.exists();
  } catch (error) {
    console.error(`Error checking path ${path}:`, error);
    return false;
  }
};

// Get all data at path
export const getAllData = async (path) => {
  try {
    const snapshot = await get(ref(db, path));
    return snapshot.exists() ? snapshot.val() : null;
  } catch (error) {
    console.error(`Error getting data from ${path}:`, error);
    throw error;
  }
};

// Update multiple paths atomically
export const multiPathUpdate = async (updates) => {
  try {
    await update(ref(db), updates);
    return { success: true };
  } catch (error) {
    console.error('Error performing multi-path update:', error);
    throw error;
  }
};

// Transaction helper
export const runTransactionOnPath = async (path, transactionUpdate) => {
  const pathRef = ref(db, path);
  
  try {
    const result = await runTransaction(pathRef, (currentData) => {
      return transactionUpdate(currentData);
    });
    
    if (result.committed) {
      return { success: true, data: result.snapshot.val() };
    } else {
      return { success: false, error: 'Transaction not committed' };
    }
  } catch (error) {
    console.error(`Transaction failed on ${path}:`, error);
    throw error;
  }
};

/* =============================
   QUERY HELPERS
============================= */

// Query by field equality
export const queryByField = async (path, field, value) => {
  try {
    const q = query(ref(db, path), orderByChild(field), equalTo(value));
    const snapshot = await get(q);
    return snapshot.exists() ? snapshot.val() : null;
  } catch (error) {
    console.error(`Error querying ${path} by ${field}:`, error);
    throw error;
  }
};

// Listen to real-time updates
export const listenToPath = (path, callback) => {
  const pathRef = ref(db, path);
  return onValue(pathRef, (snapshot) => {
    callback(snapshot.exists() ? snapshot.val() : null);
  }, (error) => {
    console.error(`Error listening to ${path}:`, error);
  });
};

/* =============================
   BATCH OPERATIONS
============================= */

// Batch set multiple paths
export const batchSet = async (operations) => {
  const updates = {};
  
  operations.forEach(({ path, data }) => {
    updates[path] = data;
  });
  
  try {
    await update(ref(db), updates);
    return { success: true };
  } catch (error) {
    console.error('Error in batch set:', error);
    throw error;
  }
};

/* =============================
   DEV TOOLS (Development only)
============================= */

if (isDev) {
  // Expose Firebase for debugging (only in development)
  window.__firebaseDebug = {
    auth,
    db,
    isAuthenticated,
    getCurrentUserToken,
    getAllData
  };
  
  console.log('Firebase initialized in development mode');
  console.log('Debug object available at window.__firebaseDebug');
}

/* =============================
   EXPORTS
============================= */

// Core exports
export { app };
export { 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  sendEmailVerification,
  onAuthStateChanged
};

// Database exports
export {
  ref,
  get,
  set,
  update,
  remove,
  query,
  orderByChild,
  equalTo,
  push,
  onValue,
  serverTimestamp,
  runTransaction
};


/* =============================
   INITIALIZATION CHECK
============================= */

// Verify all services are working
export const checkFirebaseServices = async () => {
  const services = {
    app: !!app,
    auth: !!auth,
    database: !!db,
    config: validateFirebaseConfig(firebaseConfig)
  };
  
  // Test database connection
  try {
    const testRef = ref(db, '.info/connected');
    const snapshot = await get(testRef);
    services.databaseConnected = snapshot.exists();
  } catch (error) {
    services.databaseConnected = false;
    services.databaseError = error.message;
  }
  
  // Test auth state
  try {
    const user = auth.currentUser;
    services.authUser = !!user;
  } catch (error) {
    services.authError = error.message;
  }
  
  if (isDev) {
    console.log('Firebase Services Status:', services);
  }
  
  return services;
};

// Optional: Auto-check on import in development
if (isDev) {
  checkFirebaseServices().catch(console.error);
}