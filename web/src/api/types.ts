export interface EmployeeProfile {
  id: number;
  name: string;
  code: string;
}

export interface UserProfile {
  id: number;
  username: string;
  role: string;
  employee: EmployeeProfile | null;
  department_id: number | null;
  permissions: string[];
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: UserProfile;
}

export interface DashboardKpis {
  orders: number;
  orders_open: number;
  production_pct: number;
  inventory_pct: number;
  pending_tasks: number;
  delayed_orders: number;
  material_alerts: number;
  as_of: string;
}

export interface DepartmentStatus {
  code: string;
  name: string;
  open_tasks: number;
  total_tasks: number;
  status: 'attention' | 'normal';
}

export interface Activity {
  at: string;
  actor: string;
  action: string;
  entity_type: string;
  entity_ref: string | null;
}

export type TaskStatus = 'open' | 'in_progress' | 'done' | 'cancelled';

export interface Task {
  id: number;
  type: string;
  title: string;
  description: string | null;
  source_ref: string | null;
  priority: string;
  status: TaskStatus;
  due_date: string | null;
  assigned_to: number | null;
  department_id: number | null;
}

export interface Notification {
  id: number;
  title: string;
  body: string | null;
  priority: string;
  entity_type: string | null;
  entity_ref: string | null;
  read: boolean;
  created_at: string;
}

export interface Department {
  id: number;
  code: string;
  name: string;
  active: boolean;
}

export interface Employee {
  id: number;
  code: string;
  name: string;
  department_id: number | null;
  active: boolean;
}

export interface Role {
  id: number;
  code: string;
  name: string;
}

export interface RolePermissions {
  role: string;
  permissions: string[];
}

export interface CreatedUser {
  id: number;
  username: string;
  employee_id: number | null;
  role_id: number;
  active: boolean;
}

export interface User {
  id: number;
  username: string;
  employee_id: number | null;
  role_code: string;
  active: boolean;
}

export interface AuditEntry {
  at: string;
  actor: string;
  action: string;
  entity_type: string;
  entity_ref: string | null;
  before: string | null;
  after: string | null;
  ip: string | null;
}

export interface SearchResult {
  kind: string;
  label: string;
  ref: string;
  page: 'dashboard' | 'tasks' | 'admin';
}

export interface SearchResponse {
  q: string;
  results: SearchResult[];
}