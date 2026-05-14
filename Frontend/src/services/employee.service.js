import { db } from "./firebase";
import {
  ref,
  set,
  get,
  update,
  remove,
  query,
  orderByChild,
  equalTo,
  runTransaction
} from "firebase/database";
import bcrypt from "bcryptjs";

/* ======================================================
   CONSTANTS
====================================================== */

const VALID_ROLES = ["admin", "manager", "cashier", "employee", "supervisor"];
const DEFAULT_PERMISSIONS = {
  admin: {
    manageEmployees: true,
    manageProducts: true,
    manageBills: true,
    manageCustomers: true,
    viewReports: true,
    manageSettings: true,
    manageAccounting: true
  },
  manager: {
    manageEmployees: false,
    manageProducts: true,
    manageBills: true,
    manageCustomers: true,
    viewReports: true,
    manageSettings: false,
    manageAccounting: false
  },
  supervisor: {
    manageEmployees: false,
    manageProducts: true,
    manageBills: true,
    manageCustomers: true,
    viewReports: true,
    manageSettings: false,
    manageAccounting: false
  },
  cashier: {
    manageEmployees: false,
    manageProducts: false,
    manageBills: true,
    manageCustomers: true,
    viewReports: false,
    manageSettings: false,
    manageAccounting: false
  },
  employee: {
    manageEmployees: false,
    manageProducts: false,
    manageBills: false,
    manageCustomers: false,
    viewReports: false,
    manageSettings: false,
    manageAccounting: false
  }
};

const SALT_ROUNDS = 12;

/* ======================================================
   SANITIZE FUNCTION FOR FIREBASE PATHS (CRITICAL FIX)
====================================================== */

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

/* ======================================================
   HELPER FUNCTIONS
====================================================== */

const validateUsername = (username) => {
  if (!username || username.length < 3) {
    throw new Error("Username must be at least 3 characters long");
  }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    throw new Error("Username can only contain letters, numbers, and underscores");
  }
  return true;
};

const validatePassword = (password) => {
  if (!password || password.length < 6) {
    throw new Error("Password must be at least 6 characters long");
  }
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumbers = /\d/.test(password);
  
  if (!hasUpperCase || !hasLowerCase || !hasNumbers) {
    throw new Error("Password must contain uppercase, lowercase, and numbers");
  }
  return true;
};

const validatePhone = (phone) => {
  if (phone && !/^[0-9]{10}$/.test(phone)) {
    throw new Error("Phone number must be 10 digits");
  }
  return true;
};

const validateEmail = (email) => {
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Invalid email format");
  }
  return true;
};

/* ======================================================
   CHECK USERNAME UNIQUENESS
====================================================== */

const isUsernameUnique = async (shopId, username, excludeEmployeeId = null) => {
  const employeesRef = ref(db, `shops/${shopId}/employees`);
  const usernameQuery = query(employeesRef, orderByChild('username'), equalTo(username));
  const snapshot = await get(usernameQuery);
  
  if (!snapshot.exists()) return true;
  
  if (excludeEmployeeId) {
    let isSameEmployee = false;
    snapshot.forEach((child) => {
      if (child.key === excludeEmployeeId) {
        isSameEmployee = true;
      }
    });
    return isSameEmployee;
  }
  
  return false;
};

/* ======================================================
   GENERATE EMPLOYEE ID
====================================================== */

const generateEmployeeId = async (shopId, role = null) => {
  const snap = await get(ref(db, `shops/${shopId}/employees`));
  
  if (!snap.exists()) {
    const prefix = role ? `${role.substring(0, 3).toUpperCase()}` : "EMP";
    return `${prefix}001`;
  }
  
  const employees = snap.val();
  const ids = Object.keys(employees);
  
  const numbers = ids.map((id) => {
    const match = id.match(/\d+$/);
    return match ? parseInt(match[0]) : 0;
  }).filter(num => !isNaN(num));
  
  const next = (Math.max(...numbers, 0) + 1).toString().padStart(3, "0");
  
  let prefix = "EMP";
  if (role) {
    const rolePrefixes = {
      admin: "ADM",
      manager: "MGR",
      supervisor: "SPV",
      cashier: "CSH",
      employee: "EMP"
    };
    prefix = rolePrefixes[role] || "EMP";
  }
  
  return `${prefix}${next}`;
};

