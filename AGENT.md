# MANATEC DIGITAL — Agent Architecture Spec (v1)

> Single source of truth for every coding agent working on this repo
> (backend FastAPI, mobile Expo, web Vite). Replaces the deleted
> `mobile/MOBILE-APP-FEATURES.txt`, which described screens but not state,
> permissions, offline behavior, concurrency, validation, or API contracts.
> Status legend: `[DONE]` verified in code · `[PARTIAL]` exists, needs work ·
> `[TODO]` not started. Do not claim a TODO item is finished until its
> acceptance check passes.

Repo layout: `backend/` (FastAPI, canonical API port **8099**),
`mobile/` (Expo SDK 57), `web/` (Vite). API base: `/api/v1`.
Canonical API origin for dev: `http://<lan-ip>:8099/api/v1` via
`EXPO_PUBLIC_API_URL` / `VITE_API_URL` (never commit a LAN IP).

Timezone/currency standard: DB stores UTC, API speaks ISO-8601,
clients render `Asia/Kolkata`, `en-IN`, INR (`₹1,23,456`).

---

## 1. Product requirements (what v1 is / is not)

v1 is a plant-operations companion: tasks, attendance, leave, visits/gate,
notices, catalogue, inventory, material requests, procurement, production
tracking, quality/NCR, machine shop, quotations. Out of v1 (acknowledged,
not forgotten): accounting/invoices/payments, sales orders (see §4),
continuous GPS tracking, advanced analytics. Never add UI for an entity
whose backend workflow, permissions, and audit trail are undefined —
spec-first, then API, then UI.

## 2. Roles & permissions (canonical model)

- Canonical permission string: `Module:action`, action ∈
  `view|create|edit|approve|export|delete` (backend `seed.py` MATRIX,
  mobile `auth/permissions.ts`). The letters `R/C/E/A/X/D` are
  **storage shorthand only** — never use them in UI code, API payloads,
  or docs. `[DONE]`
- UI rule: gate controls on `permissions.includes("Module:action")`,
  **never** on `user.role === "ADMIN"` (ADMIN bypass lives server-side
  only). Every gated control must name the missing right when hidden.
  `[PARTIAL]` — SERVICES gating uses `can()`; there are no role-branch
  screens left, but `isInRole` still appears in some row/footer copy paths
  to sweep (HomeScreen "Plant pulse" label uses `Dashboard:export`
  instead of ADMIN/MGMT/DH role check for now).
- Server independently authenticates → authorizes → validates state →
  executes in a transaction on every mutation. UI gating is presentation
  only. `[DONE]` (routers enforce per-endpoint).
- Roles: ADMIN, MGMT, DH, SUP, PLNR, OPER, STORE, STK, PUR, LOG, QINSP,
  ENG, COMM, HR, ACC, ROBOT. Departments: MGMT, PLAN, PROD, STOR, PURC,
  LOGI, QUAL, ENGI, HRAD, COMM. Matrix lives in `backend/app/seed.py`.

## 3. Auth & session security

- Target: access token **15–30 min**, refresh **7–14 days**, auto-refresh
  with 120 s leeway. `[TODO]` — current: 8 h access (`config.py`
  `token_expire_hours`), 14 d refresh. Shorten before production.
- Refresh-token **rotation + revocation + device/session list + "logout
  all devices"**. `[TODO]`
- Single-flight refresh (one in-flight refresh shared by all 401s, then
  retry) is `[DONE]` in `mobile/src/api/client.ts` (`refreshInFlight`) —
  keep this invariant in any rewrite.
- Sign-out clears SecureStore/localStorage. Demo accounts (`admin/admin123`
  etc.) render only under `__DEV__` `[DONE]` — and `seed_demo` must be
  false in any staging/prod database `[TODO: enforce via env]`.

## 4. Business workflows & state machines

