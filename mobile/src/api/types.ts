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
  id: number | null;
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
  employee_id: number;
  employee_name: string | null;
  department_id: number | null;
  leave_type: string;
  from_date: string;
  to_date: string;
  days: number;
  reason: string;
  status: LeaveStatus;
  status_label: string;
  decided_note: string | null;
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
  security_approved_at: string | null;
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
  family_id: number | null;
  family_name: string | null;
  slug: string;
  price_raw: string;
  price_value: number;
  status: string;
  image_url: string;
  url: string;
}

export interface StockRow {
  item_id: number;
  code: string;
  description: string;
  on_hand: number;
  uom: string;
  category: string;
  min_qty: number;
  max_qty: number;
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
  item_id: number;
  code: string;
  description: string;
  trans_type: string;
  qty_delta: number;
  note: string;
  created_at: string | null;
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

export interface PoLine {
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
  lines: PoLine[];
}

/** One line of a goods receipt against an issued PO. */
export interface PoReceiptLine {
  line_id: number;
  qty: number;
}

export interface PoReceiveResult {
  ok: boolean;
  result?: Record<string, unknown>;
}

export interface ProdOrderLine {
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
  lines: ProdOrderLine[];
  shortage_value?: number;
  fully_available?: boolean;
  valid_transitions?: string[];
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
  image_url: string;
  qty: number;
  unit_price: number;
  total_value: number;
  promised_date: string | null;
  status: string;
  notes: string;
  created_at: string | null;
  availability: QuoteAvailability;
}

// ── COMMON · VISITS ───────────────────────────────────────────────────────

export const VISIT_TYPES = [
  'supplier',
  'customer',
  'buyer',
  'vendor',
  'guest',
  'official',
  'other',
] as const;

export type VisitType = (typeof VISIT_TYPES)[number];

export const VISIT_STATUSES = [
  'created',
  'confirmed',
  'on_the_way',
  'arrived',
  'meeting',
  'follow_up',
  'completed',
  'cancelled',
] as const;

export type VisitStatus = (typeof VISIT_STATUSES)[number];

export const FOOD_OPTIONS = [
  'none',
  'refreshments',
  'lunch',
  'dinner',
  'full_meals',
  'veg_meals',
] as const;

export type FoodArrangement = (typeof FOOD_OPTIONS)[number];

/**
 * Last known position of an en-route visitor. The API sends `location: null`
 * for anyone without `BuyerTracking:view`, so a role that may see the visit
 * still cannot read where the visitor is.
 */
export interface VisitLocation {
  latitude: number | null;
  longitude: number | null;
  note: string;
  eta_minutes: number | null;
  updated_at: string | null;
}

export interface VisitNote {
  id: number;
  body: string;
  author: string;
  created_at: string;
}

export interface Visit {
  id: number;
  visit_no: string;
  visit_type: VisitType;
  visitor_name: string;
  company: string;
  contact: string;
  purpose: string;
  requirement: string;
  host_name: string;
  department_name: string;
  visit_date: string | null;
  expected_time: string;
  food_arrangement: FoodArrangement;
  transport_required: boolean;
  vehicle_no: string;
  location_note: string;
  attachments: { name: string; url?: string }[];
  status: VisitStatus;
  status_label: string;
  /** Transitions the API will accept right now — the UI renders exactly these. */
  next_states: VisitStatus[];
  /**
   * The visit is in a state that can be closed, so the outcome has to be
   * recorded. The API deliberately refuses a plain `completed` transition.
   */
  can_close: boolean;
  tracking_enabled: boolean;
  location: VisitLocation | null;
  outcome_requirement: boolean;
  outcome_sample: boolean;
  outcome_purchase: boolean;
  outcome_followup: boolean;
  next_action: string;
  followup_due: string | null;
  notes: string;
  created_at: string;
  confirmed_at: string | null;
  arrived_at: string | null;
  meeting_at: string | null;
  closed_at: string | null;
  is_mine: boolean;
  can_view_all: boolean;
  notes_log?: VisitNote[];
}

export interface VisitSummary {
  today: number;
  open: number;
  awaiting_confirmation: number;
  in_meeting: number;
  followups_due: number;
  on_the_way: number;
  by_type: Record<VisitType, number>;
}

export interface VisitCreateBody {
  visit_type: VisitType;
  visitor_name: string;
  company?: string;
  contact?: string;
  purpose?: string;
  requirement?: string;
  department_id?: number | null;
  visit_date?: string | null;
  expected_time?: string;
  food_arrangement?: FoodArrangement;
  transport_required?: boolean;
  vehicle_no?: string;
  location_note?: string;
  tracking_enabled?: boolean;
  notes?: string;
}

export interface VisitCloseBody {
  outcome_requirement: boolean;
  outcome_sample: boolean;
  outcome_purchase: boolean;
  outcome_followup: boolean;
  next_action: string;
  followup_due?: string | null;
  assign_to?: number | null;
  notes?: string;
}

// ── QUALITY · INSPECTION + NCR ────────────────────────────────────────────

export const INSPECTION_KINDS = ['incoming', 'in_process', 'final'] as const;
export type InspectionKind = (typeof INSPECTION_KINDS)[number];

export type CheckResult = 'pass' | 'fail' | 'na';

export interface ChecklistTemplate {
  key: string;
  label: string;
}

export interface ChecklistEntry extends ChecklistTemplate {
  result: CheckResult;
  remark: string;
}

export interface Inspection {
  id: number;
  insp_no: string;
  kind: InspectionKind;
  kind_label: string;
  ref_type: string;
  ref_no: string;
  product_name: string;
  serial_no: string;
  qty: number;
  result: 'pending' | 'pass' | 'fail' | 'rework';
  result_label: string;
  severity: 'minor' | 'major' | 'critical';
  checklist: ChecklistEntry[];
  /** Server-supplied items for this stage — never hardcoded in the app. */
  default_checklist: ChecklistTemplate[];
  remarks: string;
  ncr_id: number | null;
  inspector_name: string;
  inspected_at: string | null;
  created_at: string;
  checked_count: number;
  total_checks: number;
}

export type NcrStatus =
  | 'open'
  | 'investigating'
  | 'corrective'
  | 'verification'
  | 'closed'
  | 'rejected';

export interface Ncr {
  id: number;
  ncr_no: string;
  title: string;
  issue: string;
  detected_at: string;
  ref_no: string;
  severity: 'minor' | 'major' | 'critical';
  status: NcrStatus;
  status_label: string;
  next_states: NcrStatus[];
  assigned_to: number | null;
  assigned_name: string;
  department_name: string;
  qty_affected: number;
  root_cause: string;
  corrective_action: string;
  preventive_action: string;
  verification: string;
  due_date: string | null;
  overdue: boolean;
  closed_at: string | null;
  created_at: string;
  inspection?: Inspection | null;
}

export interface QualitySummary {
  inspections: Record<InspectionKind, { pending: number; pass: number; fail: number; rework: number }>;
  pending_total: number;
  failed_total: number;
  ncr_open: number;
  ncr_awaiting_root_cause: number;
  ncr_awaiting_verification: number;
  ncr_overdue: number;
  ncr_critical: number;
}

// ── MACHINES · MACHINE SHOP ───────────────────────────────────────────────

export type MachineStatus = 'running' | 'idle' | 'setup' | 'maintenance' | 'down' | 'offline';

export const MACHINE_STATUSES: MachineStatus[] = [
  'running',
  'idle',
  'setup',
  'maintenance',
  'down',
  'offline',
];

export const DOWNTIME_REASONS = [
  'tool_breakage',
  'material_unavailable',
  'machine_fault',
  'setup',
  'maintenance',
  'power_failure',
  'operator_unavailable',
  'quality_issue',
  'other',
] as const;

export type DowntimeReason = (typeof DOWNTIME_REASONS)[number];

export interface OpenDowntime {
  id: number;
  reason: DowntimeReason;
  reason_label: string;
  started_at: string;
  minutes: number;
}

export interface Machine {
  id: number;
  code: string;
  name: string;
  work_center: string;
  status: MachineStatus;
  status_label: string;
  current_job: string;
  part_no: string;
  operator_name: string;
  job_started_at: string | null;
  est_completion: string | null;
  running_minutes: number;
  utilization_pct: number;
  tool_life_pct: number;
  oee_pct: number;
  notes: string;
  open_downtime: OpenDowntime | null;
}

export interface MachineSummary {
  total: number;
  running: number;
  idle: number;
  setup: number;
  down: number;
  maintenance: number;
  offline: number;
  utilization_pct: number;
  avg_oee_pct: number;
  open_stops: number;
  today_downtime_minutes: number;
  low_tool_life: { id: number; code: string; name: string; tool_life_pct: number }[];
}

export interface DowntimeReasonBucket {
  reason: DowntimeReason;
  label: string;
  count: number;
  minutes: number;
  open: number;
  share_pct: number;
}

export interface DowntimeMachineRow {
  machine_id: number;
  code: string;
  name: string;
  status: MachineStatus;
  status_label: string;
  stops: number;
  downtime_minutes: number;
  utilization_pct: number;
  oee_pct: number;
  tool_life_pct: number;
}

export interface DowntimeEvent {
  id: number;
  machine_code: string;
  reason: DowntimeReason;
  reason_label: string;
  started_at: string;
  ended_at: string | null;
  minutes: number;
  open: boolean;
  resolution: string;
  reported_by: string;
}

export interface DowntimeAnalytics {
  days: number;
  total_stops: number;
  total_minutes: number;
  by_reason: DowntimeReasonBucket[];
  by_machine: DowntimeMachineRow[];
  recent: DowntimeEvent[];
}

// ── STORES · MATERIAL REQUESTS ─────────────────────────────────────────────

/** One stock row from `/stores/stock`. `available` is net of reservations. */
export interface StockBalance {
  item: string;
  warehouse: string;
  name: string | null;
  on_hand: number;
  reserved: number;
  available: number;
  min_stock: number | null;
  status: 'ok' | 'watch' | 'shortage';
}

export interface MaterialRequestLine {
  item: string;
  qty: number;
  issued_qty?: number;
}

export interface MaterialRequest {
  id: number;
  req_no: string;
  requester: string;
  department_id: number | null;
  purpose_ref: string;
  priority: string;
  required_date: string | null;
  status: 'open' | 'partial' | 'fulfilled' | 'cancelled';
  lines: MaterialRequestLine[];
  created_by: string | null;
  created_at: string;
}

export interface MaterialRequestCreateBody {
  purpose_ref?: string;
  priority?: string;
  required_date?: string | null;
  department_id?: number | null;
  lines: { item: string; qty: number }[];
}
