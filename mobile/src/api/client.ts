import { API_BASE } from '../config';
import type {
  AttendanceRow,
  BuyList,
  CatalogProduct,
  CompanyNotice,
  DashboardOverview,
  GuestVisit,
  LeaveBalanceItem,
  LeaveRequest,
  LedgerRow,
  LoginResponse,
  Notification,
  ProductionOrder,
  PurchaseOrder,
  Quote,
  Roster,
  StockResponse,
  Task,
  TaskStatus,
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

const REQUEST_TIMEOUT_MS = 8000;

async function fetchWithTimeout(path: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`${API_BASE}${path}`, { ...init, signal: controller.signal });
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new ApiError(0, `Server timed out at ${API_BASE}`);
    }
    throw new ApiError(0, `Cannot reach the server at ${API_BASE}`);
  } finally {
    clearTimeout(timer);
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
  if (init.body) headers['Content-Type'] = 'application/json';
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  let res: Response = await fetchWithTimeout(path, init);
  if (!res.ok) throw new ApiError(res.status, await parseError(res));
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
    if (!res.ok) throw new ApiError(res.status, await parseError(res));
    return (await res.json()) as LoginResponse;
  },

  me: () => request<UserProfile>('/auth/me'),

  dashboardOverview: () => request<DashboardOverview>('/dashboard/overview'),

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
  guestRegister: (body: Record<string, string>) =>
    request<GuestVisit>('/guests', { method: 'POST', body: JSON.stringify(body) }),
  guestAdmit: (id: number) => request<GuestVisit>(`/guests/${id}/admit`, { method: 'POST' }),
  guestCheckout: (id: number) => request<GuestVisit>(`/guests/${id}/checkout`, { method: 'POST' }),

  notices: () => request<CompanyNotice[]>('/announcements'),

  // ── Department modules ───────────────────────────────────────────────────
  catalogProducts: (q = '') => request<{ items: CatalogProduct[]; total: number }>(`/catalog/products?q=${encodeURIComponent(q)}`),
  inventoryStock: () => request<StockResponse>('/inventory/stock'),
  inventoryLedger: () => request<{ items: LedgerRow[] }>('/inventory/ledger'),
  inventoryMovement: (body: { qty_delta: number; item_code: string; note?: string; trans_type?: string }) =>
    request<{ ok: boolean; on_hand: number }>('/inventory/movement', { method: 'POST', body: JSON.stringify(body) }),

  buyList: (product_id: number, qty: number) =>
    request<BuyList>('/procurement/buy-list', { method: 'POST', body: JSON.stringify({ product_id, qty }) }),
  purchaseOrders: () => request<{ items: PurchaseOrder[] }>('/procurement/purchase-orders'),
  issuePurchaseOrder: (id: number) => request<PurchaseOrder>(`/procurement/purchase-orders/${id}/issue`, { method: 'POST' }),
  cancelPurchaseOrder: (id: number) => request<{ ok: boolean }>(`/procurement/purchase-orders/${id}/cancel`, { method: 'POST' }),

  productionOrders: () => request<{ items: ProductionOrder[] }>('/production/orders'),
  releaseProductionOrder: (id: number) => request<{ ok: boolean }>(`/production/orders/${id}/release`, { method: 'POST' }),
  issueProductionMaterial: (id: number) => request<{ ok: boolean }>(`/production/orders/${id}/issue-material`, { method: 'POST' }),
  setProductionStatus: (id: number, status: string) =>
    request<{ ok: boolean }>(`/production/orders/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) }),

  quotes: () => request<{ items: Quote[] }>('/quotes'),
  createQuote: (body: {
    product_id: number;
    qty: number;
    customer_name: string;
    customer_phone?: string;
    unit_price?: number;
    notes?: string;
  }) => request<Quote>('/quotes', { method: 'POST', body: JSON.stringify(body) }),
  confirmQuote: (id: number) =>
    request<{ ok: boolean; order_no: string }>(`/quotes/${id}/confirm`, { method: 'POST' }),
};