- Every workflow entity exposes `{ status, valid_transitions: [...] }`
  with objects (migrate `next_states: string[]` to this shape):
  `{ action, label, target_status, required_permission }`.
  Clients render buttons **only** from this list — never hardcode
  transitions. `[PARTIAL]` — production, NCR and visits emit
  `valid_transitions` objects (helper `backend/app/workflows.py`);
  `next_states` (plain strings) is kept as a deprecated alias for old
  clients on those three; the remaining migration is to the rest of the
  P0 mutations as concurrency lands.
- Machines: running/idle/setup/maintenance/down/offline.
  Purchase: draft→issued→partial→received(+cancelled).
  NCR: open→investigating→corrective→verification→closed(+rejected).
  Visits: created→confirmed→on_the_way→arrived→meeting→follow_up→
  completed(+cancelled); closing requires outcome + next_action (+ due
  date when follow-up ticked).
- Material requests: current OPEN/PARTIAL/FULFILLED/CANCELLED is
  insufficient — target DRAFT→SUBMITTED→APPROVED→PARTIALLY_ISSUED→
  FULLY_ISSUED→CLOSED (+REJECTED/CANCELLED) with an approval step. `[TODO]`
- Quotations must NOT convert directly to production orders in v1-final:
  target Quote→(customer confirmation)→**Sales Order**→Production Order.
  Sales Order entity is `[TODO]`; until then the "Confirm → production
  order" button stays behind `Quotations:approve` with an explicit warning.
- OEE is `Availability × Performance × Quality` from measured stops,
  output counts, and reject counts — never a stored guess. `[TODO: formula
  + source fields]`
