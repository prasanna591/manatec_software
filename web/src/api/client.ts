import { API_BASE } from '../config';
import type {
  Activity,
  AuditEntry,
  CreatedUser,
  DashboardKpis,
  Department,
  DepartmentStatus,
  Employee,
  LoginResponse,
  Notification,
  Role,
  RolePermissions,
  SearchResponse,
  Task,
  TaskStatus,
  User,
  UserProfile,
} from './types';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

async function parseError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body?.detail === 'string') return body.detail;
    if (Array.isArray(body?.detail)) return body.detail[0]?.msg ?? res.statusText;
  } catch {
    // non-JSON error body
  }
  return res.statusText || `HTTP ${res.status}`;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  };
  if (init.body && !(init.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, `Cannot reach the server at ${API_BASE}`);
  }
  if (!res.ok) throw new ApiError(res.status, await parseError(res));
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

interface LoadParams {
  entityType?: string;
  actor?: string;
  limit?: number;
}

export const api = {
  async login(username: string, password: string): Promise<LoginResponse> {
    const body = new URLSearchParams({ username, password, grant_type: 'password' });
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
    } catch {
      throw new ApiError(0, `Cannot reach the server at ${API_BASE}`);
    }
    if (!res.ok) throw new ApiError(res.status, await parseError(res));
    return (await res.json()) as LoginResponse;
  },

  me: () => request<UserProfile>('/auth/me'),

  dashboardOverview: () =>
    request<{ kpis: DashboardKpis }>('/dashboard/overview').then((r) => r.kpis),
  dashboardDepartments: () => request<DepartmentStatus[]>('/dashboard/departments'),
  dashboardActivities: () => request<Activity[]>('/dashboard/activities'),

  myTasks: () => request<Task[]>('/tasks/my'),
  allTasks: () => request<Task[]>('/tasks'),
  setTaskStatus: (id: number, status: TaskStatus) =>
    request<Task>(`/tasks/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) }),

  notifications: (unreadOnly = false) =>
    request<Notification[]>(`/notifications/my?unread_only=${unreadOnly}`),
  unreadCount: () => request<{ unread: number }>('/notifications/unread-count'),
  markRead: (id: number) => request<{ ok: boolean }>(`/notifications/${id}/read`, { method: 'POST' }),

  departments: () => request<Department[]>('/admin/departments'),
  createDepartment: (body: { code: string; name: string }) =>
    request<Department>('/admin/departments', { method: 'POST', body: JSON.stringify(body) }),
  employees: () => request<Employee[]>('/admin/employees'),
  createEmployee: (body: Record<string, unknown>) =>
    request<Employee>('/admin/employees', { method: 'POST', body: JSON.stringify(body) }),
  roles: () => request<Role[]>('/admin/roles'),
  users: () => request<User[]>('/admin/users'),
  rolePermissions: (code: string) => request<RolePermissions>(`/admin/roles/${code}/permissions`),
  createUser: (body: { username: string; password: string; employee_id: number | null; role_code: string }) =>
    request<CreatedUser>('/admin/users', { method: 'POST', body: JSON.stringify(body) }),

  audit: (params: LoadParams = {}) => {
    const q = new URLSearchParams();
    if (params.entityType) q.set('entity_type', params.entityType);
    if (params.actor) q.set('actor', params.actor);
    if (params.limit) q.set('limit', String(params.limit));
    const qs = q.toString();
    return request<AuditEntry[]>(`/audit${qs ? `?${qs}` : ''}`);
  },

  search: (query: string) => {
    const q = new URLSearchParams({ q: query });
    return request<SearchResponse>(`/search?${q.toString()}`);
  },

  updateDepartment: (id: number, body: Partial<Department>) =>
    request<Department>(`/admin/departments/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteDepartment: (id: number) =>
    request<{ ok: boolean }>(`/admin/departments/${id}`, { method: 'DELETE' }),

  updateEmployee: (id: number, body: Partial<Employee>) =>
    request<Employee>(`/admin/employees/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteEmployee: (id: number) =>
    request<{ ok: boolean }>(`/admin/employees/${id}`, { method: 'DELETE' }),

  updateUser: (id: number, body: { username?: string; password?: string; employee_id?: number | null; role_code?: string; active?: boolean }) =>
    request<CreatedUser>(`/admin/users/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteUser: (id: number) =>
    request<{ ok: boolean; active: boolean }>(`/admin/users/${id}`, { method: 'DELETE' }),
};