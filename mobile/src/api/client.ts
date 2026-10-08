import { API_BASE } from '../config';
import type {
  Activity,
  AttendanceRow,
  BuyList,
  CatalogProduct,
  CompanyNotice,
  DashboardEmployees,
  DashboardOverview,
  DepartmentStatus,
  DowntimeAnalytics,
  GuestVisit,
  Inspection,
  InspectionKind,
  LeaveBalanceItem,
  LeaveRequest,
  LedgerRow,
  LoginResponse,
  Machine,
  MachineStatus,
  MachineSummary,
  MaterialRequest,
  MaterialRequestCreateBody,
  Ncr,
  NcrStatus,
  Notification,
  PoReceiptLine,
  PoReceiveResult,
  ProductionOrder,
  PurchaseOrder,
  PurchaseRequisition,
  QualitySummary,
  Quote,
  Roster,
  SearchResponse,
  StockBalance,
  StockResponse,
  Task,
  TaskStatus,
  UserProfile,
  Visit,
  VisitCloseBody,
  VisitCreateBody,
  VisitStatus,
  VisitSummary,
} from './types';

/** Stable error codes from backend/app/errors.py (AGENT.md §6). */
export type ApiErrorCode =
  | 'VALIDATION'
  | 'UNAUTH'
  | 'DENIED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'SERVER'
  | 'UNAVAILABLE'
  | 'NETWORK'
  | 'TIMEOUT';

const STATUS_CODE_MAP: Record<number, ApiErrorCode> = {
  0: 'NETWORK',
  400: 'VALIDATION',
  401: 'UNAUTH',
  403: 'DENIED',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'VALIDATION',
  429: 'RATE_LIMITED',
  500: 'SERVER',
  503: 'UNAVAILABLE',
};

export class ApiError extends Error {
  status: number;
  code: ApiErrorCode;
  requiredPermission?: string;
  current?: unknown;
  retryable: boolean;

  constructor(
    status: number,
    message: string,
    options: { code?: string; requiredPermission?: string; current?: unknown; retryable?: boolean } = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = (options.code as ApiErrorCode) ?? STATUS_CODE_MAP[status] ?? 'SERVER';
    this.requiredPermission = options.requiredPermission;
    this.current = options.current;
    this.retryable = options.retryable ?? false;
  }
}

const REQUEST_TIMEOUT_MS = 8000;

async function fetchWithTimeout(path: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`${API_BASE}${path}`, { ...init, signal: controller.signal });
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new ApiError(0, `Server timed out at ${API_BASE}`, { code: 'TIMEOUT' });
    }
    throw new ApiError(0, `Cannot reach the server at ${API_BASE}`, { code: 'NETWORK' });
  } finally {
    clearTimeout(timer);
  }
}

