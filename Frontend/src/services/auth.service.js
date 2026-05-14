import {
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification
} from "firebase/auth";

import {
  ref,
  get,
  set,
  update,
  remove,
  query,
  orderByChild,
  equalTo,
  push,
  serverTimestamp
} from "firebase/database";

import bcrypt from "bcryptjs";
import { auth, db, googleProvider } from "./firebase";
import { initializeDefaultLedgers } from "../accounting/ledgerInitializer";

/* ======================================================
   CONSTANTS & HELPERS
====================================================== */

const cleanEmail = (email) => email?.trim().toLowerCase();

/**
 * Convert email/username to valid Firebase path key
 * Firebase paths cannot contain: . # $ [ ] / @
 */
const sanitizeForKey = (input) => {
  if (!input) return "";
  
  return input
    .toLowerCase()
    .replace(/\./g, '_dot_')
    .replace(/@/g, '_at_')
    .replace(/#/g, '_hash_')
    .replace(/\$/g, '_dollar_')
    .replace(/\[/g, '_lb_')
    .replace(/\]/g, '_rb_')
    .replace(/\//g, '_slash_')
    .replace(/\\/g, '_bslash_')
    .replace(/\s/g, '_');
};

/**
 * Create a hash-based key for emails
 */
const createEmailHash = (email) => {
  let hash = 0;
  const normalized = email.toLowerCase().trim();
  
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  
  return `email_${Math.abs(hash).toString(36)}`;
};

// Rate limiting for login attempts
const loginAttempts = new Map();

const checkRateLimit = (identifier) => {
  const now = Date.now();
  const attempts = loginAttempts.get(identifier) || [];
  
  const recentAttempts = attempts.filter(time => now - time < 15 * 60 * 1000);
  
  if (recentAttempts.length >= 5) {
    const oldestAttempt = Math.min(...recentAttempts);
    const waitTime = Math.ceil((15 * 60 * 1000 - (now - oldestAttempt)) / 1000);
    throw new Error(`Too many login attempts. Please wait ${waitTime} seconds.`);
  }
  
  recentAttempts.push(now);
  loginAttempts.set(identifier, recentAttempts);
};

const clearRateLimit = (identifier) => {
  loginAttempts.delete(identifier);
};

// Session management
const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours

const setSession = (userData) => {
  const session = {
    ...userData,
    sessionStart: Date.now(),
    sessionExpiry: Date.now() + SESSION_DURATION
  };
  localStorage.setItem("userSession", JSON.stringify(session));
};

const clearSession = () => {
  localStorage.removeItem("userSession");
  localStorage.removeItem("employeeSession");
};

export const checkSession = () => {
  const session = localStorage.getItem("userSession");
  if (!session) return null;
  
  try {
    const parsed = JSON.parse(session);
    if (Date.now() > parsed.sessionExpiry) {
      clearSession();
      return null;
    }
    return parsed;
  } catch {
    clearSession();
    return null;
  }
};

/* ======================================================
   EMPLOYEE LOGIN (Database only - NO Firebase Auth)
====================================================== */

const loginEmployee = async (username, password, ipAddress = null, userAgent = null) => {
  try {
    const cleanUser = cleanEmail(username);

    if (!cleanUser) return null;

    // RATE LIMIT
    checkRateLimit(`employee_${cleanUser}`);

    const safeKey = sanitizeForKey(cleanUser);
    const emailHash = createEmailHash(cleanUser);

    // SAFE DB ACCESS
    let indexSnap;

    try {
      indexSnap = await get(ref(db, `employeeIndex/${safeKey}`));
    } catch (err) {
      throw new Error("PERMISSION_DENIED_EMPLOYEE_INDEX");
    }

    if (!indexSnap.exists()) {
      try {
        indexSnap = await get(ref(db, `employeeIndexHash/${emailHash}`));
      } catch (err) {
        throw new Error("PERMISSION_DENIED_EMPLOYEE_INDEX_HASH");
      }
    }

    if (!indexSnap.exists()) {
      return null;
    }

    const { shopId, employeeId } = indexSnap.val();

    // FETCH EMPLOYEE
    let empSnap;

    try {
      empSnap = await get(ref(db, `shops/${shopId}/employees/${employeeId}`));
    } catch (err) {
      throw new Error("PERMISSION_DENIED_EMPLOYEE_DATA");
    }

    if (!empSnap.exists()) {
      return null;
    }

    const emp = empSnap.val();

    // STATUS CHECKS
    if (emp.active !== true) throw new Error("ACCOUNT_DISABLED");
    if (emp.terminated) throw new Error("ACCOUNT_TERMINATED");

    // PASSWORD CHECK
    const isMatch = await bcrypt.compare(password, emp.password);

    if (!isMatch) {
      await logFailedAttempt(shopId, employeeId, username, ipAddress, userAgent);
      return null;
    }

    clearRateLimit(`employee_${cleanUser}`);

    // LOGIN SIDE EFFECTS (SAFE)
    try {
      const today = new Date().toLocaleDateString("en-CA");

      await set(ref(db, `shops/${shopId}/attendance/${today}/${employeeId}`), {
        status: "present",
        markedAt: Date.now(),
        auto: true,
        ipAddress,
        userAgent
      });

      await update(ref(db, `shops/${shopId}/employees/${employeeId}`), {
        online: true,
        lastLoginAt: Date.now(),
        lastLoginIP: ipAddress,
        lastLoginUserAgent: userAgent,
        loginCount: (emp.loginCount || 0) + 1
      });

    } catch (err) {
      // Non-critical error, continue
    }

    // RETURN USER
    const employeeUser = {
      type: "employee",
      employeeId,
      shopId,
      role: emp.role || "employee",
      name: emp.name || "Employee",
      username: emp.username || "",
      email: emp.email || "",
      active: emp.active ?? true,
      permissions: emp.permissions || getDefaultPermissions(emp.role)
    };

    localStorage.setItem("employeeSession", JSON.stringify(employeeUser));
    setSession(employeeUser);

    return employeeUser;

  } catch (err) {
    // CLEAN ERROR MESSAGES
    if (err.message.includes("PERMISSION_DENIED")) {
      throw new Error("Database permission denied. Check Firebase rules.");
    }

    throw err;
  }
};

const getDefaultPermissions = (role) => {
  const basePermissions = {
    viewDashboard: true,
    createBill: false,
    editBill: false,
    cancelBill: false,
    viewReports: false,
    manageProducts: false,
    manageCustomers: false,
    manageStaff: false,
    manageAccounting: false
  };
  
  switch(role) {
    case 'manager':
      return { ...basePermissions, viewReports: true, manageProducts: true, manageStaff: true };
    case 'cashier':
      return { ...basePermissions, createBill: true, viewDashboard: true };
    case 'accountant':
      return { ...basePermissions, viewReports: true, manageAccounting: true };
    case 'admin':
      return Object.keys(basePermissions).reduce((acc, key) => ({ ...acc, [key]: true }), {});
    default:
      return basePermissions;
  }
};

const logFailedAttempt = async (shopId, employeeId, username, ipAddress, userAgent) => {
  try {
    const failedAttemptsRef = ref(db, `shops/${shopId}/failedLogins/${employeeId}`);
    const snap = await get(failedAttemptsRef);
    let attempts = snap.val() || [];
    
    if (!Array.isArray(attempts)) {
      attempts = [];
    }
    
    attempts.push({
      timestamp: Date.now(),
      username,
      ipAddress,
      userAgent
    });
    
    const recentAttempts = attempts.slice(-10);
    await set(failedAttemptsRef, recentAttempts);
  } catch (error) {
    // Silent fail for logging
  }
};

/* ======================================================
   ADMIN VALIDATION (Firebase Auth)
====================================================== */

const validateAdmin = async (uid, ipAddress = null, userAgent = null) => {
  const userRef = ref(db, `users/${uid}`);
  const snap = await get(userRef);

  if (!snap.exists()) {
    throw new Error("ADMIN_PROFILE_MISSING");
  }

  const profile = snap.val();

  if (!profile.active) {
    throw new Error("ACCOUNT_DISABLED");
  }

  const shopId = profile.shopId;

  if (!shopId) {
    throw new Error("SHOP_NOT_LINKED");
  }

  const shopSnap = await get(ref(db, `shops/${shopId}`));

  if (!shopSnap.exists()) {
    throw new Error("SHOP_NOT_FOUND");
  }

  // Update login info
  await update(userRef, {
    online: true,
    lastLoginAt: Date.now(),
    lastLoginIP: ipAddress,
    lastLoginUserAgent: userAgent,
    loginCount: (profile.loginCount || 0) + 1
  });

  const adminUser = {
    type: "admin",
    uid,
    name: profile.name,
    role: profile.role || "admin",
    shopId,
    email: profile.email,
    permissions: getAdminPermissions(profile.role)
  };

  setSession(adminUser);
  return adminUser;
};

const getAdminPermissions = (role) => {
  if (role === 'superadmin') {
    return {
      manageAllShops: true,
      manageUsers: true,
      viewAllReports: true,
      systemSettings: true,
      manageGlobalSettings: true
    };
  }
  
  return {
    manageProducts: true,
    manageBills: true,
    manageCustomers: true,
    manageStaff: true,
    viewReports: true,
    manageSettings: true,
    viewAccounting: true,
    manageAccounting: true
  };
};

/* ======================================================
   CREATE EMPLOYEE INDEX
====================================================== */

const createEmployeeIndex = async (shopId, employeeId, username, email = null) => {
  try {
    const safeUsername = sanitizeForKey(username.toLowerCase());
    
    await set(ref(db, `employeeIndex/${safeUsername}`), {
      shopId,
      employeeId,
      username: username.toLowerCase(),
      createdAt: Date.now()
    });
    
    if (email) {
      const emailHash = createEmailHash(email);
      await set(ref(db, `employeeIndexHash/${emailHash}`), {
        shopId,
        employeeId,
        email: email.toLowerCase(),
        createdAt: Date.now()
      });
    }
    
    return { success: true };
  } catch (error) {
    console.error("Failed to create employee index:", error);
    return { success: false, error: error.message };
  }
};

/* ======================================================
   LOGIN - TRY EMPLOYEE FIRST, THEN ADMIN
====================================================== */

export const loginWithEmail = async (email, password, ipAddress = null, userAgent = null) => {
  const username = cleanEmail(email);
  
  if (!username) {
    throw new Error("Invalid email format");
  }
  
  try {
    // FIRST: Try employee login (Database only)
    const employee = await loginEmployee(username, password, ipAddress, userAgent);
    if (employee) {
      return employee;
    }

    // SECOND: Try admin login (Firebase Auth)
    checkRateLimit(`admin_${username}`);
    
    const credential = await signInWithEmailAndPassword(auth, username, password);
    clearRateLimit(`admin_${username}`);
    
    return await validateAdmin(credential.user.uid, ipAddress, userAgent);

  } catch (error) {
    if (error.code === "auth/invalid-credential" || error.code === "auth/user-not-found") {
      throw new Error("Invalid email or password");
    }
    
    if (error.code === "auth/too-many-requests") {
      throw new Error("Too many failed attempts. Please try again later.");
    }
    
    if (error.message === "ACCOUNT_DISABLED") {
      throw new Error("Your account has been disabled. Please contact administrator.");
    }
    
    if (error.message === "ACCOUNT_TERMINATED") {
      throw new Error("Your employment has been terminated.");
    }
    
    throw new Error(error.message || "Login failed. Please try again.");
  }
};

/* ======================================================
   SIGNUP SHOP OWNER
====================================================== */

export const signupShopOwner = async ({
  name,
  email,
  password,
  companyName,
  phone,
  address,
  gstNumber,
  panNumber = null
}) => {
  try {
    const formattedEmail = cleanEmail(email);
    
    // Check if email already exists in users
    const usersQuery = query(ref(db, 'users'), orderByChild('email'), equalTo(formattedEmail));
    const emailCheck = await get(usersQuery);
    
    if (emailCheck.exists()) {
      throw new Error("Email already registered");
    }

    // Create auth user
    const credential = await createUserWithEmailAndPassword(auth, formattedEmail, password);
    const uid = credential.user.uid;
    const shopId = `shop_${Date.now()}_${uid.slice(0, 8)}`;

    // Send email verification
    await sendEmailVerification(credential.user);

    // Create shop
    await set(ref(db, `shops/${shopId}`), {
      info: {
        companyName,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        phone: phone || null,
        address: address || null,
        gstNumber: gstNumber || null,
        panNumber: panNumber || null,
        status: 'active'
      },
      employees: {},
      customers: {},
      products: {},
      bills: {},
      settings: {
        currency: 'INR',
        timezone: 'Asia/Kolkata',
        invoicePrefix: 'INV',
        lowStockAlert: 5,
        taxRate: 18,
        enableGST: true
      },
      createdAt: serverTimestamp()
    });

    // Create user profile
    await set(ref(db, `users/${uid}`), {
      name,
      email: formattedEmail,
      role: "admin",
      shopId,
      active: true,
      online: true,
      createdAt: Date.now(),
      emailVerified: false,
      phone: phone || null,
      lastLoginAt: Date.now()
    });

    // Initialize default ledgers
    await initializeDefaultLedgers(shopId);

    // Create welcome notification
    const notificationsRef = ref(db, `shops/${shopId}/notifications`);
    const newNotificationRef = push(notificationsRef);
    
    await set(newNotificationRef, {
      id: newNotificationRef.key,
      title: "Welcome to Virevo!",
      message: "Your shop has been successfully created. Start by adding products and staff.",
      type: "success",
      read: false,
      createdAt: Date.now()
    });

    return {
      success: true,
      user: {
        type: "admin",
        uid,
        role: "admin",
        shopId,
        name,
        email: formattedEmail,
        emailVerificationSent: true
      }
    };

  } catch (error) {
    console.error("Signup error:", error);
    throw error;
  }
};

/* ======================================================
   GOOGLE LOGIN
====================================================== */

export const loginWithGoogle = async (ipAddress = null, userAgent = null) => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    
    const userSnap = await get(ref(db, `users/${user.uid}`));
    
    if (!userSnap.exists()) {
      const shopId = `shop_${Date.now()}_${user.uid.slice(0, 8)}`;
      
      await set(ref(db, `shops/${shopId}`), {
        info: {
          companyName: `${user.displayName}'s Shop`,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          status: 'active'
        },
        employees: {},
        customers: {},
        products: {},
        bills: {},
        settings: {
          currency: 'INR',
          timezone: 'Asia/Kolkata',
          invoicePrefix: 'INV',
          lowStockAlert: 5,
          taxRate: 18
        },
        createdAt: serverTimestamp()
      });
      
      await set(ref(db, `users/${user.uid}`), {
        name: user.displayName,
        email: user.email,
        role: "admin",
        shopId,
        active: true,
        online: true,
        createdAt: Date.now(),
        emailVerified: user.emailVerified,
        lastLoginAt: Date.now()
      });
      
      await initializeDefaultLedgers(shopId);
    }
    
    return await validateAdmin(user.uid, ipAddress, userAgent);
    
  } catch (error) {
    console.error("Google login error:", error);
    throw new Error("Google login failed. Please try again.");
  }
};