/* ======================================================
   CHECK PHONE EXISTS
====================================================== */

const checkPhoneExists = async (shopId, phone) => {
  if (!phone) return false;
  
  const phoneIndexRef = ref(db, `shops/${shopId}/employeePhoneIndex/${phone}`);
  const snapshot = await get(phoneIndexRef);
  return snapshot.exists();
};

/* ======================================================
   CREATE EMPLOYEE (FIXED - WITH INDEX)
====================================================== */

export const createEmployee = async ({
  shopId,
  username,
  password,
  role,
  name,
  phone,
  email,
  salary = 0,
  department = "",
  hireDate = null,
  address = "",
  emergencyContact = null,
  documents = null
}) => {
  // Validation
  if (!shopId) throw new Error("Shop ID required");
  if (!username) throw new Error("Username required");
  if (!password) throw new Error("Password required");
  if (!VALID_ROLES.includes(role)) {
    throw new Error(`Invalid role. Must be one of: ${VALID_ROLES.join(", ")}`);
  }
  
  validateUsername(username);
  validatePassword(password);
  validatePhone(phone);
  validateEmail(email);
  
  // Check username uniqueness
  const isUnique = await isUsernameUnique(shopId, username);
  if (!isUnique) {
    throw new Error("Username already exists");
  }
  
  // Check phone uniqueness if provided
  if (phone) {
    const phoneExists = await checkPhoneExists(shopId, phone);
    if (phoneExists) {
      throw new Error("Phone number already registered to another employee");
    }
  }
  
  // Generate employee ID
  const employeeId = await generateEmployeeId(shopId, role);
  const timestamp = Date.now();
  
  // Hash password
  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
  
  // Create employee data
  const employeeData = {
    id: employeeId,
    username: username.toLowerCase(),
    password: hashedPassword,
    name: name || username,
    phone: phone || "",
    email: email || "",
    role,
    department: department || "",
    salary: parseFloat(salary) || 0,
    hireDate: hireDate || timestamp,
    address: address || "",
    emergencyContact: emergencyContact || null,
    documents: documents || null,
    active: true,
    online: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastLoginAt: null,
    lastLogoutAt: null,
    loginCount: 0,
    permissions: DEFAULT_PERMISSIONS[role] || DEFAULT_PERMISSIONS.employee,
    attendance: {
      totalPresent: 0,
      totalAbsent: 0,
      totalLate: 0,
      lastAttendanceDate: null
    }
  };
  
  // Save employee
  await set(ref(db, `shops/${shopId}/employees/${employeeId}`), employeeData);
  
  // ========== CRITICAL FIX: CREATE EMPLOYEE INDEX FOR LOGIN ==========
  const safeKey = sanitizeForKey(username.toLowerCase());
  await set(ref(db, `employeeIndex/${safeKey}`), {
    shopId: shopId,
    employeeId: employeeId,
    username: username.toLowerCase()
  });
  console.log(`✅ Created employee index: employeeIndex/${safeKey}`);
  
  // Also create email index if email exists
  if (email) {
    const emailHash = createEmailHash(email);
    await set(ref(db, `employeeIndexHash/${emailHash}`), {
      shopId: shopId,
      employeeId: employeeId,
      email: email.toLowerCase()
    });
    console.log(`✅ Created email index: employeeIndexHash/${emailHash}`);
  }
  
  // Create username index for fast lookup
  await set(ref(db, `shops/${shopId}/employeeUsernameIndex/${username.toLowerCase()}`), employeeId);
  
  // Create phone index if phone exists
  if (phone) {
    await set(ref(db, `shops/${shopId}/employeePhoneIndex/${phone}`), employeeId);
  }
  
  // Create audit log
  await logEmployeeAction(shopId, "create", employeeId, { username, role, name });
  
  return {
    success: true,
    employeeId,
    username,
    role,
    name: employeeData.name
  };
};

