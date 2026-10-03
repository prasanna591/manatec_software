import { API_BASE } from '../config';
import type {
  Activity,
  AnalyzerReport,
  AtpResult,
  AuditEntry,
  BomMeta,
  BomProduct,
  BomTreeNode,
  BuyList,
  CatalogItem,
  CatalogProduct,
  CreatedUser,
  DashboardKpis,
  Department,
  DepartmentStatus,
  Employee,
  InventoryLedgerRow,
  LoginResponse,
  Notification,
  ProductionOrder,
  PurchaseOrder,
  Quote,
  Role,
  RolePermissions,
  SearchResponse,
  StockAlert,
  StockRow,
  Supplier,
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

async function requestBlob(path: string, init: RequestInit = {}): Promise<Blob> {
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
  };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, `Cannot reach the server at ${API_BASE}`);
  }
  if (!res.ok) throw new ApiError(res.status, await parseError(res));
  return await res.blob();
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

  // ── Manufacturing spine ────────────────────────────────────────────
  catalogProducts: (q = '', category = '') => {
    const qs = new URLSearchParams();
    if (q) qs.set('q', q);
    if (category) qs.set('category', category);
    const s = qs.toString();
    return request<{ items: CatalogProduct[]; total: number }>(`/catalog/products${s ? `?${s}` : ''}`);
  },
  catalogCategories: () => request<{ items: string[]; total: number }>('/catalog/categories'),
  catalogFamilies: () => request<{ items: { id: number; name: string }[]; total: number }>('/catalog/families'),
  catalogItems: (q = '') =>
    request<{ items: CatalogItem[]; total: number }>(`/catalog/items${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  catalogSuppliers: () => request<{ items: Supplier[]; total: number }>('/catalog/suppliers'),
  createItem: (body: Record<string, unknown>) =>
    request<CatalogItem>('/catalog/items', { method: 'POST', body: JSON.stringify(body) }),
  createSupplier: (body: { name: string; contact?: string; lead_time_days_default?: number; rating?: number }) =>
    request<{ id: number; name: string }>('/catalog/suppliers', { method: 'POST', body: JSON.stringify(body) }),

  inventoryStock: () => request<{ items: StockRow[]; alerts: { count: number; items: StockAlert[] } }>('/inventory/stock'),
  inventoryLedger: (itemId?: number, limit = 100) =>
    request<{ items: InventoryLedgerRow[] }>(
      `/inventory/ledger${itemId ? `?item_id=${itemId}` : `?limit=${limit}`}`,
    ),
  inventoryMovement: (body: { qty_delta: number; item_id?: number; item_code?: string; note?: string; trans_type?: string }) =>
    request<{ ok: boolean; item_id: number; on_hand: number }>('/inventory/movement', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  atpBuildable: () =>
    request<{ products: AtpResult[]; ok: number; blocked: number; no_bom: number; total: number }>(
      '/atp/buildable',
    ),
  atpWhatIf: (product_id: number, qty: number) =>
    request<AtpResult>('/atp/what-if', { method: 'POST', body: JSON.stringify({ product_id, qty }) }),
  bomProducts: () => request<{ items: BomProduct[]; ok: number; blocked: number; total: number }>('/bom/products'),
  bomDetail: (productId: number) =>
    request<{ meta: BomMeta; tree: BomTreeNode[]; atp: AtpResult }>(`/bom/products/${productId}`),
  bomExplode: (productId: number) =>
    request<{ items: { item_id: number; code: string; description: string; qty_per_unit: number }[] }>(
      `/bom/products/${productId}/explode`,
    ),
  bomSetLine: (productId: number, body: { item_id: number; qty: number; scrap_pct?: number }) =>
    request<{ ok: boolean; line_id: number }>(`/bom/products/${productId}/lines`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  bomDeleteLine: (lineId: number) => request<{ ok: boolean }>(`/bom/lines/${lineId}`, { method: 'DELETE' }),
  bomNewRevision: (productId: number, name = '') =>
    request<{ ok: boolean; header_id: number; rev_no: number }>(`/bom/products/${productId}/revisions`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  bomActivateRevision: (headerId: number) =>
    request<{ ok: boolean; rev_no: number }>(`/bom/revisions/${headerId}/activate`, { method: 'POST' }),

  buyList: (product_id: number, qty: number) =>
    request<BuyList>('/procurement/buy-list', { method: 'POST', body: JSON.stringify({ product_id, qty }) }),
  purchaseOrders: () => request<{ items: PurchaseOrder[] }>('/procurement/purchase-orders'),
  purchaseOrder: (id: number) => request<PurchaseOrder>(`/procurement/purchase-orders/${id}`),
  createPurchaseOrder: (body: { supplier_id: number; lines: { item_id: number; qty: number; unit_price?: number | null }[]; note?: string }) =>
    request<PurchaseOrder>('/procurement/purchase-orders', { method: 'POST', body: JSON.stringify(body) }),
  issuePurchaseOrder: (id: number) => request<PurchaseOrder>(`/procurement/purchase-orders/${id}/issue`, { method: 'POST' }),
  receivePurchaseOrder: (id: number, lines: { line_id: number; qty: number }[]) =>
    request<{ ok: boolean; result: { received: unknown[]; status: string } }>(`/procurement/purchase-orders/${id}/receive`, {
      method: 'POST',
      body: JSON.stringify({ lines }),
    }),
  cancelPurchaseOrder: (id: number) => request<{ ok: boolean; status: string }>(`/procurement/purchase-orders/${id}/cancel`, { method: 'POST' }),

  productionOrders: () => request<{ items: ProductionOrder[] }>('/production/orders'),
  createProductionOrder: (body: { product_id: number; qty: number; due_date?: string }) =>
    request<ProductionOrder>('/production/orders', { method: 'POST', body: JSON.stringify(body) }),
  releaseProductionOrder: (id: number) => request<{ ok: boolean; status: string }>(`/production/orders/${id}/release`, { method: 'POST' }),
  issueProductionMaterial: (id: number) =>
    request<{ ok: boolean; issued: unknown[] }>(`/production/orders/${id}/issue-material`, { method: 'POST' }),
  setProductionStatus: (id: number, status: string) =>
    request<{ ok: boolean; status: string }>(`/production/orders/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) }),

  quotes: () => request<{ items: Quote[] }>('/quotes'),
  createQuote: (body: { product_id: number; qty: number; customer_name?: string; customer_phone?: string; unit_price?: number | null; notes?: string }) =>
    request<Quote>('/quotes', { method: 'POST', body: JSON.stringify(body) }),
  confirmQuote: (id: number) => request<{ ok: boolean; quote_id: number; order_no: string; order_id: number }>(`/quotes/${id}/confirm`, { method: 'POST' }),

  analyzeBom: async (inventory: File, master: File, overrides: Record<string, string> = {}) => {
    const fd = new FormData();
    fd.append('inventory', inventory);
    fd.append('master', master);
    for (const [k, v] of Object.entries(overrides)) if (v) fd.append(k, v);
    return request<AnalyzerReport>('/analyzer/analyze', { method: 'POST', body: fd });
  },
  analyzeExport: (products: AnalyzerReport['products'], format: 'xlsx' | 'csv'): Promise<Blob> =>
    requestBlob('/analyzer/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ products, format }),
    }),
};