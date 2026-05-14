import { ref, set, get, update, runTransaction } from "firebase/database";
import { db } from "../services/firebase";
import bcrypt from "bcryptjs";

/* ===============================
   CONSTANTS
=============================== */

const VALID_ROLES = ["admin", "manager", "cashier", "employee", "supervisor"];
const SALT_ROUNDS = 12;

// Role-based permissions
const ROLE_PERMISSIONS = {
  admin: {
    manageEmployees: true,
    manageProducts: true,
    manageBills: true,
    manageCustomers: true,
    viewReports: true,
    manageSettings: true,
    manageAccounting: true,
    viewDashboard: true
  },
  manager: {
    manageEmployees: false,
    manageProducts: true,
    manageBills: true,
    manageCustomers: true,
    viewReports: true,
    manageSettings: false,
    manageAccounting: false,
    viewDashboard: true
  },
  supervisor: {
    manageEmployees: false,
    manageProducts: true,
    manageBills: true,
    manageCustomers: true,
    viewReports: true,
    manageSettings: false,
    manageAccounting: false,
    viewDashboard: true
  },
  cashier: {
    manageEmployees: false,
    manageProducts: false,
    manageBills: true,
    manageCustomers: true,
    viewReports: false,
    manageSettings: false,
    manageAccounting: false,
    viewDashboard: true
  },
  employee: {
    manageEmployees: false,
    manageProducts: false,
    manageBills: false,
    manageCustomers: false,
    viewReports: false,
    manageSettings: false,
    manageAccounting: false,
    viewDashboard: false
  }
};

/* ===============================
   VALIDATION FUNCTIONS
=============================== */