/* ======================================================
   CREATE EMAIL HASH
====================================================== */

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

/* ======================================================
   FETCH EMPLOYEES
====================================================== */

export const fetchEmployees = async (shopId, filters = {}) => {
  if (!shopId) throw new Error("Shop ID required");
  
  const employeesRef = ref(db, `shops/${shopId}/employees`);
  const snapshot = await get(employeesRef);
  
  if (!snapshot.exists()) return [];
  
  let employees = [];
  
  snapshot.forEach((child) => {
    const employee = {
      id: child.key,
      ...child.val()
    };
    delete employee.password;
    employees.push(employee);
  });
  
  if (filters.role) {
    employees = employees.filter(emp => emp.role === filters.role);
  }
  
  if (filters.active !== undefined) {
    employees = employees.filter(emp => emp.active === filters.active);
  }
  
  if (filters.department) {
    employees = employees.filter(emp => emp.department === filters.department);
  }
  
  if (filters.search) {
    const searchLower = filters.search.toLowerCase();
    employees = employees.filter(emp => 
      emp.name.toLowerCase().includes(searchLower) ||
      emp.username.toLowerCase().includes(searchLower) ||
      (emp.phone && emp.phone.includes(searchLower))
    );
  }
  
  employees.sort((a, b) => {
    if (filters.sortBy === "name") {
      return a.name.localeCompare(b.name);
    }
    return b.createdAt - a.createdAt;
  });
  
  return employees;
};

/* ======================================================
   FETCH EMPLOYEE BY ID
====================================================== */

export const fetchEmployeeById = async (shopId, employeeId) => {
  if (!shopId || !employeeId) throw new Error("Shop ID and Employee ID required");
  
  const employeeRef = ref(db, `shops/${shopId}/employees/${employeeId}`);
  const snapshot = await get(employeeRef);
  
  if (!snapshot.exists()) {
    return null;
  }
  
  const employee = snapshot.val();
  delete employee.password;
  
  return {
    id: employeeId,
    ...employee
  };
};

/* ======================================================
   UPDATE EMPLOYEE
====================================================== */