/* ======================================================
   PASSWORD RESET
====================================================== */

export const resetPassword = async (email) => {
  try {
    const formattedEmail = cleanEmail(email);
    
    if (!formattedEmail) {
      throw new Error("Invalid email address");
    }
    
    await sendPasswordResetEmail(auth, formattedEmail, {
      url: window.location.origin + '/login',
      handleCodeInApp: false
    });
    
    return { success: true, message: "Password reset email sent successfully" };
  } catch (error) {
    console.error("Password reset error:", error);
    
    if (error.code === "auth/user-not-found") {
      throw new Error("No account found with this email address");
    }
    
    throw new Error("Failed to send reset email. Please try again later.");
  }
};

/* ======================================================
   LOGOUT
====================================================== */

export const logoutUser = async () => {
  const user = auth.currentUser;
  const session = checkSession();

  if (user && session) {
    try {
      const updateData = {
        online: false,
        lastLogoutAt: Date.now()
      };
      
      if (session.type === 'admin') {
        await update(ref(db, `users/${user.uid}`), updateData);
      } else if (session.type === 'employee' && session.shopId && session.employeeId) {
        await update(ref(db, `shops/${session.shopId}/employees/${session.employeeId}`), updateData);
      }
    } catch (err) {
      console.warn("Logout update failed:", err);
    }
  }

  clearSession();
  
  if (auth.currentUser) {
    await signOut(auth);
  }
  
  // Clear any other stored data
  localStorage.removeItem("lastLogin");
  sessionStorage.clear();
};