const validateEmail = (email) => {
  if (!email) return true; // Email is optional
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const validatePhone = (phone) => {
  if (!phone) return true; // Phone is optional
  const phoneRegex = /^[0-9]{10}$/;
  return phoneRegex.test(phone);
};

const validateName = (name) => {
  if (!name || typeof name !== 'string') return false;
  const trimmed = name.trim();
  return trimmed.length >= 2 && trimmed.length <= 100;
};

const validateRole = (role) => {
  return VALID_ROLES.includes(role);
};

/* ===============================
   CHECK UNIQUENESS
=============================== */

const isEmailUnique = async (email, excludeUid = null) => {
  if (!email) return true;
  
  const usersRef = ref(db, 'users');
  const snapshot = await get(usersRef);
  
  if (!snapshot.exists()) return true;
  
  let exists = false;
  snapshot.forEach((child) => {
    if (excludeUid && child.key === excludeUid) return;
    if (child.val().email === email) {
      exists = true;
    }
  });
  
  return !exists;
};

const isPhoneUnique = async (phone, excludeUid = null) => {
  if (!phone) return true;
  
  const usersRef = ref(db, 'users');
  const snapshot = await get(usersRef);
  
  if (!snapshot.exists()) return true;
  
  let exists = false;
  snapshot.forEach((child) => {
    if (excludeUid && child.key === excludeUid) return;
    if (child.val().phone === phone) {
      exists = true;
    }
  });
  
  return !exists;
};

/* ===============================
   CREATE EMPLOYEE (ENHANCED)
=============================== */

export const createEmployee = async ({
  uid,        // Firebase Auth UID
  name,
  phone,
  email,
  role,
  password,   // Added password field
  shopId,     // Added shop association
  createdBy,
  salary = 0,
  address = "",
  department = "",
  hireDate = null,
  emergencyContact = null,
  documents = null
}) => {
  try {
    // Validate required fields
    if (!uid) {
      throw new Error("User UID is required");
    }
    
    if (!name || !validateName(name)) {
      throw new Error("Valid name is required (2-100 characters)");
    }
    
    if (!validateRole(role)) {
      throw new Error(`Invalid role. Must be one of: ${VALID_ROLES.join(", ")}`);
    }
    
    if (!shopId) {
      throw new Error("Shop ID is required");
    }
    
    if (!createdBy) {
      throw new Error("Creator ID is required");
    }
    
    // Validate optional fields
    if (email && !validateEmail(email)) {
      throw new Error("Invalid email format");
    }
    
    if (phone && !validatePhone(phone)) {
      throw new Error("Phone number must be 10 digits");
    }
    
    // Check if user already exists
    const userRef = ref(db, `users/${uid}`);
    const existingUser = await get(userRef);
    
    if (existingUser.exists()) {
      throw new Error("User already exists with this UID");
    }
    
    // Check email uniqueness
    if (email) {
      const isEmailUnique_ = await isEmailUnique(email);
      if (!isEmailUnique_) {
        throw new Error("Email already registered to another user");
      }
    }
    
    // Check phone uniqueness
    if (phone) {
      const isPhoneUnique_ = await isPhoneUnique(phone);
      if (!isPhoneUnique_) {
        throw new Error("Phone number already registered to another user");
      }
    }
    
    const timestamp = Date.now();
    const hashedPassword = password ? await bcrypt.hash(password, SALT_ROUNDS) : null;
    
    // Prepare employee data
    const employeeData = {
      uid,
      name: name.trim(),
      phone: phone || null,
      email: email || null,
      role,
      shopId,
      active: true,
      online: false,
      createdBy,
      createdAt: timestamp,
      updatedAt: timestamp,
      lastLoginAt: null,
      lastLogoutAt: null,
      loginCount: 0,
      salary: parseFloat(salary) || 0,
      address: address || null,
      department: department || null,
      hireDate: hireDate || timestamp,
      emergencyContact: emergencyContact ? {
        name: emergencyContact.name,
        phone: emergencyContact.phone,
        relationship: emergencyContact.relationship
      } : null,
      documents: documents || null,
      permissions: ROLE_PERMISSIONS[role],
      password: hashedPassword, // Store hashed password for employee login
      isEmployee: true // Flag to identify as employee (not admin)
    };
    
    // Create user record
    await set(userRef, employeeData);
    
    // If shopId is provided, also add to shop's employees list
    if (shopId) {
      const shopEmployeeRef = ref(db, `shops/${shopId}/employees/${uid}`);
      await set(shopEmployeeRef, {
        uid,
        name: name.trim(),
        role,
        active: true,
        hiredAt: timestamp,
        salary: parseFloat(salary) || 0
      });
    }
    
    // Create audit log
    await logEmployeeAction(shopId, "create", uid, {
      name,
      role,
      createdBy
    });
    
    // Return success without sensitive data
    return {
      success: true,
      uid,
      name: employeeData.name,
      role: employeeData.role,
      message: "Employee created successfully"
    };
    
  } catch (error) {
    console.error("Create employee failed:", error);
    return {
      success: false,
      error: error.message || "Employee creation failed"
    };
  }
};

/* ===============================
   UPDATE EMPLOYEE
=============================== */

export const updateEmployee = async (uid, updates, updatedBy) => {
  try {
    if (!uid) {
      throw new Error("User UID is required");
    }
    
    const userRef = ref(db, `users/${uid}`);
    const snapshot = await get(userRef);
    
    if (!snapshot.exists()) {
      throw new Error("Employee not found");
    }
    
    const currentData = snapshot.val();
    const updateData = {
      updatedAt: Date.now(),
      updatedBy
    };
    
    // Validate and add updates
    if (updates.name && validateName(updates.name)) {
      updateData.name = updates.name.trim();
    }
    
    if (updates.email !== undefined) {
      if (updates.email && !validateEmail(updates.email)) {
        throw new Error("Invalid email format");
      }
      if (updates.email) {
        const isEmailUnique_ = await isEmailUnique(updates.email, uid);
        if (!isEmailUnique_) {
          throw new Error("Email already registered to another user");
        }
      }
      updateData.email = updates.email || null;
    }
    
    if (updates.phone !== undefined) {
      if (updates.phone && !validatePhone(updates.phone)) {
        throw new Error("Phone number must be 10 digits");
      }
      if (updates.phone) {
        const isPhoneUnique_ = await isPhoneUnique(updates.phone, uid);
        if (!isPhoneUnique_) {
          throw new Error("Phone number already registered to another user");
        }
      }
      updateData.phone = updates.phone || null;
    }
    
    if (updates.role && validateRole(updates.role)) {
      updateData.role = updates.role;
      updateData.permissions = ROLE_PERMISSIONS[updates.role];
    }
    
    if (updates.active !== undefined) {
      updateData.active = updates.active;
    }
    
    if (updates.salary !== undefined) {
      updateData.salary = parseFloat(updates.salary) || 0;
    }
    
    if (updates.address !== undefined) {
      updateData.address = updates.address || null;
    }
    
    if (updates.department !== undefined) {
      updateData.department = updates.department || null;
    }
    
    if (updates.password) {
      updateData.password = await bcrypt.hash(updates.password, SALT_ROUNDS);
    }
    
    await update(userRef, updateData);
    
    // Update shop employee reference if needed
    if (currentData.shopId) {
      const shopEmployeeRef = ref(db, `shops/${currentData.shopId}/employees/${uid}`);
      await update(shopEmployeeRef, {
        name: updateData.name || currentData.name,
        role: updateData.role || currentData.role,
        active: updateData.active !== undefined ? updateData.active : currentData.active,
        salary: updateData.salary !== undefined ? updateData.salary : currentData.salary,
        updatedAt: Date.now()
      });
    }
    
    await logEmployeeAction(currentData.shopId, "update", uid, {
      updates: Object.keys(updates),
      updatedBy
    });
    
    return {
      success: true,
      message: "Employee updated successfully"
    };
    
  } catch (error) {
    console.error("Update employee failed:", error);
    return {
      success: false,
      error: error.message || "Employee update failed"
    };
  }
};

/* ===============================
   GET EMPLOYEE BY ID
=============================== */

export const getEmployeeById = async (uid) => {
  try {
    if (!uid) return null;
    
    const userRef = ref(db, `users/${uid}`);
    const snapshot = await get(userRef);
    
    if (!snapshot.exists()) return null;
    
    const employee = snapshot.val();
    
    // Remove sensitive data
    delete employee.password;
    
    return {
      ...employee,
      uid
    };
    
  } catch (error) {
    console.error("Get employee failed:", error);
    return null;
  }
};

/* ===============================
   GET EMPLOYEES BY SHOP
=============================== */

export const getEmployeesByShop = async (shopId, filters = {}) => {
  try {
    if (!shopId) return [];
    
    const { role = null, active = null, search = null } = filters;
    const employeesRef = ref(db, `shops/${shopId}/employees`);
    const snapshot = await get(employeesRef);
    
    if (!snapshot.exists()) return [];
    
    let employees = [];
    
    for (const [uid, data] of Object.entries(snapshot.val())) {
      // Get full employee details
      const fullEmployee = await getEmployeeById(uid);
      if (!fullEmployee) continue;
      
      // Apply filters
      if (role && fullEmployee.role !== role) continue;
      if (active !== null && fullEmployee.active !== active) continue;
      if (search) {
        const searchLower = search.toLowerCase();
        const matchesName = fullEmployee.name?.toLowerCase().includes(searchLower);
        const matchesEmail = fullEmployee.email?.toLowerCase().includes(searchLower);
        const matchesPhone = fullEmployee.phone?.includes(search);
        if (!matchesName && !matchesEmail && !matchesPhone) continue;
      }
      
      employees.push(fullEmployee);
    }
    
    // Sort by name
    employees.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    
    return employees;
    
  } catch (error) {
    console.error("Get employees by shop failed:", error);
    return [];
  }
};

/* ===============================
   DELETE EMPLOYEE (SOFT DELETE)
=============================== */

export const deleteEmployee = async (uid, deletedBy, permanent = false) => {
  try {
    if (!uid) {
      throw new Error("User UID is required");
    }
    
    const employee = await getEmployeeById(uid);
    if (!employee) {
      throw new Error("Employee not found");
    }
    
    if (permanent) {
      // Permanent deletion
      await set(ref(db, `users/${uid}`), null);
      
      if (employee.shopId) {
        await set(ref(db, `shops/${employee.shopId}/employees/${uid}`), null);
      }
    } else {
      // Soft delete - deactivate
      await update(ref(db, `users/${uid}`), {
        active: false,
        deletedAt: Date.now(),
        deletedBy,
        updatedAt: Date.now()
      });
      
      if (employee.shopId) {
        await update(ref(db, `shops/${employee.shopId}/employees/${uid}`), {
          active: false,
          deletedAt: Date.now(),
          deletedBy
        });
      }
    }
    
    await logEmployeeAction(employee.shopId, permanent ? "permanent_delete" : "soft_delete", uid, {
      deletedBy,
      permanent
    });
    
    return {
      success: true,
      message: permanent ? "Employee permanently deleted" : "Employee deactivated"
    };
    
  } catch (error) {
    console.error("Delete employee failed:", error);
    return {
      success: false,
      error: error.message || "Employee deletion failed"
    };
  }
};

/* ===============================
   HELPER FUNCTIONS
=============================== */

const logEmployeeAction = async (shopId, action, uid, details) => {
  try {
    const logRef = ref(db, `shops/${shopId}/employeeLogs/${Date.now()}`);
    await set(logRef, {
      action,
      uid,
      details,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error("Failed to log employee action:", error);
  }
};

/* ===============================
   RESET EMPLOYEE PASSWORD
=============================== */

export const resetEmployeePassword = async (uid, newPassword, resetBy) => {
  try {
    if (!uid || !newPassword) {
      throw new Error("UID and new password are required");
    }
    
    if (newPassword.length < 6) {
      throw new Error("Password must be at least 6 characters");
    }
    
    const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
    
    await update(ref(db, `users/${uid}`), {
      password: hashedPassword,
      passwordResetAt: Date.now(),
      passwordResetBy: resetBy,
      updatedAt: Date.now()
    });
    
    return {
      success: true,
      message: "Password reset successfully"
    };
    
  } catch (error) {
    console.error("Reset password failed:", error);
    return {
      success: false,
      error: error.message || "Password reset failed"
    };
  }
};

/* ===============================
   BULK CREATE EMPLOYEES
=============================== */

export const bulkCreateEmployees = async (employees, createdBy) => {
  const results = {
    success: [],
    failed: []
  };
  
  for (const employee of employees) {
    const result = await createEmployee({
      ...employee,
      createdBy
    });
    
    if (result.success) {
      results.success.push(employee.name);
    } else {
      results.failed.push({
        name: employee.name,
        error: result.error
      });
    }
  }
  
  return results;
};

/* ===============================
   EXPORTS
=============================== */

export {
  VALID_ROLES,
  ROLE_PERMISSIONS,
  validateEmail,
  validatePhone,
  validateName,
  validateRole
};