let accessToken: string | null = null;
let refreshToken: string | null = null;
let onUnauthorized: (() => void) | null = null;
let onTokensRefreshed: ((access: string, refresh: string) => void) | null = null;
let refreshInFlight: Promise<boolean> | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function setRefreshToken(token: string | null): void {
  refreshToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

/** Registered by AuthProvider so any 401 drops the session exactly once. */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

/** Registered by AuthProvider so a refreshed access token reaches SecureStore. */
export function setTokenRefreshHandler(
  handler: ((access: string, refresh: string) => void) | null,
): void {
  onTokensRefreshed = handler;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Dependency-free base64 decode (Hermes has no atob on every platform). */
function base64Decode(input: string): string {
  const clean = input.replace(/-/g, '+').replace(/_/g, '/');
  let bits = 0;
  let byte = 0;
  let out = '';
  for (const ch of clean) {
    const idx = B64.indexOf(ch);
    if (idx === -1) continue;
    byte = (byte << 6) | idx;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out += String.fromCharCode((byte >> bits) & 0xff);
    }
  }
  return out;
}

/** Seconds until the access token expires; Infinity when unknown. */
function secondsUntilExpiry(token: string): number {
  const parts = token.split('.');
  if (parts.length !== 3) return Infinity;
  try {
    const claims = JSON.parse(base64Decode(parts[1]));
    if (typeof claims?.exp !== 'number') return Infinity;
    return claims.exp - Math.floor(Date.now() / 1000);
  } catch {
    return Infinity;
  }
}

/**
 * Swap the 8 h access token for a fresh one using the 14 d refresh token
 * (backend `POST /auth/refresh`). Concurrent callers share one request, and a
 * failure is not retried, so a dead refresh token cannot loop.
 */
async function refreshAccessToken(): Promise<boolean> {
  if (!refreshToken) return false;
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetchWithTimeout('/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
        if (!res.ok) return false;
        const body = (await res.json()) as { access_token?: string };
        if (!body.access_token) return false;
        accessToken = body.access_token;
        onTokensRefreshed?.(body.access_token, refreshToken as string);
        return true;
      } catch {
        return false;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

type ErrorEnvelope = {
  detail?: string | Array<{ msg?: string }>;
  error?: {
    code?: string;
    message?: string;
    required_permission?: string;
    current?: unknown;
    retryable?: boolean;
  };
};

/**
 * Read the standard API error envelope (AGENT.md §6) with graceful fallback
 * to the legacy `{detail}` string shape used by older endpoints.
 */
async function parseError(res: Response): Promise<ApiError> {
  let body: ErrorEnvelope | undefined;
  try {
    body = (await res.json()) as ErrorEnvelope;
  } catch {
    body = undefined;
  }
  const message =
    typeof body?.error?.message === 'string' && body.error.message
      ? body.error.message
      : typeof body?.detail === 'string'
        ? body.detail
        : Array.isArray(body?.detail) && body.detail[0]?.msg
          ? body.detail[0].msg
          : res.statusText || `HTTP ${res.status}`;
  return new ApiError(res.status, message, {
    code: body?.error?.code,
    requiredPermission: body?.error?.required_permission,
    current: body?.error?.current,
    retryable: body?.error?.retryable,
  });
}

/** Refresh this far ahead of the real expiry so a request never races the clock. */
const REFRESH_LEEWAY_SECONDS = 120;

async function request<T>(path: string, init: RequestInit = {}, isRetry = false): Promise<T> {
  // Proactive: renew before the token dies rather than after a 401.
  if (!isRetry && accessToken && secondsUntilExpiry(accessToken) <= REFRESH_LEEWAY_SECONDS) {
    await refreshAccessToken();
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  };
  if (init.body) headers['Content-Type'] = 'application/json';
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const res: Response = await fetchWithTimeout(path, { ...init, headers });

  // Reactive fallback for a token revoked server-side before its exp.
  if (res.status === 401 && !isRetry && refreshToken) {
    if (await refreshAccessToken()) return request<T>(path, init, true);
  }

  if (!res.ok) {
    if (res.status === 401 && onUnauthorized) onUnauthorized();
    throw await parseError(res);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  async login(username: string, password: string): Promise<LoginResponse> {
    const body = new URLSearchParams({ username, password, grant_type: 'password' });
    const res = await fetchWithTimeout('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!res.ok) throw await parseError(res);
    return (await res.json()) as LoginResponse;
  },

  /** Exposed for tests/debug; `request()` already refreshes transparently. */
  refresh: () => refreshAccessToken(),

  /**
   * Guarantee a usable access token, refreshing from the stored refresh token
   * when the access one is missing or within the expiry leeway.
   */
  async ensureAccessToken(): Promise<boolean> {
    if (accessToken && secondsUntilExpiry(accessToken) > REFRESH_LEEWAY_SECONDS) return true;
    return refreshAccessToken();
  },

  me: () => request<UserProfile>('/auth/me'),

  dashboardOverview: () => request<DashboardOverview>('/dashboard/overview'),
  dashboardDepartments: () => request<DepartmentStatus[]>('/dashboard/departments'),
  dashboardActivities: () => request<Activity[]>('/dashboard/activities'),
  dashboardEmployees: () => request<DashboardEmployees>('/dashboard/employees'),

  myTasks: () => request<Task[]>('/tasks/my'),

  setTaskStatus: (id: number, status: TaskStatus) =>
    request<Task>(`/tasks/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) }),

  notifications: (unreadOnly = false) =>
    request<Notification[]>(`/notifications/my?unread_only=${unreadOnly}`),

  unreadCount: () => request<{ unread: number }>('/notifications/unread-count'),

  markRead: (id: number) =>
    request<{ ok: boolean }>(`/notifications/${id}/read`, { method: 'POST' }),

  // ── HR common app ────────────────────────────────────────────────────────
  attendanceToday: () => request<AttendanceRow>('/attendance/today'),
  attendanceMe: () => request<AttendanceRow[]>('/attendance/me'),
  attendanceRoster: (date?: string) =>
    request<Roster>(`/attendance/roster${date ? `?for_date=${date}` : ''}`),
  attendanceCheckIn: () => request<AttendanceRow>('/attendance/check-in', { method: 'POST' }),
  attendanceCheckOut: () => request<AttendanceRow>('/attendance/check-out', { method: 'POST' }),

  leaveBalances: () => request<{ year: number; items: LeaveBalanceItem[] }>('/leave/balances'),
  leaveMy: () => request<LeaveRequest[]>('/leave/me'),
  leaveApprovals: () => request<LeaveRequest[]>('/leave/approvals'),
  leaveApply: (body: { leave_type: string; from_date: string; to_date: string; reason?: string }) =>
    request<LeaveRequest>('/leave/apply', { method: 'POST', body: JSON.stringify(body) }),
  leaveApprove: (id: number, note = '') =>
    request<LeaveRequest>(`/leave/${id}/approve`, { method: 'POST', body: JSON.stringify({ note }) }),
  leaveReject: (id: number, note = '') =>
    request<LeaveRequest>(`/leave/${id}/reject`, { method: 'POST', body: JSON.stringify({ note }) }),

  guests: (status?: string) => request<GuestVisit[]>(`/guests${status ? `?status_filter=${status}` : ''}`),
  guestRegister: (body: {
    visitor_name: string;
    phone?: string;
    purpose?: string;
    host_name?: string;
    department_name?: string;
    vehicle_no?: string;
  }) => request<GuestVisit>('/guests', { method: 'POST', body: JSON.stringify(body) }),
  guestAdmit: (id: number) => request<GuestVisit>(`/guests/${id}/admit`, { method: 'POST' }),
  guestCheckout: (id: number) => request<GuestVisit>(`/guests/${id}/checkout`, { method: 'POST' }),

  notices: () => request<CompanyNotice[]>('/announcements'),
  postNotice: (body: { title: string; body: string }) =>
    request<CompanyNotice>('/announcements', { method: 'POST', body: JSON.stringify(body) }),

  // ── Department modules ───────────────────────────────────────────────────
  catalogProducts: (q = '', category = '') => {
    const qs = new URLSearchParams();
    if (q) qs.set('q', q);
    if (category) qs.set('category', category);
    const s = qs.toString();
    return request<{ items: CatalogProduct[]; total: number }>(`/catalog/products${s ? `?${s}` : ''}`);
  },
  catalogCategories: () => request<{ items: string[]; total: number }>('/catalog/categories'),

  inventoryStock: () => request<StockResponse>('/inventory/stock'),
  inventoryLedger: (itemId?: number, limit = 100) =>
    request<{ items: LedgerRow[] }>(
      `/inventory/ledger${itemId ? `?item_id=${itemId}` : `?limit=${limit}`}`,
    ),
  inventoryMovement: (body: {
    qty_delta: number;
    item_id?: number;
    item_code?: string;
    note?: string;
    trans_type?: string;
  }) =>
    request<{ ok: boolean; item_id: number; on_hand: number }>('/inventory/movement', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  buyList: (product_id: number, qty: number) =>
    request<BuyList>('/procurement/buy-list', { method: 'POST', body: JSON.stringify({ product_id, qty }) }),
  purchaseOrders: () => request<{ items: PurchaseOrder[] }>('/procurement/purchase-orders'),
  purchaseOrder: (id: number) => request<PurchaseOrder>(`/procurement/purchase-orders/${id}`),
  createPurchaseOrder: (body: {
    supplier_id: number;
    lines: { item_id: number; qty: number; unit_price?: number | null }[];
    note?: string;
  }) =>
    request<PurchaseOrder>('/procurement/purchase-orders', { method: 'POST', body: JSON.stringify(body) }),
  issuePurchaseOrder: (id: number) => request<PurchaseOrder>(`/procurement/purchase-orders/${id}/issue`, { method: 'POST' }),
  receivePurchaseOrder: (id: number, lines: PoReceiptLine[]) =>
    request<PoReceiveResult>(`/procurement/purchase-orders/${id}/receive`, {
      method: 'POST',
      body: JSON.stringify({ lines }),
    }),
  cancelPurchaseOrder: (id: number) =>
    request<{ ok: boolean; status: string }>(`/procurement/purchase-orders/${id}/cancel`, { method: 'POST' }),

  // Purchase Requisitions
  purchaseRequisitions: (status?: string) => {
    const qs = new URLSearchParams();
    if (status) qs.set('status', status);
    const s = qs.toString();
    return request<{ items: PurchaseRequisition[] }>(`/procurement/purchase-requisitions${s ? `?${s}` : ''}`);
  },
  purchaseRequisition: (id: number) =>
    request<PurchaseRequisition>(`/procurement/purchase-requisitions/${id}`),
  submitPurchaseRequisition: (id: number, note = '') =>
    request<PurchaseRequisition>(`/procurement/purchase-requisitions/${id}/submit`, {
      method: 'POST',
      body: JSON.stringify({ note }),
    }),
  approvePurchaseRequisition: (id: number, note = '') =>
    request<PurchaseRequisition>(`/procurement/purchase-requisitions/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ note }),
    }),
  createPoFromPr: (id: number, body: any) =>
    request<PurchaseOrder>(`/procurement/purchase-requisitions/${id}/create-po`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  productionOrders: () => request<{ items: ProductionOrder[] }>('/production/orders'),
  createProductionOrder: (body: { product_id: number; qty: number; due_date?: string }) =>
    request<ProductionOrder>('/production/orders', { method: 'POST', body: JSON.stringify(body) }),
  releaseProductionOrder: (id: number) =>
    request<{ ok: boolean; status: string }>(`/production/orders/${id}/release`, { method: 'POST' }),
  issueProductionMaterial: (id: number) =>
    request<{ ok: boolean; issued: unknown[] }>(`/production/orders/${id}/issue-material`, { method: 'POST' }),
  setProductionStatus: (id: number, status: string) =>
    request<{ ok: boolean; status: string }>(`/production/orders/${id}/status`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    }),
  productionTransitions: (id: number) =>
    request<{ current: string; allowed: string[] }>(`/production/orders/${id}/transitions`),

  quotes: () => request<{ items: Quote[] }>('/quotes'),
  createQuote: (body: {
    product_id: number;
    qty: number;
    customer_name: string;
    customer_phone?: string;
    unit_price?: number | null;
    notes?: string;
  }) => request<Quote>('/quotes', { method: 'POST', body: JSON.stringify(body) }),
  confirmQuote: (id: number) =>
    request<{ quote_id: number; order_no: string; order_id: number }>(`/quotes/${id}/confirm`, {
      method: 'POST',
    }),

  // ── COMMON · visits (any employee may raise one) ──────────────────────
  visits: (params: { status?: string; visit_type?: string; scope?: 'open' | 'mine' | 'all' } = {}) => {
    const qs = new URLSearchParams();
    if (params.status) qs.set('status_filter', params.status);
    if (params.visit_type) qs.set('visit_type', params.visit_type);
    if (params.scope) qs.set('scope', params.scope);
    const s = qs.toString();
    return request<Visit[]>(`/visits${s ? `?${s}` : ''}`);
  },

  visitSummary: () => request<VisitSummary>('/visits/summary'),

  visit: (id: number) => request<Visit>(`/visits/${id}`),

  createVisit: (body: VisitCreateBody) =>
    request<Visit>('/visits', { method: 'POST', body: JSON.stringify(body) }),

  /** `to` must be one of the visit's `valid_transitions`; the API rejects anything else. */
  moveVisit: (id: number, to: VisitStatus, note = '') =>
    request<Visit>(`/visits/${id}/status`, { method: 'POST', body: JSON.stringify({ status: to, note }) }),

  addVisitNote: (id: number, body: string) =>
    request<{ id: number; body: string; created_at: string }>(`/visits/${id}/notes`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    }),

  closeVisit: (id: number, body: VisitCloseBody) =>
    request<Visit>(`/visits/${id}/close`, { method: 'POST', body: JSON.stringify(body) }),

  /** Buyer/visitor tracking. 403 without the `BuyerTracking` module. */
  buyerTracking: () => request<Visit[]>('/visits/buyers/tracking'),

  pingVisitLocation: (
    id: number,
    body: { latitude?: number | null; longitude?: number | null; note?: string; eta_minutes?: number | null },
  ) =>
    request<Visit>(`/visits/${id}/location`, { method: 'POST', body: JSON.stringify(body) }),

  // ── QUALITY · inspections + NCR ───────────────────────────────────────
  qualitySummary: () => request<QualitySummary>('/quality/summary'),

  inspections: (params: { kind?: InspectionKind; result?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.kind) qs.set('kind', params.kind);
    if (params.result) qs.set('result', params.result);
    const s = qs.toString();
    return request<Inspection[]>(`/quality/inspections${s ? `?${s}` : ''}`);
  },

  createInspection: (body: {
    kind: InspectionKind;
    ref_type?: string;
    ref_no?: string;
    product_name?: string;
    serial_no?: string;
    qty?: number;
    severity?: 'minor' | 'major' | 'critical';
  }) => request<Inspection>('/quality/inspections', { method: 'POST', body: JSON.stringify(body) }),

  submitInspection: (
    id: number,
    body: {
      result: 'pass' | 'fail' | 'rework';
      checklist: { key: string; result: 'pass' | 'fail' | 'na'; remark?: string }[];
      remarks?: string;
      ncr_title?: string;
      ncr_issue?: string;
      assigned_to?: number | null;
      department_id?: number | null;
      due_date?: string | null;
    },
  ) => request<Inspection>(`/quality/inspections/${id}/submit`, { method: 'POST', body: JSON.stringify(body) }),

  ncrs: (params: { status?: NcrStatus; mine?: boolean } = {}) => {
    const qs = new URLSearchParams();
    if (params.status) qs.set('status_filter', params.status);
    if (params.mine) qs.set('mine', 'true');
    const s = qs.toString();
    return request<Ncr[]>(`/quality/ncrs${s ? `?${s}` : ''}`);
  },

  ncr: (id: number) => request<Ncr>(`/quality/ncrs/${id}`),

  advanceNcr: (
    id: number,
    body: { status: NcrStatus; root_cause?: string; corrective_action?: string; preventive_action?: string; verification?: string },
  ) => request<Ncr>(`/quality/ncrs/${id}/stage`, { method: 'POST', body: JSON.stringify(body) }),

  // ── MACHINES · machine shop ───────────────────────────────────────────
  machines: (workCenter?: string) =>
    request<Machine[]>(`/machines${workCenter ? `?work_center=${encodeURIComponent(workCenter)}` : ''}`),

  workCenters: () => request<string[]>('/machines/work-centers'),

  machineSummary: () => request<MachineSummary>('/machines/summary'),

  downtimeAnalytics: (days = 30) => request<DowntimeAnalytics>(`/machines/downtime?days=${days}`),

  setMachineStatus: (id: number, status: MachineStatus, note = '') =>
    request<Machine>(`/machines/${id}/status`, { method: 'POST', body: JSON.stringify({ status, note }) }),

  assignMachineJob: (
    id: number,
    body: { job_ref: string; part_no?: string; operator_name?: string; est_minutes?: number | null },
  ) => request<Machine>(`/machines/${id}/job`, { method: 'POST', body: JSON.stringify(body) }),

  reportDowntime: (id: number, reason: string, note = '') =>
    request<Machine>(`/machines/${id}/downtime`, { method: 'POST', body: JSON.stringify({ reason, note }) }),

  resolveDowntime: (stopId: number, body: { resolution: string; minutes?: number | null; restart_job?: boolean }) =>
    request<Machine>(`/machines/downtime/${stopId}/resolve`, { method: 'POST', body: JSON.stringify(body) }),

  // ── STORES · material requests (Production → Stores) ───────────────────
  materialRequests: () => request<MaterialRequest[]>('/stores/material-requests'),

  createMaterialRequest: (body: MaterialRequestCreateBody) =>
    request<MaterialRequest>('/stores/material-requests', { method: 'POST', body: JSON.stringify(body) }),

  fulfilMaterialRequest: (id: number, warehouse = 'MAIN') =>
    request<MaterialRequest>(`/stores/material-requests/${id}/fulfil`, {
      method: 'POST',
      body: JSON.stringify({ warehouse }),
    }),

  cancelMaterialRequest: (id: number) =>
    request<MaterialRequest>(`/stores/material-requests/${id}/cancel`, { method: 'POST' }),

  /** Free-text item search. Requires `Inventory:view`, so this is stores-side only. */
  stockSearch: (q: string) => request<StockBalance[]>(`/stores/stock?q=${encodeURIComponent(q)}`),

  search: (query: string) => {
    const q = new URLSearchParams({ q: query });
    return request<SearchResponse>(`/search?${q.toString()}`);
  },
};