export const updateEmployee = async (shopId, employeeId, updates) => {
  if (!shopId) throw new Error("Shop ID required");
  if (!employeeId) throw new Error("Employee ID required");
  
  const employeeRef = ref(db, `shops/${shopId}/employees/${employeeId}`);
  const snapshot = await get(employeeRef);
  
  if (!snapshot.exists()) {
    throw new Error("Employee not found");
  }
  
  const currentEmployee = snapshot.val();
  const updateData = {};
  
  if (updates.username) {
    validateUsername(updates.username);
    const isUnique = await isUsernameUnique(shopId, updates.username, employeeId);
    if (!isUnique) {
      throw new Error("Username already exists");
    }
    updateData.username = updates.username.toLowerCase();
    
    // Update username index
    await set(ref(db, `shops/${shopId}/employeeUsernameIndex/${updates.username.toLowerCase()}`), employeeId);
    await remove(ref(db, `shops/${shopId}/employeeUsernameIndex/${currentEmployee.username}`));
    
    // Update global employee index
    const oldSafeKey = sanitizeForKey(currentEmployee.username.toLowerCase());
    const newSafeKey = sanitizeForKey(updates.username.toLowerCase());
    await remove(ref(db, `employeeIndex/${oldSafeKey}`));
    await set(ref(db, `employeeIndex/${newSafeKey}`), {
      shopId: shopId,
      employeeId: employeeId,
      username: updates.username.toLowerCase()
    });
  }
  
  if (updates.password) {
    validatePassword(updates.password);
    updateData.password = await bcrypt.hash(updates.password, SALT_ROUNDS);
  }
  
  if (updates.phone) {
    validatePhone(updates.phone);
    if (updates.phone !== currentEmployee.phone) {
      const phoneExists = await checkPhoneExists(shopId, updates.phone);
      if (phoneExists) {
        throw new Error("Phone number already registered to another employee");
      }
      updateData.phone = updates.phone;
      
      if (currentEmployee.phone) {
        await remove(ref(db, `shops/${shopId}/employeePhoneIndex/${currentEmployee.phone}`));
      }
      await set(ref(db, `shops/${shopId}/employeePhoneIndex/${updates.phone}`), employeeId);
    }
  }
  
  if (updates.email) {
    validateEmail(updates.email);
    updateData.email = updates.email;
  }
  
  if (updates.role) {
    if (!VALID_ROLES.includes(updates.role)) {
      throw new Error(`Invalid role. Must be one of: ${VALID_ROLES.join(", ")}`);
    }
    updateData.role = updates.role;
    updateData.permissions = DEFAULT_PERMISSIONS[updates.role] || DEFAULT_PERMISSIONS.employee;
  }
  
  if (updates.salary !== undefined) {
    updateData.salary = parseFloat(updates.salary) || 0;
  }
  
  if (updates.department !== undefined) {
    updateData.department = updates.department;
  }
  
  if (updates.address !== undefined) {
    updateData.address = updates.address;
  }
  
  if (updates.active !== undefined) {
    updateData.active = updates.active;
  }
  
  if (updates.name) {
    updateData.name = updates.name;
  }
  
  if (updates.emergencyContact) {
    updateData.emergencyContact = updates.emergencyContact;
  }
  
  updateData.updatedAt = Date.now();
  
  await update(employeeRef, updateData);
  await logEmployeeAction(shopId, "update", employeeId, Object.keys(updates));
  
  return {
    success: true,
    message: "Employee updated successfully",
    updatedFields: Object.keys(updateData)
  };
};

/* ======================================================
   UPDATE EMPLOYEE STATUS
====================================================== */

export const updateEmployeeStatus = async (shopId, employeeId, data) => {
  if (!shopId) throw new Error("Shop ID required");
  if (!employeeId) throw new Error("Employee ID required");
  
  const updateData = {
    ...data,
    updatedAt: Date.now()
  };
  
  if (data.online === true) {
    updateData.loginCount = await incrementLoginCount(shopId, employeeId);
  }
  
  await update(ref(db, `shops/${shopId}/employees/${employeeId}`), updateData);
  
  return { success: true };
};

/* ======================================================
   INCREMENT LOGIN COUNT
====================================================== */

const incrementLoginCount = async (shopId, employeeId) => {
  const employeeRef = ref(db, `shops/${shopId}/employees/${employeeId}`);
  let newCount = 0;
  
  await runTransaction(employeeRef, (employee) => {
    if (employee) {
      newCount = (employee.loginCount || 0) + 1;
      employee.loginCount = newCount;
    }
    return employee;
  });
  
  return newCount;
};

/* ======================================================
   REMOVE EMPLOYEE
====================================================== */

export const removeEmployee = async (shopId, employeeId, permanent = false) => {
  if (!shopId) throw new Error("Shop ID required");
  if (!employeeId) throw new Error("Employee ID required");
  
  const employeeRef = ref(db, `shops/${shopId}/employees/${employeeId}`);
  const snapshot = await get(employeeRef);
  
  if (!snapshot.exists()) {
    throw new Error("Employee not found");
  }
  
  const employee = snapshot.val();
  
  if (permanent) {
    await remove(employeeRef);
    
    await remove(ref(db, `shops/${shopId}/employeeUsernameIndex/${employee.username}`));
    if (employee.phone) {
      await remove(ref(db, `shops/${shopId}/employeePhoneIndex/${employee.phone}`));
    }
    
    // Remove global index
    const safeKey = sanitizeForKey(employee.username.toLowerCase());
    await remove(ref(db, `employeeIndex/${safeKey}`));
  } else {
    await update(employeeRef, {
      active: false,
      terminated: true,
      terminatedAt: Date.now(),
      updatedAt: Date.now()
    });
  }
  
  await logEmployeeAction(shopId, permanent ? "permanent_delete" : "soft_delete", employeeId, {
    username: employee.username,
    permanent
  });
  
  return {
    success: true,
    message: permanent ? "Employee permanently deleted" : "Employee deactivated"
  };
};

