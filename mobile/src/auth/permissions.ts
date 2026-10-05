import type { UserProfile } from '../api/types';

/** Action names, mirroring backend/app/seed.py `ACTION`. */
export type Action = 'view' | 'create' | 'edit' | 'approve' | 'export' | 'delete';

export const ACTIONS: Record<Action, string> = {
  view: 'View',
  create: 'Create',
  edit: 'Edit',
  approve: 'Approve',
  export: 'Export',
  delete: 'Delete',
};

/**
 * Role sets mirrored from the backend routers so the UI hides controls the
 * API would reject with 403 anyway.
 *   backend/app/routers/leave.py     APPROVER_ROLES / HR_ROLES
 *   backend/app/routers/attendance.py MGMT_ROLES
 *   backend/app/routers/guests.py     SECURITY_ROLES
 *   backend/app/routers/announcements.py POSTER_ROLES
 */
export const APPROVER_ROLES = ['ADMIN', 'MGMT', 'DH'] as const;
export const HR_ROLES = ['ADMIN', 'MGMT', 'DH', 'HR'] as const;
export const ATTENDANCE_ROSTER_ROLES = ['ADMIN', 'MGMT', 'DH', 'HR'] as const;
export const SECURITY_ROLES = ['ADMIN', 'MGMT', 'DH', 'HR', 'LOG'] as const;
export const NOTICE_POSTER_ROLES = ['ADMIN', 'MGMT', 'HR'] as const;

/** Every permission module the backend seeds. */
export const MODULES = [
  'Home',
  'Dashboard',
  'Orders',
  'Orders.Intel',
  'Planning',
  'Production',
  'Machines',
  'Inventory',
  'MaterialReq',
  'Purchase',
  'PurchaseReq',
  'Logistics',
  'Quality',
  'Engineering',
  'Quotations',
  'Customers',
  'Suppliers',
  'Employees',
  'Attendance',
  'Approvals',
  'Notifications',
  'Reports',
  'Admin',
  'Analytics',
  'Robots',
  'Catalog',
  'BOM',
  // Common company-wide service: any employee may raise a visit (RC).
  'Visits',
  // Deliberately narrower than `Visits` — see the note in backend/app/seed.py.
  'BuyerTracking',
] as const;

export type Module = (typeof MODULES)[number];

export function can(user: UserProfile | null, module: string, action: Action): boolean {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  const key = `${module}:${action}`;
  return user.permissions.some((p) => {
    const [m, a] = p.split(':');
    return m === module && a === action;
  }) || user.permissions.includes(key);
}

export function hasModule(user: UserProfile | null, module: string): boolean {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  const prefix = `${module}:`;
  return user.permissions.some((p) => p.startsWith(prefix));
}

export function isInRole(user: UserProfile | null, roles: readonly string[]): boolean {
  return !!user && roles.includes(user.role);
}

/** True when the user holds at least one action on the module. */
export function anyAction(user: UserProfile | null, module: string): boolean {
  return (
    can(user, module, 'view') ||
    can(user, module, 'create') ||
    can(user, module, 'edit') ||
    can(user, module, 'approve') ||
    can(user, module, 'export')
  );
}