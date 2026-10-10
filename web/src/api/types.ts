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

/** A device/session row from `GET /auth/sessions` (AGENT.md §3). */
export interface SessionInfo {
  id: number;
  device: string | null;
  user_agent: string | null;
  ip: string | null;
  created_at: string;
  last_used_at: string | null;
  expires_at: string;
  active: boolean;
  revoked_at: string | null;
  revoked_reason: string | null;
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

export interface EmployeeDashboardStats {
  total: number;
  by_department: { dept_code: string; dept_name: string; count: number }[];
  by_role: { role_code: string; role_name: string; count: number }[];
  trend: { month: string; headcount: number }[];
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

export type EmployeeImportStatus = 'created' | 'updated' | 'failed';

export interface EmployeeImportRow {
  row: number;
  employee_code: string;
  status: EmployeeImportStatus;
  detail: string;
  /** Present only when the row also provisioned a mobile login. */
  username?: string;
  password?: string;
  role_code?: string;
}

export interface EmployeeImportResult {
  ok: boolean;
  rows: number;
  employees_created: number;
  employees_updated: number;
  accounts_created: number;
  failed: number;
  /** Credentials are returned exactly once -- the server never stores them in clear. */
  accounts: EmployeeImportRow[];
  results: EmployeeImportRow[];
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
  page:
    | 'dashboard'
    | 'tasks'
    | 'admin'
    | 'catalog'
    | 'inventory'
    | 'bom'
    | 'procurement'
    | 'production'
    | 'quotes';
}

export interface SearchResponse {
  q: string;
  results: SearchResult[];
}

// ── Manufacturing spine (ported from manatec) ──────────────────────────────

export interface CatalogProduct {
  id: number;
  name: string;
  model_code: string;
  category: string;
  family_id: number | null;
  family_name: string | null;
  slug: string;
  price_raw: string;
  price_value: number;
  status: string;
  image_url: string;
  url: string;
}

export interface CatalogItem {
  id: number;
  code: string;
  description: string;
  uom: string;
  category: string;
  source_class: string;
  lead_time_days_min: number;
  lead_time_days_max: number;
  min_qty: number;
  max_qty: number;
  default_supplier_id: number | null;
  default_supplier_name: string | null;
  is_assembly: boolean;
  on_hand?: number;
  in_transit?: number;
  committed?: number;
  available?: number;
}

export interface Supplier {
  id: number;
  name: string;
  contact: string;
  lead_time_days_default: number;
  rating: number;
  is_active: boolean;
}

export interface StockRow {
  item_id: number;
  code: string;
  description: string;
  uom: string;
  category: string;
  on_hand: number;
  in_transit: number;
  committed: number;
  available: number;
  min_qty: number;
  max_qty: number;
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

export interface InventoryLedgerRow {
  id: number;
  item_id: number;
  code: string;
  description: string;
  trans_type: string;
  qty_delta: number;
  note: string;
  created_at: string;
}

export interface AtpCoverage {
  item_id: number;
  code: string;
  description: string;
  need_per_unit: number;
  req_for_target: number;
  on_hand: number;
  in_transit: number;
  committed: number;
  avail: number;
  short: number;
  unit_cost: number;
  lead_days_min: number;
  lead_days_max: number;
  buildable_this_item: number;
  shared_with: string[];
}

export interface AtpResult {
  product_id: number;
  product_name: string;
  has_bom: boolean;
  buildable_now: number | null;
  limiting_item: string | null;
  limiting_item_id: number | null;
  coverage: AtpCoverage[];
  total_line_value: number;
  whatif_qty: number | null;
  shortage_value: number;
  max_lead_days: number;
  ok_for_target: boolean;
}

export interface BomProduct {
  product_id: number;
  product_name: string;
  has_bom: boolean;
  buildable_now: number | null;
  limiting_item: string | null;
  line_count: number;
  shortage_value: number;
}

export interface BomRev {
  id: number;
  rev_no: number;
  status: string;
  created_at: string | null;
  line_count: number;
}

export interface BomMeta {
  product_id: number;
  product_name: string;
  revs: BomRev[];
}

export interface BomTreeNode {
  item_id: number | null;
  code: string;
  description: string;
  qty: number;
  scrap_pct: number;
  is_assembly: boolean;
  children: BomTreeNode[];
}

export interface BuyListRow {
  item_id: number;
  code: string;
  description: string;
  category: string;
  qty_short: number;
  unit_cost: number;
  value: number;
  lead_days_min: number;
  lead_days_max: number;
  supplier_id: number | null;
  supplier_name: string;
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

export interface PoLineView {
  id: number;
  item_id: number;
  code: string;
  description: string;
  qty: number;
  unit_price: number;
  received_qty: number;
  remaining: number;
}

export interface PurchaseOrder {
  id: number;
  po_no: string;
  supplier_id: number;
  supplier_name: string;
  status: string;
  issue_date: string | null;
  expected_delivery_date: string | null;
  total_value: number;
  note: string;
  overdue: boolean;
  lines: PoLineView[];
}

export interface ProdOrderLineView {
  item_id: number;
  code: string;
  description: string;
  plan_qty: number;
  issued_qty: number;
  pending: number;
}

export interface ProductionOrder {
  id: number;
  order_no: string;
  product_id: number;
  product_name: string;
  qty: number;
  due_date: string | null;
  status: string;
  source_quote_no: string | null;
  created_at: string | null;
  lines: ProdOrderLineView[];
}

export interface Quote {
  id: number;
  quote_no: string;
  customer_name: string;
  customer_phone: string;
  product_id: number;
  product_name: string;
  image_url: string;
  qty: number;
  unit_price: number;
  total_value: number;
  promised_date: string | null;
  status: string;
  notes: string;
  created_at: string | null;
  availability: {
    buildable_now: number | null;
    buildable_from_stock: boolean;
    max_lead_days: number;
    shortage_value: number;
  };
}

export interface AnalyzerRow {
  item: string;
  in_bom: boolean;
  need: number;
  have: number;
  capacity: number | null;
  max_units: number;
  stock_after: number;
  shortage: number;
  status: 'OK' | 'SHORT' | 'EXTRA';
}

export interface AnalyzerProduct {
  name: string;
  max_units: number;
  status: 'OK' | 'BLOCKED';
  bom_item_count: number;
  missing_count: number;
  shortage_count: number;
  leftover_count: number;
  leftover_total: number;
  unused_count: number;
  unused_total: number;
  rows: AnalyzerRow[];
  catalog_image: string;
  catalog_category: string;
  catalog_price: string;
}

export interface AnalyzerReport {
  inventory_count: number;
  master_item_count: number;
  product_count: number;
  buildable: number;
  blocked: number;
  products: AnalyzerProduct[];
}