- Plant-pulse KPIs (already real formulas in `routers/dashboard.py::_kpis`,
  document them, don't duplicate): `production_pct` = done_qty/total_qty;
  `inventory_pct` = items above reorder / tracked items; `orders_open`,
  `delayed_orders`, `material_alerts`. Any new KPI needs the same
  treatment. `[PARTIAL]`

## 5. Data model & concurrency

- Stock moves **only** via `post_ledger()` → `InventoryLedger` rows
  (prev_qty, delta, new_qty, reason, user, timestamp, ref). Never mutate
  `on_hand` without a ledger entry. `[DONE]` — keep invariant; mobile
  adjustment sheet must send reason + ref (already does).
- Warehouses/bins/batches: target model is
  Item→Warehouse→Bin, Batch/Serial, `on_hand/reserved/available`.
  Today: item→quantity only. `[TODO]`
- Optimistic concurrency: every contested entity carries `version`;
  mutations send it, server rejects stale writes with **409 + current
  state** (not a generic retry). Applies to: stock, PO receipt, production
  transitions, downtime resolve, NCR advance. `[TODO]`
- Mutations are idempotent: clients send `Idempotency-Key: <uuid>` on
  create/receive/adjust/check-in/apply/submit/transition; server dedupes.
  Never blind-retry a POST. `[TODO]` (mobile has 8 s timeout `[DONE]`;
  GETs may retry with backoff, POSTs only with idempotency keys).
- Master data (products, machines, work centres, suppliers, customers,
  employees, leave types, UoMs, warehouses, downtime reasons, inspection
  templates) needs owners + a maintenance surface — assume seed data only
  until defined. `[TODO]`
- Shifts (timing, employee→shift, machine→shift, handover, overtime) are
  `[TODO]` and block any payroll use of attendance.

## 6. API contract (FastAPI, `/api/v1`)

- Standard envelope for new/changed endpoints:
  success `{ success:true, data, meta:{request_id, version} }`,
  error `{ error:{ code, message, required_permission?, current?, retryable } }`.
  Error codes: `VALIDATION(400/422)`, `UNAUTH(401)`, `DENIED(403+needed
  perm)`, `NOT_FOUND(404)`, `CONFLICT(409+current state)`,
  `RATE_LIMITED(429)`, `SERVER(500)`, `UNAVAILABLE(503)`.
  Mobile maps codes → specific UI (409 shows "changed by X", never bare
  RETRY). `[PARTIAL]` — every failure now returns the envelope
  (`backend/app/errors.py` handlers registered in `main.py`, request-id
  echoed as `X-Request-ID`); `requires`/`requires_any` attach
  `required_permission`; mobile `ApiError` parses code/perm/`current` and
  `messageOf` translates codes. Success-side `{data,meta}` wrapping and
  per-route `ApiError` extras (409 `current`) still migrate incrementally.
- Pagination on ALL list endpoints: `?page&page_size` (default 20, max 100)
  + `total`; cursor pagination allowed for feeds. `[TODO]` (mobile lists
  assume full arrays today).
- Global search exists at `GET /search?q=` `[PARTIAL]` — extend to
  PO/WO/NCR/machine/quote/employee/visitor keys and wire one mobile
  search entry point.
- Audit log exists (`/audit`, `AuditLog`: actor, action, module, entity,
  old/new, timestamp) `[PARTIAL]` — require entries on every P0 mutation
  (PO issue/receive, stock move, production transition, NCR advance, leave
  decision, downtime report/resolve) and add a mobile "History" view.
- Versioning: `/api/v1` stays; breaking changes → `/api/v2`, never silent
  field changes. Request IDs: mobile sends `X-Request-ID`, server logs it.
  `[TODO]`

## 7. Mobile architecture (Expo)

- Navigation target:
  `Root → AuthStack(Splash, Login) | AppTabs(Home, Tasks, WorkStack
  (WorkIndex + 13 modules), Alerts, Profile)`. Deep links resolve through:
  unauthenticated→Login→restore intent→permission check→entity (or a
  typed error screen for denied/missing/expired). `[PARTIAL]` — today
  login renders outside any navigator and `linking` has no entity routes
  (`manatec://purchase/PO0007` style is `[TODO]`).
- React Query policy (already in `queryClient.ts` + `api/hooks.ts`, keep):
  `staleTime 30s, gcTime 5m, retry 1, no refetch-on-focus-window`
  (native uses `useRefreshOnFocus`), per-mutation invalidation of
  affected keys (tasks/dashboard/notifications etc.).
- Home must use the existing `GET /dashboard/overview` (+ tasks +
  notifications in parallel) — never fan out per-module. `[DONE]`
- Lists = compact rows, dashboards = cards, transactions = sections,
  long forms = stepped, destructive actions = confirm sheet, primary /
  secondary / danger / overflow button pattern everywhere. No
  card-in-card-in-card. `[PARTIAL]`
- Long forms (visit, inspection, NCR, quote, PO, material request) keep
  local draft + autosave + resume/discard. `[TODO]`
- Never import web-only packages (`react-query-devtools`, DOM libs) into
  native code — removed once already, don't regress. `react-dom` stays
  for web only.

## 8. Offline & sync (honesty clause)

- The app is **NOT offline-first today**: tokens survive restarts, but
  every mutation requires network. Do not claim otherwise.
- Target: persistent SQLite outbox queue per mutation with optimistic UI
  → "Pending sync" badge → replay on reconnect → server accept/reject →
  conflict surface (409 → show current, keep local draft). Priority order:
  attendance, downtime, tasks, inspections, stock, material requests,
  visits, production transitions. `[TODO]` — needs §5 idempotency first.

## 9. Validation rules (server authoritative, client mirrors)

- Leave: **explicit From/To dates** (mobile's "N days → next-month cycle"
  shortcut is wrong — remove it), working-day/holiday/weekend math and
  balance checks server-side. `[TODO]`
- Attendance: one open check-in per employee/day; no checkout-before-
  checkin, no double checkout, no backdating, flag impossible durations;
  record timestamp+device+site/shift. `[TODO]`
- Quality evidence: inspections capture photo + measurement (actual vs
  spec + unit + instrument + batch/serial + inspector + timestamp), not
  just PASS/FAIL/NA. `[TODO]`
- Production execution fields: planned/produced/rejected qty, operator,
  machine, start/end, downtime, cycle time, reject reason. `[TODO]`
- Procurement: MOQ, preferred supplier, price/lead-time/currency/tax/
  freight/terms, open-PO netting before "compute buy-list" output is
  trusted. `[TODO]`
- Files/attachments (PO, quote PDF, inspection report, drawing, NCR photo,
  certificate): upload/preview/download/delete + perms + size/MIME caps
  + offline behavior. `[TODO]`

## 10. Notifications

- In-app inbox exists (`/notifications/my`, unread badge) `[DONE]`.
- Push is `[TODO]`: Expo push tokens per device, Android channels, iOS
  permission flow, background handler, deep-link routing, grouping,
  per-type preferences, dedupe + retry. Event model: domain event →
  push + inbox + (optionally) task, e.g. "PO delayed".

## 11. Security & privacy specifics

- GPS/buyer location: collect only during an active visit with explicit
  consent, visible only to `BuyerTracking:view` roles, retention-bounded,
  never continuous background tracking. `[TODO: policy + enforcement]`
- HTTPS everywhere outside localhost; dev/staging/prod environments with
  separate API/DB/push/logging (`EXPO_PUBLIC_API_URL`, `VITE_API_URL`,
  `CORS_ALLOW_ORIGINS`, `seed_demo=false` outside dev). `[PARTIAL]`
  (env overrides exist; separation + HTTPS are TODO).
- CORS: explicit origin list + LAN regex, never `*` + credentials
  `[DONE]` in `backend/app/main.py`.
- Backend must run on port **8099** (`uvicorn app.main:app --host 0.0.0.0
  --port 8099 --reload`) to match mobile/web/docs. `[DONE]`

## 12. UX system, a11y, devices

- 44pt targets, screen-reader labels + announced selected/expanded/error
  states, visible focus, font-scaling + contrast checks, reduce-motion
  instant swaps (all `[DONE]` — extend to every new screen).
- Shop-floor devices: low-end Android, poor network, gloves, sunlight,
  portrait-first; **barcode/QR scan** for PO/material/machine/product/
  batch/employee is P1. `[TODO]`
- Home widgets per role (operator: job/machine/target; stores: low stock/
  requests/receipts; purchase: approvals/shortages/overdues; quality:
  pending/failed/NCRs; management: full pulse) — configurable, not separate
  screens. `[TODO]`

## 13. Observability, testing, release

- Crash reporting + API error logging + perf traces + `X-Request-ID`
  end-to-end. `[TODO]`
- Backend: `pytest` green before merge (full suite is slow; `-k` subsets
  for iteration). Mobile: `tsc --noEmit` + `expo export --platform
  android|ios` + `expo doctor` clean. No commit with secrets, no force-push.
- Release gates: P0 checklist in §14 all `[DONE]`, demo data off,
  HTTPS on, push configured, audit coverage verified.

## 14. Phased roadmap (execute in order, no skipping)

- [x] **Phase 0 — Spec (this file).** Old feature TXT deleted.
- [ ] **Phase 1 (P0 foundations):** token lifetimes/rotation/revocation;
  `isInRole`→permission migration; error envelope + mobile code mapping;
  `valid_transitions` objects; idempotency keys; 409/version concurrency;
  audit coverage on P0 mutations; `seed_demo`/env separation; HTTPS plan.
- [ ] **Phase 2 (P0 data):** ledger invariants + warehouse/bin/batch +
  reserved/available; leave from/to + server calc; attendance guards +
  shifts; master-data owners; OEE formula + production execution fields;
  quality evidence; sales-order entity; procurement rules.
- [ ] **Phase 3 (P1):** offline outbox + sync UI; pagination everywhere;
  push architecture; entity deep links + deferred-link flow; file
  attachments; barcode/QR; material-request approval workflow.
- [ ] **Phase 4 (P2):** role dashboards; global search UI; drafts;
  observability; a11y pass; release hardening.

Work a phase strictly in order; update the checkboxes here as phases land.
