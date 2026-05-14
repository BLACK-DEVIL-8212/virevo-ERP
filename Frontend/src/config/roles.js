// config/roles.js
export const ROLES = {
  SUPERADMIN: 'superadmin',
  ADMIN: 'admin',
  MANAGER: 'manager',
  CASHIER: 'cashier',
  VIEWER: 'viewer'
};

export const ROLE_HIERARCHY = {
  [ROLES.SUPERADMIN]: 4,
  [ROLES.ADMIN]: 3,
  [ROLES.MANAGER]: 2,
  [ROLES.CASHIER]: 1,
  [ROLES.VIEWER]: 0
};

export const ROLE_PERMISSIONS = {
  [ROLES.SUPERADMIN]: ['*'], // All permissions
  
  [ROLES.ADMIN]: [
    'dashboard.view',
    'users.manage',
    'billing.view',
    'billing.create',
    'reports.view',
    'settings.manage'
  ],
  
  [ROLES.MANAGER]: [
    'dashboard.view',
    'billing.view',
    'billing.create',
    'reports.view'
  ],
  
  [ROLES.CASHIER]: [
    'billing.view',
    'billing.create'
  ],
  
  [ROLES.VIEWER]: [
    'billing.view'
  ]
};

// Helper functions
export const hasPermission = (userRole, requiredPermission) => {
  if (userRole === ROLES.SUPERADMIN) return true;
  const permissions = ROLE_PERMISSIONS[userRole] || [];
  return permissions.includes(requiredPermission) || permissions.includes('*');
};

export const hasMinRole = (userRole, requiredRole) => {
  const userLevel = ROLE_HIERARCHY[userRole] || -1;
  const requiredLevel = ROLE_HIERARCHY[requiredRole] || -1;
  return userLevel >= requiredLevel;
};

export const getDefaultRouteForRole = (role) => {
  switch(role) {
    case ROLES.SUPERADMIN:
    case ROLES.ADMIN:
      return '/dashboard';
    case ROLES.MANAGER:
    case ROLES.CASHIER:
    case ROLES.VIEWER:
      return '/billing';
    default:
      return '/login';
  }
};