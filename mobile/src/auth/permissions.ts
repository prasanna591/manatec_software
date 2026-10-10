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
  // Gate register: everyone registers their own visitor; only security approves.
  'Guests',
] as const;

export type Module = (typeof MODULES)[number];

/**
 * Pure permission check (AGENT.md §2): gate on the `Module:action` grants the
 * server returns, never on `user.role`. ADMIN is not special-cased here — the
 * backend seeds every permission for ADMIN and `requires()` enforces the same
 * bypass server-side, so the grant list is already complete. Keeping the check
 * role-free means the UI can never claim a right the API would deny.
 */
export function can(user: UserProfile | null, module: string, action: Action): boolean {
  if (!user) return false;
  const key = `${module}:${action}`;
  return user.permissions.some((p) => {
    const [m, a] = p.split(':');
    return m === module && a === action;
  }) || user.permissions.includes(key);
}

/** Check a full `Module:action` grant string (e.g. from a workflow transition). */
export function canGrant(user: UserProfile | null, grant: string): boolean {
  const [module, action] = grant.split(':');
  if (!module || !action) return false;
  return can(user, module, action as Action);
}

export function hasModule(user: UserProfile | null, module: string): boolean {
  if (!user) return false;
  const prefix = `${module}:`;
  return user.permissions.some((p) => p.startsWith(prefix));
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