/* ======================================================
   SESSION VALIDATION
====================================================== */

export const validateCurrentSession = async () => {
  const session = checkSession();
  if (!session) return null;
  
  try {
    if (session.type === 'admin') {
      if (!session.uid) return null;
      return await validateAdmin(session.uid);
    } else if (session.type === 'employee') {
      if (!session.shopId || !session.employeeId) return null;
      
      const empSnap = await get(ref(db, `shops/${session.shopId}/employees/${session.employeeId}`));
      
      if (!empSnap.exists()) {
        clearSession();
        return null;
      }
      
      const empData = empSnap.val();
      
      if (empData.active !== true) {
        clearSession();
        return null;
      }
      
      // Update session with latest data
      const updatedSession = {
        ...session,
        name: empData.name || session.name,
        role: empData.role || session.role,
        permissions: empData.permissions || session.permissions
      };
      
      setSession(updatedSession);
      return updatedSession;
    }
  } catch (error) {
    console.error("Session validation error:", error);
    clearSession();
    return null;
  }
  
  return session;
};

/* ======================================================
   ADDITIONAL HELPER FUNCTIONS
====================================================== */

// Create a new employee (admin function)
export const createEmployee = async (shopId, employeeData) => {
  try {
    const employeeId = push(ref(db, `shops/${shopId}/employees`)).key;
    const hashedPassword = await bcrypt.hash(employeeData.password, 10);
    
    const employee = {
      ...employeeData,
      password: hashedPassword,
      employeeId,
      shopId,
      active: true,
      createdAt: Date.now(),
      loginCount: 0,
      online: false
    };
    
    delete employee.confirmPassword;
    
    await set(ref(db, `shops/${shopId}/employees/${employeeId}`), employee);
    
    // Create index for login
    await createEmployeeIndex(shopId, employeeId, employeeData.username, employeeData.email);
    
    return { success: true, employeeId, employee };
  } catch (error) {
    console.error("Create employee error:", error);
    throw new Error("Failed to create employee");
  }
};

// Verify email
export const verifyEmail = async (actionCode) => {
  try {
    await auth.applyActionCode(actionCode);
    return { success: true, message: "Email verified successfully" };
  } catch (error) {
    console.error("Email verification error:", error);
    throw new Error("Failed to verify email");
  }
};

// Resend verification email
export const resendVerificationEmail = async () => {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error("No user logged in");
    
    await sendEmailVerification(user);
    return { success: true, message: "Verification email sent" };
  } catch (error) {
    console.error("Resend verification error:", error);
    throw new Error("Failed to send verification email");
  }
};

/* ======================================================
   EXPORTS
====================================================== */

export { 
  sanitizeForKey, 
  createEmailHash,
  createEmployeeIndex
};