/* ======================================================
   BULK EMPLOYEE OPERATIONS
====================================================== */

export const bulkUpdateEmployees = async (shopId, employeeIds, updates) => {
  if (!shopId || !employeeIds || employeeIds.length === 0) {
    throw new Error("Shop ID and employee IDs required");
  }
  
  const results = {
    success: [],
    failed: []
  };
  
  for (const employeeId of employeeIds) {
    try {
      await updateEmployee(shopId, employeeId, updates);
      results.success.push(employeeId);
    } catch (error) {
      results.failed.push({ employeeId, error: error.message });
    }
  }
  
  return results;
};

/* ======================================================
   LOG EMPLOYEE ACTIONS
====================================================== */

const logEmployeeAction = async (shopId, action, employeeId, details) => {
  try {
    const logRef = ref(db, `shops/${shopId}/employeeLogs/${Date.now()}`);
    await set(logRef, {
      action,
      employeeId,
      details: typeof details === 'object' ? JSON.stringify(details) : details,
      timestamp: Date.now(),
      ipAddress: null
    });
  } catch (error) {
    console.error("Failed to log employee action:", error);
  }
};

/* ======================================================
   GET EMPLOYEE STATISTICS
====================================================== */

export const getEmployeeStatistics = async (shopId) => {
  const employees = await fetchEmployees(shopId);
  
  const stats = {
    total: employees.length,
    active: employees.filter(e => e.active).length,
    inactive: employees.filter(e => !e.active).length,
    online: employees.filter(e => e.online).length,
    byRole: {},
    totalSalary: 0,
    averageSalary: 0
  };
  
  let totalSalary = 0;
  
  employees.forEach(emp => {
    stats.byRole[emp.role] = (stats.byRole[emp.role] || 0) + 1;
    if (emp.salary) {
      totalSalary += emp.salary;
    }
  });
  
  stats.totalSalary = totalSalary;
  stats.averageSalary = employees.length > 0 ? totalSalary / employees.length : 0;
  
  return stats;
};

/* ======================================================
   RESET EMPLOYEE PASSWORD
====================================================== */

export const resetEmployeePassword = async (shopId, employeeId, newPassword) => {
  if (!shopId || !employeeId || !newPassword) {
    throw new Error("Shop ID, Employee ID, and new password required");
  }
  
  validatePassword(newPassword);
  
  const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
  
  await update(ref(db, `shops/${shopId}/employees/${employeeId}`), {
    password: hashedPassword,
    updatedAt: Date.now(),
    passwordResetAt: Date.now()
  });
  
  await logEmployeeAction(shopId, "password_reset", employeeId, "Password reset by admin");
  
  return { success: true, message: "Password reset successfully" };
};

/* ======================================================
   EXPORT EMPLOYEES TO CSV
====================================================== */

export const exportEmployeesToCSV = async (shopId) => {
  const employees = await fetchEmployees(shopId);
  
  const csvData = employees.map(emp => ({
    ID: emp.id,
    Name: emp.name,
    Username: emp.username,
    Role: emp.role,
    Phone: emp.phone || '',
    Email: emp.email || '',
    Department: emp.department || '',
    Salary: emp.salary || 0,
    Status: emp.active ? 'Active' : 'Inactive',
    'Last Login': emp.lastLoginAt ? new Date(emp.lastLoginAt).toLocaleString() : 'Never',
    'Created At': new Date(emp.createdAt).toLocaleString()
  }));
  
  return csvData;
};

/* ======================================================
   EXPORTS
====================================================== */

export { sanitizeForKey, createEmailHash };