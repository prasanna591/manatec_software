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

export interface DashboardOverview {
  kpis: DashboardKpis;
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

// ── HR common app (attendance / leave / guests / notices) ────────────────

export interface AttendanceRow {
  id: number;
  work_date: string;
  check_in: string | null;
  check_out: string | null;
  minutes: number | null;
  status: 'absent' | 'present' | 'checked_out';
}

export interface RosterRow {
  employee_id: number;
  code: string;
  name: string;
  attendance: AttendanceRow | null;
}

export interface Roster {
  dept: string | null;
  date: string;
  rows: RosterRow[];
}

export type LeaveStatus = 'pending_dept' | 'pending_hr' | 'approved' | 'rejected' | 'cancelled';

export interface LeaveBalanceItem {
  leave_type: 'casual' | 'sick' | 'earned' | 'other';
  allocated: number;
  used: number;
  available: number;
}

export interface LeaveRequest {
  id: number;
  employee_name: string | null;
  department_id: number | null;
  leave_type: string;
  from_date: string;
  to_date: string;
  days: number;
  reason: string;
  status: LeaveStatus;
  status_label: string;
  created_at: string;
}

export type GuestStatus = 'pending' | 'admitted' | 'checked_out' | 'cancelled';

export interface GuestVisit {
  id: number;
  visit_no: string;
  visitor_name: string;
  phone: string;
  purpose: string;
  host_name: string;
  department_name: string;
  vehicle_no: string;
  check_in: string;
  check_out: string | null;
  status: GuestStatus;
  status_label: string;
  created_by: number | null;
}

export interface CompanyNotice {
  id: number;
  title: string;
  body: string;
  created_at: string;
}

// ── Department modules (reuse web API shapes) ─────────────────────────────

export interface CatalogProduct {
  id: number;
  name: string;
  model_code: string;
  category: string;
  price_raw: string;
  price_value: number;
  image_url: string;
}

export interface StockRow {
  item_id: number;
  code: string;
  description: string;
  on_hand: number;
  uom: string;
  category: string;
  min_qty: number;
  in_transit: number;
  committed: number;
  available: number;
  unit_cost: number;
  stock_value: number;
  below_min: boolean;
}

export interface StockAlert {
  item_id: number;
  code: string;
  description: string;
  on_hand: number;
  min_qty: number;
  short: number;
}

export interface StockResponse {
  items: StockRow[];
  alerts: { count: number; items: StockAlert[] };
}

export interface LedgerRow {
  id: number;
  trans_type: string;
  qty_delta: number;
  note: string;
  created_at: string | null;
}

export interface BuyListRow {
  item_id: number;
  code: string;
  description: string;
  qty_short: number;
  unit_cost: number;
  supplier_name: string;
  lead_days_min: number;
  lead_days_max: number;
}

export interface BuyList {
  product_id: number;
  product_name: string;
  target_qty: number;
  rows: BuyListRow[];
  total_value: number;
  max_lead_days: number;
  ok_for_target: boolean;
}

export interface PurchaseOrder {
  id: number;
  po_no: string;
  supplier_name: string;
  status: string;
  expected_delivery_date: string | null;
  total_value: number;
  overdue: boolean;
}

export interface ProductionOrder {
  id: number;
  order_no: string;
  product_name: string;
  qty: number;
  due_date: string | null;
  status: string;
  source_quote_no?: string | null;
  created_at?: string | null;
}

export interface QuoteAvailability {
  buildable_now: number;
  buildable_from_stock: boolean;
  max_lead_days: number;
  shortage_value: number;
}

export interface Quote {
  id: number;
  quote_no: string;
  customer_name: string;
  customer_phone: string;
  product_id: number;
  product_name: string;
  qty: number;
  unit_price: number;
  total_value: number;
  promised_date: string | null;
  status: string;
  notes?: string;
  created_at?: string;
  availability?: QuoteAvailability;
}
