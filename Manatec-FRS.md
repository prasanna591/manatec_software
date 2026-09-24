# MANATEC INTEGRATED DIGITAL OPERATIONS PLATFORM

## Functional Requirement Specification (FRS)

**Document ID:** MANATEC-FRS-001
**Version:** 1.0 (Draft for Review)
**Status:** Proposed
**Prepared for:** Manatec / PSM
**Date:** September 2026

> This document is the single source of truth for the build. It is the blueprint from
> which PSM estimates effort, designs the database and API architecture, and begins
> development. Any change to scope, roles, screens, integrations, approvals, or data
> model must be formally raised as a change request against this document.

---

## TABLE OF CONTENTS

1. [Executive Summary](#1-executive-summary)
2. [Strategic Architecture](#2-strategic-architecture)
3. [Platform Principles](#3-platform-principles)
4. [Canonical Data Model](#4-canonical-data-model)
5. [Users, Roles & Permissions (RBAC)](#5-users-roles--permissions-rbac)
6. [Common User Experience](#6-common-user-experience)
7. [Department FRS — Commercial / Sales](#7-department-frs--commercial--sales)
8. [Department FRS — Planning](#8-department-frs--planning)
9. [Department FRS — Production](#9-department-frs--production)
10. [Department FRS — Stores / Inventory](#10-department-frs--stores--inventory)
11. [Department FRS — Purchase / Procurement](#11-department-frs--purchase--procurement)
12. [Department FRS — Logistics / Dispatch](#12-department-frs--logistics--dispatch)
13. [Department FRS — Quality](#13-department-frs--quality)
14. [Department FRS — Engineering / R&D](#14-department-frs--engineering--rd)
15. [Department FRS — HR / Admin](#15-department-frs--hr--admin)
16. [Department FRS — Management](#16-department-frs--management)
17. [Cross-Cutting Engines](#17-cross-cutting-engines)
18. [Integration Layer & ERP Connector](#18-integration-layer--erp-connector)
19. [Database & API Architecture](#19-database--api-architecture)
20. [Security, Audit & Non-Functional Requirements](#20-security-audit--non-functional-requirements)
21. [Master Reports Register](#21-master-reports-register)
22. [Skills Required for Development](#22-skills-required-for-development)
23. [Development Roadmap & Estimation Basis](#23-development-roadmap--estimation-basis)
24. [Appendix — Screen Template & Conventions](#24-appendix--screen-template--conventions)

---

# 1. EXECUTIVE SUMMARY

Manatec already operates an ERP (system of record). This platform is **not** an ERP
replacement. It is a **Digital Operations & Integration Platform** wrapped around the
existing ERP.

**Strategic goal (one sentence):**

> One connected system through which management sees the entire company, employees
> execute department work from mobile, the existing ERP remains connected, operational
> data becomes intelligent, and future robots can participate in the same workflow.

### 1.1 What the platform adds, on top of the ERP

| Capability | Description |
|---|---|
| Better user experience | Modern web + mobile interfaces instead of ERP screens |
| Mobile execution | Employees execute department work from phones/tablets |
| Cross-department visibility | One dashboard shows the whole company, not silos |
| Workflow automation | Work moves automatically between departments with approvals |
| Management intelligence | Management sees "what is happening, what needs attention, why" |
| Inventory intelligence | Availability, consumption, shortages, feasibility |
| Lead-time calculation | Order acceptance based on real operational constraints |
| Ordering intelligence | Feasibility + expected completion at order entry |
| AI | Recommendations, risk detection, reports — after data foundation |
| Future robot management | Robots become operational actors in the platform |

### 1.2 Scope of this document

This FRS defines, for **every department**:

- User roles
- Every screen
- Every action on every screen
- Inputs and outputs (data captured / data displayed)
- ERP integration behavior on that screen
- Approvals triggered
- Notifications generated
- Reports produced

It also defines the cross-cutting engines, the integration layer, the data/API
architecture, security and audit requirements, the skills required to build it, and
the development roadmap used for estimation.

### 1.3 Out of scope

- Replacement of ERP transaction processing (orders, POs, financials, MRP) — the ERP stays authoritative.
- Direct ERP database manipulation by the platform — integration is through the Integration Layer.
- Hardware purchase (robots, scanners) — the platform manages them once they exist.
- AI decisions without human approval in critical manufacturing paths (Phase 8 constraint).

---

# 2. STRATEGIC ARCHITECTURE

## 2.1 The four connected surfaces

```
                MANATEC DIGITAL PLATFORM
                                  │
             ┌────────────────────┼────────────────────┐
             │                    │                    │
        MANAGEMENT WEB       EMPLOYEE MOBILE       AI / AUTOMATION
          DASHBOARD              APP                  ENGINE
             │                    │                    │
             └────────────────────┼────────────────────┘
                                  │
                         INTEGRATION PLATFORM
                                  │
                    ┌─────────────┴─────────────┐
                    │                           │
              EXISTING ERP               FUTURE ROBOTS
                    │                           │
             Existing Data                Robot Fleet
             Existing Process             Robot Tasks
```

- **Management Web Dashboard** — consoles for management and heads of departments.
- **Employee Mobile App** — role-based task execution for every department.
- **AI / Automation Engine** — recommendations and rule automation on top of operational data.
- **Integration Platform** — the only path between the platform, the ERP, and robots.

## 2.2 Ownership split: ERP vs Platform

| Concern | System of record | Platform handles |
|---|---|---|
| Items, customers, suppliers | ERP | Reads/caches for display |
| Purchase orders | ERP | Creates via Integration Layer; tracks status |
| Sales orders | ERP | Reads; adds feasibility/lead-time layer |
| Inventory transactions | ERP | Reads; sends consumption/adjournment events |
| Production records | ERP | Sends completed quantities, receives work orders |
| Accounts | ERP | Reads for dashboards |
| Employee, department, role, permissions | Platform | Canonical in platform |
| Tasks, approvals, notifications | Platform | Canonical in platform |
| Workflow/status transitions | Platform | Canonical in platform |
| Analytics, lead-time, feasibility | Platform | Computed in platform |

## 2.3 Management dashboard drill-down hierarchy

```
Company → Department → Process → Order → Product → Component → Material
```

Every "top-level KPI" must be drillable down this hierarchy to the material level.

## 2.4 Layer model (end state)

| Layer | System | Purpose |
|---|---|---|
| L1 | Existing ERP | Transactional / business system of record |
| L2 | Integration Platform | Connects ERP, platform, robots |
| L3 | Mobile Workforce | Employees execute work |
| L4 | Management Dashboard | Management sees the company |
| L5 | Workflow Engine | Work moves automatically between departments |
| L6 | Intelligence Engine | Inventory + product + production + lead-time intelligence |
| L7 | AI Automation | System assists decisions, automates repetitive work |
| L8 | Robotics | Machines/robots participate in operations |

---

# 3. PLATFORM PRINCIPLES

These constraints govern every design decision. A requirement that violates a
principle is invalid unless formally waived.

1. **ERP is the system of record** for items, customers, suppliers, orders, POs,
   inventory transactions, production records, and accounts. The platform never
   becomes a second ERP with duplicate master data.
2. **Single integration path.** All ERP reads/writes flow through the Integration
   Layer (see Section 18). No direct DB access from apps.
3. **One mobile app, role-based experiences.** Never build 10 mobile apps.
4. **Task-oriented UX.** Home screen shows *my tasks*, *my current work*, *my
   alerts* — not menus.
5. **Real operations data, not manual statistics.** Dashboard numbers are computed
   from operational transactions, never typed in.
6. **Every important transaction is auditable.** Who created / approved / modified /
   completed / when (Section 20).
7. **Approval before critical action.** Workflow engine routes approvals; no
   hard-coded approval inside screens.
8. **AI recommends, humans approve** for critical manufacturing decisions.
9. **Configurable workflow and notification rules**, not hard-coded flows.
10. **Built in dependency order.** Integration before dashboard before mobile
    before intelligence before AI before robotics (Section 23).
11. **Canonical data model.** The platform stores its own operational entities and a
    cached copy of ERP master refs — it does not mirror the entire ERP database.

---

# 4. CANONICAL DATA MODEL

The platform maintains its own operational entities (canonical) and caches ERP
master references. This section defines every entity, its ownership, and its key
attributes. It is the basis of the database design (Section 19).

**Ownership legend:** `[P]` Platform-owned (canonical in platform) · `[E]` ERP-owned
(read via integration) · `[B]` Platform-owned but synchronized both ways via
Integration Layer.

## 4.1 Platform-owned operational entities

| Entity | Ownership | Key attributes |
|---|---|---|
| `User` | P | id, employee_id, username, password hash, department_id, role, status, last_login |
| `Employee` | P | id, code, name, department_id, role, manager_id, phone, email, active, skills, shift, hire_date |
| `Department` | P | id, code, name, head_employee_id, active |
| `Role` | P | id, code, name, permissionset |
| `Permission` | P | id, role_id, module, screen, action (view/create/edit/approve/export/admin) |
| `Task` | P | id, type, title, description, source_ref (order/request), assigned_to, due_date, status, priority, created_by, created_at |
| `WorkflowInstance` | P | id, workflow_def_id, entity_type, entity_ref, current_state, created_by, finished_at |
| `WorkflowState` | P | id, instance_id, state, action, actor_id, comment, at |
| `Approval` | P | id, workflow_id, approver_id, status, comment, at |
| `Notification` | P | id, recipient_id, channel, title, body, entity_ref, read_at, sent_at |
| `NotificationRule` | P | id, event, condition, channel, recipients_rule |
| `MaterialRequest` | P | id, ref, requested_by, department, lines[], priority, status, created_at |
| `MaterialRequestLine` | P | id, material_id, qty, uom, issued_qty, status |
| `StockCount` | P | id, warehouse, counted_by, scheduled_at, status |
| `StockCountLine` | P | id, count_id, item_id, counted_qty, system_qty, variance |
| `OutwardIssue` | P | id, ref, request_ref, issued_by, issued_at |
| `OutwardIssueLine` | P | id, issue_id, item_id, qty, uom, to_department |
| `InwardReceipt` | P | id, ref, po_ref, received_by, received_at, status |
| `InwardReceiptLine` | P | id, receipt_id, item_id, qty, received_qty, status |
| `Transfer` | P | id, from_wh, to_wh, initiated_by, status |
| `TransferLine` | P | id, transfer_id, item_id, qty |
| `ProductionOrder` | B | id, erp_id, product_id, qty, started_qty, completed_qty, status, priority, due_date, plant/line |
| `WorkOrder` | P | id, production_order_id, operation_seq, operation_id, qty, status, assigned_operator, machine_id |
| `Operation` | P | id, code, name, sequence, standard_time, department_id |
| `OperationEntry` | P | id, work_order_id, operator_id, action(start/pause/resume/complete), qty, reject_qty, rework_qty, machine_id, at |
| `Machine` | B | id, erp_id, code, name, dept, status, current_order, utilization, downtime_log |
| `DowntimeEvent` | P | id, machine_id, reason, start, end, reported_by |
| `QualityCheck` | P | id, production_order_id / work_order_id / receipt_id, check_type, result, inspector, qty_inspected, qty_ok, qty_rejected, at |
| `RejectionRecord` | P | id, production_order_id, qty, reason, stage, disposition(repair/rework/scrap), approved_by |
| `Dispatch` | B | id, erp_id, order_ref, vehicle, transporter, dispatched_by, at, status |
| `DispatchLine` | P | id, dispatch_id, product_id, qty, packed |
| `ShipmentTrack` | P | id, dispatch_id, status, location_note, updated_by, at |
| `PODDelivered` | P | id, dispatch_id, signed_by, image, at |
| `Quotation` | P | id, ref, customer_id, product_id, qty, unit_price, validity, status, created_by |
| `OrderInquiry` | P | id, customer_id, product_id, qty, required_date, status |
| `FeasibilityResult` | P | id, order_ref, product_id, qty, result(pass/fail), material_ok, capacity_ok, lead_time_days, completion_date, constraints[] |
| `ProcurementRequirement` | P | id, source(mrp/order/shortage/stock_min), item_id, required_qty, need_date, status, generated_by |
| `PurchaseRequisition` | P | id, ref, requirement_ids, requested_by, status, approved_at |
| `Subscription` — not used | | |
| `ERPObjCache` | E | entity, erp_key, snapshot_json, hash, synced_at |
| `SyncJob` | E | entity, direction, status, rows, last_run, error |
| `LeadTimeSnapshot` | P | order_ref, estimated_days, actual_days, variance, factors[] |
| `ConsumptionRecord` | B | item_id, period, qty, direction(out/in) |
| `ShortagePrediction` | P | item_id, expected_shortage_date, qty, confidence, recomputed_at |
| `Robot` | P | id, code, name, model, connectivity, status, battery, current_task, location |
| `RobotTask` | P | id, robot_id, production_task_ref, status, started, finished, result, telemetry |
| `RobotLog` | P | id, robot_id, ts, level, message |
| `AuditLog` | P | id, actor_id, action, entity_type, entity_ref, before, after, ip, at |
| `Document` | P | id, entity_ref, type, filename, storage_key, uploaded_by, version, approved_by |

## 4.2 ERP entities (cached, read-only in platform)

| Entity | Source | Revealed attributes |
|---|---|---|
| `Item` (material) | ERP | code, name, uom, category, item_type(finished/component/raw/consumable), min_stock |
| `Customer` | ERP | code, name, contact, address, credit_limit |
| `Supplier` | ERP | code, name, contact, lead_days |
| `Product` | ERP | code, name, uom, category, active |
| `BOM` | ERP | product → component/item + qty per unit, level |
| `SalesOrder` | ERP | order_no, customer, product, qty, required_date, status, lines |
| `PurchaseOrder` | ERP | po_no, supplier, item, qty, order_date, due_date, status, lines |
| `InventoryTransaction` | ERP | item, warehouse, qty, direction(in/out), type, ref, at |
| `OnHandStock` | ERP | item, warehouse, qty, reserved_qty, available |
| `GRN / Inbound` | ERP | receipt_no, po_ref, item, qty, date |
| `ProductionRecord` | ERP | order_no, product, qty, completed qty, date |
| `Invoice / Account` | ERP | invoice_no, customer, amount, status, due_date |
| `Payment` | ERP | customer, amount, date, method |

## 4.3 Data synchronization rules

- Master refs (items, customers, suppliers, products, BOM, machines) are **pulled**
  from ERP on a schedule or on-event and stored in `ERPObjCache`.
- Platform writes that the ERP must record (PO creation, inventory postings,
  production completion, dispatch) are pushed through the Integration Layer as
  **integration events** and confirmed with an ERP transaction reference.
- Conflicts: ERP is authoritative. If a platform write is rejected by the ERP, the
  workflow holds and a notification + audit record is raised.
- All sync jobs are recorded in `SyncJob` and failures are alerting (Section 18).

---

# 5. USERS, ROLES & PERMISSIONS (RBAC)

## 5.1 Role catalogue

| Role code | Role | Level | Mobile | Web |
|---|---|---|---|---|
| `ADMIN` | Platform Administrator | System | Yes | Yes |
| `MGMT` | Management (Director / GM) | Company | Yes | Yes |
| `DH` | Department Head / Manager | Department | Yes | Yes |
| `SUP` | Supervisor | Section | Yes | Yes |
| `PLNR` | Planner | Department | Yes | Yes |
| `OPER` | Production Operator | Section | Yes | Limited |
| `STORE` | Stores Operator | Section | Yes | Limited |
| `STK` | Stock Counter | Section | Yes | No |
| `PUR` | Purchase Officer | Department | Yes | Yes |
| `LOG` | Logistics / Dispatcher | Section | Yes | Limited |
| `QINSP` | Quality Inspector | Section | Yes | Limited |
| `ENG` | Engineer / Design | Department | Yes | Yes |
| `COMM` | Commercial / Sales Officer | Department | Yes | Yes |
| `HR` | HR / Admin Officer | Department | Yes | Yes |
| `ACC` | Accounts (view) | Department | Yes | Yes |
| `ROBOT` | Robot system account | System | API | API |

## 5.2 Permission matrix (module × action)

Modules: `Home`, `Orders`, `Orders.Intel`, `Planning`, `Production`, `Machines`,
`Inventory`, `MaterialReq`, `Purchase`, `PurchaseReq`, `Logistics`, `Dispatch`,
`Quality`, `Engineering`, `Quotations`, `Customers`, `Suppliers`, `Employees`,
`Attendance`, `Approvals`, `Notifications`, `Reports`, `Dashboard`, `Admin`,
`Analytics`, `Robots`, `Documents`.

Actions per module: **R** view · **C** create · **E** edit · **A** approve ·
**X** export · **D** delete · `—` none.

> This matrix is the *default*. It is configurable in `Admin → Permissions`
> (Section 15). The table below shows the default.

| Module | MGMT | DH | SUP | PLNR | OPER | STORE | PUR | LOG | QINSP | ENG | COMM | HR | ACC |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Home / MyTasks | R C | R C | R C | R C | R C | R C | R C | R C | R C | R C | R C | R C | R |
| Dashboard | R X | R X | R | R | R | R | R | R | R | R | R | R | R |
| Orders | R X | R | R | R C E | R | R | R | R | R | R | R C E | R | R |
| Orders.Intel | R | R | — | R | — | — | R | — | — | — | R | — | — |
| Planning | R | R C E A | R C E | R C E | — | R | R | R | — | — | — | — | — |
| Production | R | R X | R C E | R C | C E | R | R | R | R | R C E | R | — | — |
| Machines | R | R | R C E | R | C E | — | — | — | — | — | — | — | — |
| Inventory | R X | R X | R | R | R | R C E | R C E | R | R | R | R | — | R |
| MaterialReq | R | R A | R C E A | R C | C | C E A | R | — | — | R C | R C | — | — |
| Purchase | R X | R A | R | R | — | R | R C E A | — | — | — | R | — | — |
| PurchaseReq | R | R | R | R C | — | R C | R C A | — | — | R C | R C | — | — |
| Logistics | R | R A | R C E | R | — | R | — | R C E A | — | — | — | — | — |
| Quality | R | R X | R | R | R | R | R | R | R C E A | R | — | — | — |
| Engineering | R | R | R | R | — | — | — | — | — | R C E A | — | — | — |
| Quotations | R | R A | — | R | — | — | — | — | — | R | R C E | — | — |
| Customers | R | R | — | R | — | — | — | — | — | — | R C E | — | R |
| Suppliers | R | R | — | R | — | — | R C E | — | — | — | — | — | — |
| Employees | R | R | R | R | — | — | — | — | — | — | — | R C E A | R |
| Attendance | R X | R X | R C E | — | R C E | R C E | R C E | R C E | R C E | R C E | R C E | R C E A | R |
| Approvals | R A | R A | R A | R A | R A | R A | R A | R A | R A | R A | R A | R A | R A |
| Notifications | R X | R X | R X | R X | R X | R X | R X | R X | R X | R X | R X | R X | R X |
| Reports | R X | R X | R X | R X | R X | R X | R X | R X | R X | R X | R X | R X | R X |
| Admin | — | — | — | — | — | — | — | — | — | — | — | — | C E A D | — |
| Analytics | R X | R X | R | R | — | — | R | — | — | — | R | — | — |
| Robots | R | R | R | R C E | — | — | — | — | — | — | — | — | — |

## 5.3 Authentication rules

- All users authenticate with username/employee code + password (PBKDF2/bcrypt) or
  PIN/biometric on mobile for 24 h re-auth.
- Sessions: JWT (access 8 h, refresh 14 d) on web; app token + device binding on
  mobile (Section 20).
- Password policy: min 8 chars, complexity, forced change on first login, lockout
  after 5 failures (15 min).
- Robot accounts authenticate via API key + mTLS (Section 25).

---

# 6. COMMON USER EXPERIENCE

## 6.1 The per-screen template (used in every department FRS)

Every screen in this FRS is specified with the **same eight fields**. If a field is
not applicable it is marked `—`.

> **Screen:** name
> - **Roles:** who can access it (from Section 5.2)
> - **Purpose:** why the screen exists
> - **Actions:** every button / gesture / command on the screen
> - **Inputs:** every field captured on the screen
> - **Outputs:** every data element displayed / generated
> - **ERP integration:** reads from ERP cache (Section 4.2) or writes via Integration Layer (Section 18)
> - **Approvals:** workflow(s) triggered (Section 17)
> - **Notifications:** messages generated (Section 17)
> - **Reports:** reports sourced from this screen's data (Section 21)

## 6.2 Web Control Center (management / desktop)

### 6.2.1 Application shell
- Header: company logo, global search (`Order #`, product, customer, item, employee),
  notifications bell, user menu, language.
- Left navigation: Home, Orders, Planning, Production, Machines, Inventory, Purchase,
  Logistics, Quality, Engineering, Commercial, Employees, Reports, Admin.
- Navigation is filtered by role (Section 5.2) — a user only sees permitted modules.
- Global search resolves: orders, products, customers, items, work orders, POs,
  dispatch, employees. Any hit can be opened, honoring RBAC.

### 6.2.2 Global KPI strip (per module header)
Every module header shows its 4 core KPIs computed live from operational data
(never typed). Example for Production: Active orders / Completion % / Delayed /
Downtime h.

### 6.2.3 Common dialogs
- **Approval dialog**: shows approver, entity summary, comment, approve/reject + reason.
- **Comment/timeline**: every record shows a chronological activity timeline (audit).
- **Attachment upload**: photos, PDFs, CAD files, signed documents (→ `Document`).
- **Export dialog**: Excel/PDF/CSV respecting export permission; export is audited.

## 6.3 Employee Mobile App

### 6.3.1 App shell (same app, role-based experience)
- Single mobile application: **Manatec Digital**. Login with employee code + password /
  PIN / biometric.
- The backend determines modules/actions from the user's role. A stores operator never
  sees production menus.

### 6.3.2 Home screen (task-oriented)
```
Good Morning, <Name>

TODAY
─────────────────
My Tasks             8
Pending Approvals    2
Notifications        3

CURRENT TASK
Production Order #1042
Product: XXXX
Qty: 100   Completed: 72
[ UPDATE PROGRESS ]

URGENT
• Material shortage  (SO #101)
• Approval required  (MR #88)
```
- "My Tasks" is computed from assigned tasks + due/overdue logic.
- "CURRENT TASK" surfaces the single highest-priority in-flight task for the user.
- "URGENT" = notifications with priority critical/urgent.

### 6.3.3 Profile & attendance
- Profile: photo, department, role, manager, contact, skills.
- Attendance: check-in / check-out (geo-fence optional), break start/end, day status;
  supervisor can edit with reason (audited).
- My activity: list of own recorded actions (what I did, when) — accountability,
  not surveillance.

### 6.3.4 Notifications center
- Tabs: All / Unread / Approvals / Alerts.
- Channels: in-app, push (FCM/APNs), email, web (Section 17).
- Actions from a notification deep-link to the relevant record (open MR, approve PO…).

### 6.3.5 Offline behavior (mobile)
- Screens listed as **offline-capable** queue write operations locally when
  connectivity is lost; they sync on reconnect; conflict resolution: ERP/platform
  timestamp wins, conflicts logged to audit and notify the operator.
- Read-only dashboards require network (they reflect live ERP data).

## 6.4 Common global processes

| Process | Trigger | Flow | Result |
|---|---|---|---|
| Notification delivery | Any event (Section 17) | Event → rule → channels → recipient | `Notification` row + push/email |
| Approval request | Any workflow step | Submit → queue → approver action | `Approval` + `WorkflowState` |
| Attachment upload | Any record | User uploads → virus scan → store → link | `Document` versioned |
| Global search | Header | Search index (orders/products/items/…) | Results honoring RBAC |
| Export | Reports/Views | Permission check → generate → notify | File + audit |

---

# 7. DEPARTMENT FRS — COMMERCIAL / SALES

## 7.0 Department scope
Owns the customer relationship from enquiry to order acceptance and through to
payment. The commercial team uses the platform's **Order Intelligence** (Section 17.4)
to answer "can we accept this order, and what completion date can we commit?"

### Roles
`COMM` Commercial Officer · `DH` Commercial Head · `MGMT` · `ACC` (view).

## 7.1 Screen: Orders — Order Inbox
- **Roles:** COMM, DH, MGMT
- **Purpose:** See every sales order from the ERP together with platform intelligence.
- **Actions:** Search by order no. / customer / product / date; filter by status
  (new, feasibility-pending, accepted, in-production, delayed, dispatched, closed);
  open order detail; export list.
- **Inputs:** search terms, filters.
- **Outputs:** list of orders with customer, product, qty, required date, current
  status, feasibility badge, completion estimate, delay flag.
- **ERP integration:** reads `SalesOrder` from ERP cache (sync per Section 4.3).
- **Approvals:** none (list view).
- **Notifications:** none (list view).
- **Reports:** `R-ORD-01 Order Register`, `R-ORD-02 Order Backlog`.

## 7.2 Screen: Order Detail — Order Control Center
- **Roles:** COMM, DH, MGMT
- **Purpose:** The full "Order #1234" answer: customer → product → qty → current
  production → material availability → machine/capacity → expected completion → dispatch.
- **Actions:** View drill-down hierarchy; run feasibility re-check; view timeline;
  view document attachments; add comment; create follow-up enquiry to planning;
  flag for management attention (reason required); export.
- **Inputs:** (view) — comments, priority flag + reason.
- **Outputs:** Order header; customer profile; product + BOM summary; required qty;
  completed-to-date from `ProductionRecord`; material availability % per critical
  item (Section 10 / 17.5); machine/capacity status (Section 17.3); expected
  completion date from Lead-Time Engine (Section 17.3); dispatch status; delay
  explanation (facts + contributing factors).
- **ERP integration:** reads SO, production records, on-hand stock, machine status
  from ERP cache.
- **Approvals:** "Flag for management" requires DH if raised by COMM.
- **Notifications:** to DH on flag; to COMM when a status they follow changes
  (production start, delay, dispatch).
- **Reports:** `R-ORD-10 Order Status Summary` (drill pinpoint).

## 7.3 Screen: Feasibility Review — Order Acceptance
- **Roles:** COMM, DH (approve), MGMT (view)
- **Purpose:** Before accepting/confirming a customer order, evaluate operational
  feasibility and commit a delivery date.
- **Actions:** Submit order for feasibility (or SO synced from ERP triggers auto);
  review FeasibilityResult (material check, capacity check, lead time);
  accept / reject / propose revised date; document reason on reject/revision; print
  order confirmation draft.
- **Inputs:** order ref, qty, required date, customer, desired date override (by DH only).
- **Outputs:** FeasibilityResult: material_ok, capacity_ok, estimated lead time
  (days), expected completion, constraint list (e.g. "Item X short by 20", "Machine M2
  overloaded"), recommend accept/reject with rationale.
- **ERP integration:** reads items, BOM, stock, machines, SO; writes order
  confirmation/acceptance back to ERP via Integration Layer (status update).
- **Approvals:** acceptance confirmed by DH (auto-route; MGMT only above configurable
  order value).
- **Notifications:** to COMM on result; to MGMT above value threshold; to Planning on
  acceptance (creates Planning task, Section 8).
- **Reports:** `R-ORD-03 Order Acceptance Report`.

## 7.4 Screen: Quotations
- **Roles:** COMM, DH, ENG, PLNR (view)
- **Purpose:** Track quotes from draft to issued to closed.
- **Actions:** Create quote; add customer/product/qty/price/validity; attach
  specification/CAD; submit for DH approval; issue to customer; record follow-up
  dates; mark won/lost (+ reason); convert won quote → order (via ERP, discovery of
  requested price approval as needed).
- **Inputs:** customer, product/BOM ref, qty, unit price, tax, validity, terms,
  attachments, follow-up date, outcome + reason.
- **Outputs:** quote list; quote PDF; status timeline; price history per customer/product.
- **ERP integration:** reads customer/product from cache; pushes won-quote → SO into
  ERP (Integration Layer).
- **Approvals:** DH (price within delegation band), MGMT (> band) — configurable rule.
- **Notifications:** to COMM when quote approved/rejected; to ENG when engineering
  clarification needed; reminder on follow-up date.
- **Reports:** `R-COMM-01 Quotation Register`, `R-COMM-02 Win/Loss`.

## 7.5 Screen: Customers
- **Roles:** COMM, DH, MGMT, ACC
- **Purpose:** View/refresh customer master from ERP; platform adds account context.
- **Actions:** Search; view customer profile; view order history; view open orders;
  view outstanding (ERP accounts); add internal note; contact person update (if ERP
  allows via adapter); export.
- **Inputs:** search; internal note.
- **Outputs:** customer profile, orders, outstanding invoices, credit-limit usage,
  contact list.
- **ERP integration:** reads `Customer` + `Invoice`/`Payment` from cache.
- **Approvals:** note is internal (none).
- **Notifications:** none.
- **Reports:** `R-COMM-03 Customer Aging`.

## 7.6 Screen: Order Tracking (for commercial queries)
- **Roles:** COMM, DH, MGMT
- **Purpose:** Answer the customer's "where is my order" without phoning five departments.
- **Actions:** Search order; view stage progression (accepted → planned → produced →
  QC → packed → dispatched); view per-stage dates and owners; reply template.
- **Inputs:** order no. / customer / date range.
- **Outputs:** stage bar with dates/owners, current stage, expected completion.
- **ERP integration:** reads SO, production, dispatch from cache.
- **Approvals:** none.
- **Notifications:** none.
- **Reports:** same source as `R-ORD-10`.

## 7.7 Screen: Dispatch Commitment (commercial view)
- **Roles:** COMM, DH
- **Purpose:** Align dispatch promise with logistics reality before quoting dates.
- **Actions:** View planned vs committed dispatch dates; request dispatch slot;
  view POD/status.
- **Inputs:** order ref, target dispatch date.
- **Outputs:** planned dispatch, transporter, POD status, delivery status.
- **ERP integration:** reads Dispatch/POD from cache.
- **Approvals:** none (request logged).
- **Notifications:** to Logistics when a commercial dispatch request is raised.
- **Reports:** `R-LOG-05 Dispatch Vs Commit`.

---

# 8. DEPARTMENT FRS — PLANNING

## 8.0 Department scope
Planning converts accepted orders into a feasible production plan: today's plan,
weekly plan, work orders, sequencing, machine loading, and material constraint alerts.
Planning is the bridge between commercial commitments and shop-floor reality.

### Roles
`PLNR` Planner · `SUP` Supervisor (view/execute parts) · `DH` Planning Head ·
`MGMT` · `STORE`/`PUR`/`LOG` (view).

## 8.1 Screen: Today's Plan
- **Roles:** PLNR, DH, SUP, MGMT
- **Purpose:** What must be produced today, by whom, on which machine.
- **Actions:** View day plan (by machine/line/operator); reorder/priority change
  (DH); reassign operator/machine; mark plan item as blocked (reason); add/adjust
  planned qty; approve day plan; view actual vs planned progress live; export.
- **Inputs:** date, line/machine filter, priority moves, operator/machine assignment.
- **Outputs:** list of production orders planned today: product, qty planned, qty
  completed, operator, machine, planned vs actual %, status, priority; blockers with
  reasons.
- **ERP integration:** reads `ProductionRecord` for actuals; reads SO commitments;
  pushes plan/work-order creation to ERP via Integration Layer.
- **Approvals:** priority change above threshold → DH; day-plan approval → DH.
- **Notifications:** to operators when their day plan is set/changed (mobile task);
  to DH when a plan item is blocked.
- **Reports:** `R-PLN-01 Daily Production Plan`, `R-PLN-02 Plan Vs Actual`.

## 8.2 Screen: Weekly Plan
- **Roles:** PLNR, DH, MGMT
- **Purpose:** Horizon planning across the next 1–4 weeks.
- **Actions:** View Gantt/table of orders vs weeks; drag to reschedule (DH);
  auto-load from backlog + lead-time engine; freeze week (DH); flag conflicts
  (over-capacity); export.
- **Inputs:** method (auto/manual), week range, freeze flag.
- **Outputs:** weekly load by machine/dept, planned orders per day, capacity
  utilization %, order expected start/end, rescheduling warnings.
- **ERP integration:** reads backlogs, BOM, machines, stock for constraint flagging.
- **Approvals:** weekly plan sign-off by DH; over-capacity loading requires DH override.
- **Notifications:** to MGMT when over-capacity conflicts unresolved; to commercial
  when a committed date slips.
- **Reports:** `R-PLN-03 Weekly Load`, `R-PLN-04 Capacity Plan`.

## 8.3 Screen: Pending & Priority Orders
- **Roles:** PLNR, DH, MGMT
- **Purpose:** Rank all open production work and surface what needs attention.
- **Actions:** Sort by due date/priority/delay age; set priority (DH); group by
  product/customer; open order detail; raise material constraint; escalate to MGMT.
- **Inputs:** filter/sort controls; priority set; escalation reason.
- **Outputs:** queue of open production orders: product, qty, due date, state,
  completion %, days overdue, priority, constraint badges.
- **ERP integration:** reads SO + production status from cache.
- **Approvals:** priority set → DH; escalation → DH (auto-forward to MGMT).
- **Notifications:** to DH on overdue threshold; to MGMT on escalation.
- **Reports:** `R-PLN-05 Order Priority List`.

## 8.4 Screen: Material Constraints
- **Roles:** PLNR, DH, PUR, STORE, MGMT
- **Purpose:** See exactly which planned production orders are blocked by which
  materials and why.
- **Actions:** View constraint list (order, item, required qty, available, shortage,
  expected date); convert constraint → purchase requirement (PUR); reserve available
  stock (STORE); reopen once resolved; export.
- **Inputs:** filter by order/item/date; action: mark as resolved, raise
  ProcurementRequirement.
- **Outputs:** material-availability per planned order using Inventory Intelligence
  (Section 17.5); shortage quantity and expected resolution date.
- **ERP integration:** reads BOM + on-hand + open POs (ETAs) from cache.
- **Approvals:** raising purchase requirement routes to PUR (Section 11.4).
- **Notifications:** to PUR + STORE on new constraint; to PLNR when resolved.
- **Reports:** `R-PLN-06 Material Constraint Register`.

## 8.5 Screen: Machine & Capacity Constraints
- **Roles:** PLNR, DH, MGMT
- **Purpose:** Identify capacity bottlenecks before they become delays.
- **Actions:** View machine load (today/week); see overloaded machines; re-route
  operations (DH); raise maintenance/request; view downtime history; export.
- **Inputs:** machine filter, date range, rerouting actions.
- **Outputs:** per machine: load %, queued work, utilization, downtime h, next free
  slot; recommended reroutes.
- **ERP integration:** reads `Machine` + downtime and `ProductionRecord` from cache.
- **Approvals:** machine reroute → DH.
- **Notifications:** to DH when a machine exceeds utilization threshold; to
  Production for load spikes.
- **Reports:** `R-PLN-07 Capacity & Bottleneck`.

## 8.6 Screen: Work Order Creation (Planning → Production)
- **Roles:** PLNR, DH
- **Purpose:** Convert a planned production order into scheduled operations for the
  shop floor.
- **Actions:** Select production order; auto-generate work orders from operation
  routing + BOM (default times); assign operators/machines; set start/end slots;
  release to production (DH); send to offline queue for the floor; export.
- **Inputs:** production order, routing selection, per-operation machine/operator,
  planned qty, start/end times.
- **Outputs:** `WorkOrder` set (one per operation) with status `Scheduled`; released
  work orders push to Production (Section 9) as mobile tasks.
- **ERP integration:** pushes released project/work order to ERP; reads routing.
- **Approvals:** release → DH.
- **Notifications:** to assigned operators (their task list); to Production
  Supervisor on release.
- **Reports:** `R-PLN-08 Work Order List`.

## 8.7 Screen: Delayed Orders (Planning view)
- **Roles:** PLNR, DH, MGMT
- **Purpose:** Manage the delay backlog and its remediation.
- **Actions:** View all delayed orders with delay cause classification (material,
  capacity, quality, labor, machine, other); record/select reason; create action
  plan; mark resolved; escalate; export.
- **Inputs:** order, actual cause, action, owner, due date.
- **Outputs:** delay register: order, days overdue, cause, responsible, recovery date.
- **ERP integration:** reads SO + production actuals for delay computation.
- **Approvals:** cause classification → DH; escalation → MGMT.
- **Notifications:** to MGMT for delays > threshold (set in rules).
- **Reports:** `R-PLN-09 Delay Analysis`.

## 8.8 Screen: Feasibility Input (Planning supplies to Commercial)
- **Roles:** PLNR, DH
- **Purpose:** Provide planning's view on whether an order can be scheduled.
- **Actions:** Review FeasibilityResult from Order Intelligence (Section 17.4);
  correct capacity/material inputs with actuals; finalize recommended completion date;
  reply to commercial.
- **Inputs:** order ref, capacity availability, material availability, recommended date.
- **Outputs:** finalized feasibility, committed completion date.
- **ERP integration:** reads stock/machines; updates order estimate in cache.
- **Approvals:** DH.
- **Notifications:** to COMM on finalized decision.
- **Reports:** feeds `R-ORD-03`.

---

# 9. DEPARTMENT FRS — PRODUCTION

## 9.0 Department scope
Production executes the released work orders on the shop floor from mobile: start,
pause, resume, complete operations; record quantities, rejections, rework, downtime,
issues; update machine status. Production data flows back to the ERP as production
records.

### Roles
`OPER` Operator · `SUP` Supervisor · `DH` Production Head · `PLNR` (view) ·
`QINSP` (view) · `MGMT`.

## 9.1 Screen: My Tasks (operator home)
- **Roles:** OPER, SUP
- **Purpose:** The operator's single starting point: what do I do next?
- **Actions:** View assigned work orders (from Planning release); accept/claim a work
  order; start task; open task detail; mark done; report unavailable (reason) →
  unassign; view priority order.
- **Inputs:** accept/claim, status updates.
- **Outputs:** ordered list: work order, product, qty, operation, machine, planned
  time, status, priority, due time.
- **ERP integration:** reads work-order assignments (pushed from Planning).
- **Approvals:** claim is operator action; un-assign requires SUP.
- **Notifications:** new assignment; deadline approaching; reassignment.
- **Reports:** `R-PROD-10 Operator Performance`.

## 9.2 Screen: Work Order Execution
- **Roles:** OPER, SUP
- **Purpose:** Execute one operation on one work order with real progress capture.
- **Actions:** Start operation; pause; resume; complete operation (capture qty);
  record reject qty + reason; mark rework needed; report machine downtime (start/end,
  reason); add issue (description, photo); request material (→ Section 10.4);
  request inspection (→ Section 13).
- **Inputs:** action type; qty produced; reject qty; rework qty; downtime reason;
  issue text; photo/SKU scan; machine id.
- **Outputs:** operation status machine (`Started/Paused/Resumed/Completed`); running
  elapsed time; cumulative qty (required/completed/pending); machine status; quality
  flags; the operation flow:
  ```
  Operation notifications 1 ✓  2 ✓  3 70%  4 Pending
  ```
- **ERP integration:** posts completed qty + scrap to ERP `ProductionRecord` via
  Integration Layer on completion (and optionally on interim progress with
  configurable batch).
- **Approvals:** completing final operation auto-triggers inspection request (Quality);
  scrap above threshold requires QINSP/SUP approval; overtime/rework plan requires SUP.
- **Notifications:** to SUP on completion, pause > threshold, rejections, downtime;
  to Planning on material issue; to QC on inspection request auto-sent.
- **Reports:** `R-PROD-01 Production Entry Register`, `R-PROD-02 Rejection Register`.

## 9.3 Screen: Production Progress (dashboard & drill)
- **Roles:** SUP, DH, MGMT, PLNR
- **Purpose:** See how production is advancing against plan in real time.
- **Actions:** View today's production (target vs actual, per line/machine/product);
  drill into a product's operations; drill into an order; overrides (SUP/DH).
- **Inputs:** filters (date, line, product, order), drill navigation.
- **Outputs:** e.g.
  ```
  PRODUCT X     Required 500   Completed 320   Pending 180
  Op 1 ✓   Op 2 ✓   Op 3 70%   Op 4 Pending
  ```
  plus target-vs-actual %, throughput, OEE where data available.
- **ERP integration:** reads production actuals; computes progress platform-side.
- **Approvals:** none (view/override exceptions logged).
- **Notifications:** (computed) threshold alerts per rules.
- **Reports:** `R-PROD-03 Production Progress`, `R-PROD-04 Target Vs Actual`.

## 9.4 Screen: Machine Status & Downtime
- **Roles:** OPER, SUP, DH, MGMT
- **Purpose:** Track machine state and losses.
- **Actions:** Set machine status (running/stopped/down/maintenance/QC hold);
  record downtime event (start/end, reason, root cause); view downtime log; request
  maintenance (→ Engineering/Admin); view utilization.
- **Inputs:** machine, status, downtime start/end, reason, root-cause category.
- **Outputs:** machine register with live status, downtime duration, utilization %,
  MTBF/MTTR (computed), maintenance requests.
- **ERP integration:** reads machine master from cache; pushes machine status if ERP
  tracks it.
- **Approvals:** maintenance request → SUP/DH.
- **Notifications:** to DH on downtime > threshold; to Engineering on maintenance
  request.
- **Reports:** `R-PROD-05 Machine Downtime`, `R-PROD-06 Machine Utilization`.

## 9.5 Screen: Operator Work & Assignment
- **Roles:** SUP, DH
- **Purpose:** Manage who works on what.
- **Actions:** View operator roster (absences, attendance, shift); assign/reassign work
  orders; transfer tasks; view operator's current/in-flight work.
- **Inputs:** operator, work order, action.
- **Outputs:** roster vs workload; per-operator assigned/current/completed counts.
- **ERP integration:** attendance from platform `Attendance`; no ERP write.
- **Approvals:** reassignment → DH (cross-section).
- **Notifications:** to operators when re-assigned.
- **Reports:** `R-PROD-10 Operator Performance`.

## 9.6 Screen: Issues & Escalation (production floor)
- **Roles:** OPER, SUP, DH, PLNR, QINSP
- **Purpose:** Capture anything blocking the floor with evidence.
- **Actions:** Create issue (type: material, quality, machine, manpower, method,
  safety); add photo/description; assign owner department; track status; escalate
  if unresolved after SLA; close with resolution note.
- **Inputs:** issue type, description, photos, owner, priority, SLA, resolution note.
- **Outputs:** issue register with SLA countdown and status timeline.
- **ERP integration:** none (platform-owned).
- **Approvals:** escalation → DH; closure → SUP.
- **Notifications:** assignee on create; DH on escalation; escalator on resolution.
- **Reports:** `R-PROD-07 Issue Register`.

## 9.7 Screen: Quality Triggers (production → quality handoff)
- **Roles:** SUP, QINSP
- **Purpose:** Request inspection on a finished (or in-process) lot.
- **Actions:** Trigger QC request on lot (auto on final-ops completion); select
  inspection type; attach work order; view QC result (pass/retain/reject);
  on rejection → return to rework or scrap disposition.
- **Inputs:** lot/work order, inspection type.
- **Outputs:** QC request with result and disposition; rework work order creation.
- **ERP integration:** reads production records; posts inspection result if ERP
  requires.
- **Approvals:** disposition (rework/scrap) → QINSP (+ SUP above threshold).
- **Notifications:** to QC on request; to Production on result.
- **Reports:** feeds `R-QC-*` (Section 13).

## 9.8 Screen: Production Dashboard (dept. home)
- **Roles:** SUP, DH, MGMT
- **Purpose:** Department KPIs at a glance with drill-down.
- **Actions:** View KPIs (orders active, completion %, delayed, downtime); drill
  Company → Department → Process → Order → Product → Component → Material; export.
- **Inputs:** drill navigation, date range.
- **Outputs:** today's production, target vs actual, active orders, delayed orders,
  pending operations, machine status, downtime, rejection, rework, progress, quality.
- **ERP integration:** computed from ERP + platform operational data.
- **Approvals:** none.
- **Notifications:** none.
- **Reports:** `R-PROD-08 Daily Production Report`.

---

# 10. DEPARTMENT FRS — STORES / INVENTORY

## 10.0 Department scope
Stores answers the five inventory questions — *what do we have, what is being
consumed, what is reserved, what is coming, what will become a shortage* — and
executes all physical stock movements from mobile with barcode/QR scanning. The
**Inventory Intelligence** engine (Section 17.5) plugs into this department's data.

### Roles
`STORE` Stores Operator · `STK` Stock Counter · `SUP` Stores Supervisor ·
`DH` Stores Head/Manager · `PLNR`/`PUR`/`PROD` (view) · `MGMT`.

## 10.1 Screen: Stock & Availability
- **Roles:** STORE, SUP, DH, PUR, PLNR, MGMT
- **Purpose:** Instant answer to "what do we have?"
- **Actions:** Search item (code/name/scan); view availability card; filter by
  warehouse; view item history; export. Drill item → raw material profile.
- **Inputs:** item search/scan, warehouse, date range.
- **Outputs:** per item: on-hand, available (= on-hand − reserved), reserved, in
  transit, expected receipt date (from open PO), minimum stock, reorder point, stock
  status badge (OK/Watch/Shortage/Excess), dead/slow flags (Section 17.5).
- **ERP integration:** reads `OnHandStock`, `InventoryTransaction`, open POs from cache.
- **Approvals:** none (view).
- **Notifications:** rule-driven shortage/excess alerts (Section 17.2).
- **Reports:** `R-INV-01 Stock Register`, `R-INV-02 Availability`.

## 10.2 Screen: Inward / Goods Receipt
- **Roles:** STORE, SUP, DH, QINSP (view on hold), MGMT (view)
- **Purpose:** Receive incoming material against PO / GRN / return.
- **Actions:** Scan PO/GRN; scan item barcodes; capture received qty, batch, expiry
  (if relevant), bin/location; photograph damage; submit for QC (auto if QC required);
  put-away to bin; confirm receipt (posts to ERP); print label.
- **Inputs:** PO/GRN ref, item, qty, batch, bin, condition notes, photos.
- **Outputs:** `InwardReceipt` with status; stock updated in ERP after posting;
  QC-hold flag if QC required.
- **ERP integration:** WRITE — posts GRN/stock receipt to ERP via Integration Layer
  and receives ERP transaction ref; READ — PO lines.
- **Approvals:** receipt posting by STORE; QC-hold release → QINSP; over-receipt vs PO
  → DH.
- **Notifications:** to PUR on receipt (closes expectation); to QINSP on QC-hold items;
  to DH on over-receipt/variance.
- **Reports:** `R-INV-03 Inward Register`.

## 10.3 Screen: Outward / Issue
- **Roles:** STORE, SUP, DH
- **Purpose:** Issue material to production or departments (against requests or
  requisitions).
- **Actions:** Select material request (Section 10.4); scan item + bin; enter issued
  qty; confirm issue (posts to ERP as inventory transaction against department/cost
  center); partial issue with pending balance; return material (issue reversal);
  print issue slip.
- **Inputs:** request/dept ref, item, qty, bin, reason.
- **Outputs:** `OutwardIssue`; ERP stock movement recorded; request balance updated.
- **ERP integration:** WRITE — posts issue transaction to ERP.
- **Approvals:** issue above configured qty threshold → SUP/DH; return requires DH.
- **Notifications:** to requester when issued/partially issued; to DH on
  threshold breach.
- **Reports:** `R-INV-04 Issue Register`, `R-INV-05 Consumption`.

## 10.4 Screen: Material Request (consuming departments create; Stores fulfils)
- **Roles:** OPER, PLNR, ENG, COMM (create) · STORE/SUP/DH (fulfil/approve)
- **Purpose:** Standard, auditable "ask for material" instead of informal notes.
- **Actions:** Create request (item, qty, for DO/order/work order); submit (auto
  approval workflow depending on value/type, Section 17.1); approve; reserve stock;
  issue (see 10.3); partial fulfil; mark fulfilled/closed; view request status;
  request history per item.
- **Inputs:** items, qty, purpose ref (work order/order/project), priority,
  required date.
- **Outputs:** `MaterialRequest` with lines and lifecycle status; reservation record.
- **ERP integration:** reservation and transactions post to ERP on issue.
- **Approvals:** value- or category-based routing: SUP → DH → MGMT (configurable,
  Section 17.1).
- **Notifications:** approvers on submit; requester on approve/reject/issue;
  Stores on high-priority requests.
- **Reports:** `R-INV-06 Material Request Register`.

## 10.5 Screen: Transfers
- **Roles:** STORE, SUP, DH
- **Purpose:** Move stock between warehouses/bins.
- **Actions:** Select from/to warehouse; scan items; qty; submit transfer; approve
  (SUP); execute (STORE dest.); adjust.
- **Inputs:** from/to, item, qty, bin.
- **Outputs:** `Transfer` with status; ERP stock movement on execution.
- **ERP integration:** WRITE — posts transfer transaction to ERP.
- **Approvals:** SUP; DH if between cost centers.
- **Notifications:** destination stores on available-to-receive.
- **Reports:** `R-INV-07 Transfer Register`.

## 10.6 Screen: Stock Verification / Counting (Stock Take)
- **Roles:** STK, STORE, SUP, DH
- **Purpose:** Physical count vs system, with variance handling.
- **Actions:** Generate stock-count plan (cycle count by ABC/class, or full count);
  assign counters; scan item; record counted qty; submit count; approve variances;
  post adjustment to ERP; investigate/adjudicate discrepancies.
- **Inputs:** counted qty per item/bin, photos/notes for variance.
- **Outputs:** `StockCountLine` count vs system vs variance; adjustment posting;
  summary of variance by item/category.
- **ERP integration:** WRITE — posts stock adjustment to ERP (requires approval).
- **Approvals:** variance adjustment → SUP/DH (above threshold → DH); count sign-off
  → DH.
- **Notifications:** to STK with assignments; to DH on variance > threshold; to PUR
  on shrinkage implications.
- **Reports:** `R-INV-08 Stock Count Summary`, `R-INV-09 Variance Report`.

## 10.7 Screen: Item → Product Intelligence (availability for planning)
- **Roles:** PLNR, DH, STORE, MGMT
- **Purpose:** "Given current materials, what can we actually produce?"
- **Actions:** Select product; view BOM requirement vs availability; compute feasible
  units; drill component shortage; view per-product feasibility list; export.
- **Inputs:** product/order filter.
- **Outputs:**
  ```
  Available Product Capacity
  Product A ██████████████ 72 units
  Product B ███████ 35 units
  Product C ████████████ 61 units
  ```
  plus per-component detail (required vs on-hand vs reserved vs available) computed by
  Production Feasibility Engine (Section 17.5).
- **ERP integration:** reads item stock, reservations, BOM from cache.
- **Approvals:** none.
- **Notifications:** rule alerts when a product's feasible count drops below open
  order demand (Section 17.2).
- **Reports:** `R-INV-10 Feasibility`, `R-INV-11 Product Availability`.

## 10.8 Screen: Shortage & Consumption Intelligence
- **Roles:** DH, PUR, PLNR, MGMT
- **Purpose:** Manage expected shortages and consumption trends (Inventory
  Intelligence, Section 17.5).
- **Actions:** View shortage forecast (item, expected shortage date, qty, source);
  confirm/convert to purchase requirement (→ PUR); view consumption trends per item;
  set min/max/reorder parameters (DH); view dead & slow movers.
- **Inputs:** action: convert to procurement requirement; parameter updates (min,
  max, reorder point, lead-time factor).
- **Outputs:** shortage list with expected dates and urgency; consumption curves;
  ABC classification; dead/slow stock list with value.
- **ERP integration:** reads stock, POs, transactions for history; writes nothing
  (procurement flows through Section 11).
- **Approvals:** parameter changes → DH; converting to PR → PUR review.
- **Notifications:** shortage alerts to Stores + Purchase Manager (Section 17.2).
- **Reports:** `R-INV-12 Shortage Forecast`, `R-INV-13 Consumption Trend`,
  `R-INV-14 Dead & Slow Moving`.

## 10.9 Screen: Stores Dashboard (dept. home)
- **Roles:** STORE, SUP, DH, MGMT
- **Purpose:** Stores KPIs and operations status.
- **Actions:** View KPIs (stock value, shortage count, pending requests, variance
  pending, inward/outward today); drill into any KPI; export.
- **Inputs:** date range, drill navigation.
- **Outputs:** inventory value, open material requests, shortage alerts, pending
  receipts, today's movements, stock accuracy (post-count).
- **ERP integration:** computed from ERP stock data + platform stock ops.
- **Approvals:** none.
- **Notifications:** none.
- **Reports:** `R-INV-15 Stores Daily Report`.

---

# 11. DEPARTMENT FRS — PURCHASE / PROCUREMENT

## 11.0 Department scope
Procurement converts requirements (from shortage detection, MRP, material requests,
planned production) into approved purchase orders inside the ERP, tracks supplier
performance, and closes the loop on receipts.

### Roles
`PUR` Purchase Officer · `SUP` Purchase Supervisor · `DH` Purchase Head/Manager ·
`MGMT` · `STORE` (receiving) · `PLNR` (requirement source) · `COMM` (view).

## 11.1 Screen: Procurement Requirements
- **Roles:** PUR, DH, PLNR, STORE, MGMT
- **Purpose:** Consolidated list of what must be bought and why.
- **Actions:** View requirements (item, required qty, need date, source
  order/shortage/min-stock/prediction, priority); group/merge requirements; reject
  requirement (+ reason); accept and convert to purchase requisition; export.
- **Inputs:** grouping/filter options; accept/reject; reason.
- **Outputs:** requirements register with shortage context and urgency.
- **ERP integration:** reads stock, open POs, MRP output if ERP exposes it; consumes
  `ProcurementRequirement` rows.
- **Approvals:** rejection → DH; merged PR above threshold → DH.
- **Notifications:** to PUR on new requirement (from Inventory Intelligence);
  to PLNR on reject.
- **Reports:** `R-PUR-01 Procurement Requirement Register`.

## 11.2 Screen: Purchase Requisition
- **Roles:** PUR, DH, MGMT
- **Purpose:** Formal, approved request to buy (pre-PO).
- **Actions:** Create PR from requirements or manually; add lines (item, qty, need
  date, source, remarks); submit for approval (Section 17.1); approve/reject; convert
  approved PR → PO in ERP (Integration Layer); view status; print.
- **Inputs:** lines, supplier preference, required date, budget/cost center, remarks.
- **Outputs:** approved `PurchaseRequisition`; converted ERP PO number.
- **ERP integration:** WRITE — creates PO in ERP via Integration Layer and returns
  ERP PO number; READ — supplier/item master, open POs.
- **Approvals:** value-based workflow: PUR → SUP → DH → MGMT (thresholds configurable).
- **Notifications:** approvers on submit; creator on decision; reminder on SLA expiry.
- **Reports:** `R-PUR-02 Requisition Register`, `R-PUR-03 Requisition Vs PO`.

## 11.3 Screen: Purchase Orders
- **Roles:** PUR, DH, MGMT, STORE, PLNR (view)
- **Purpose:** Track all POs to suppliers (master data stays in ERP).
- **Actions:** Filter by supplier/status/date/item; view PO detail (lines, qty,
  receipt status, age); raise PO-change; expedite (remind supplier, record follow-up);
  mark for expedite escalation; view receipts per PO; close PO; export.
- **Inputs:** filters; change requests; expedite actions + notes.
- **Outputs:** PO register: number, supplier, lines, expected date, received qty,
  open qty, status, days open, delivery performance.
- **ERP integration:** reads `PurchaseOrder` + receipts from cache; PO changes/writes
  via Integration Layer.
- **Approvals:** PO change above threshold → DH; cancellation → DH.
- **Notifications:** to PUR on receipt (STORE inward), on late delivery (rule), to DH
  on escalation.
- **Reports:** `R-PUR-04 PO Register`, `R-PUR-05 PO Aging`, `R-PUR-06 Expedite List`.

## 11.4 Screen: Supplier Management
- **Roles:** PUR, DH, MGMT
- **Purpose:** Supplier master is ERP-owned; platform adds performance view.
- **Actions:** Search supplier; view supplier profile (lines, POs, receipts);
  view supplier score (OTIF, defect %, lead-time adherence); internal notes;
  blacklist/flag; export.
- **Inputs:** search; internal notes; flags.
- **Outputs:** supplier card: contact, address, items supplied, open POs, score
  computed from receipts/performance, risk flag.
- **ERP integration:** reads `Supplier` master and PO/receipt history from cache.
- **Approvals:** blacklist/flag → DH.
- **Notifications:** to DH on repeated failure flags (rule).
- **Reports:** `R-PUR-07 Supplier Performance`, `R-PUR-08 Supplier Score`.

## 11.5 Screen: Receipt Matching & Close Loop
- **Roles:** PUR, STORE, DH
- **Purpose:** Match STORE inward receipts to PO lines, resolve variances (qty/price),
  close POs.
- **Actions:** View PO vs receipt variance; approve variance (price/quantity); close
  PO line; open dispute note; view GRN/PO/Invoice 3-way match where ERP exposes it.
- **Inputs:** variance resolutions, notes.
- **Outputs:** 3-way matching status per line; cleared PO; dispute register.
- **ERP integration:** reads receipts and invoices; confirmed receiver postings.
- **Approvals:** price variance → DH; qty over-receipt → DH; PO closure → PUR.
- **Notifications:** to PUR on unmatched receipt; to STORE on rejected variance.
- **Reports:** `R-PUR-09 3-Way Match`, `R-PUR-10 Purchase Variances`.

## 11.6 Screen: Purchase Dashboard (dept. home)
- **Roles:** PUR, DH, MGMT
- **Purpose:** Procurement KPIs and attention items.
- **Actions:** View KPIs (open POs, aging, supplier score, shortages covered,
  pending receipts, PO vs requirement coverage); drill; export.
- **Inputs:** date range, drill.
- **Outputs:** open PO value, aging buckets, expected receipts this week, unresolved
  requirements, delivery performance trend.
- **ERP integration:** computed from ERP PO/receipt data.
- **Approvals:** none.
- **Notifications:** none.
- **Reports:** `R-PUR-11 Purchase Daily Report`.

---

# 12. DEPARTMENT FRS — LOGISTICS / DISPATCH

## 12.0 Department scope
Logistics moves finished goods out: dispatch planning, packing, vehicle/transporter,
in-transit tracking, proof of delivery. All from mobile with photos and signatures.

### Roles
`LOG` Logistics Operator/Driver · `SUP` Logistics Supervisor · `DH` Logistics
Head/Manager · `COMM` (view for commitment) · `MGMT`.

## 12.1 Screen: Dispatch Plan
- **Roles:** LOG, SUP, DH, COMM (view), MGMT
- **Purpose:** What is scheduled to leave, when, to whom.
- **Actions:** View dispatch queue (orders ready / packed / in-transit); schedule
  dispatch slot; select transporter/vehicle; assign driver; print delivery note /
  packing list; confirm dispatch (posts to ERP); adjust schedule; export.
- **Inputs:** order, slot date/time, transporter, vehicle no., driver, delivery note ref.
- **Outputs:** dispatch schedule: order, customer, qty, slot, vehicle, driver, status,
  dispatch no.
- **ERP integration:** WRITE — confirms dispatch/despatch in ERP, returns ERP dispatch
  no.; READ — SOs, goods-ready status from production.
- **Approvals:** slot changes → SUP; dispatch confirmation uses the approved gate
  (DH for high-value orders).
- **Notifications:** to COMM when dispatch confirmed; to DH on schedule slip.
- **Reports:** `R-LOG-01 Dispatch Schedule`, `R-LOG-02 Packing List`.

## 12.2 Screen: Dispatch Execution (mobile, driver/logistics)
- **Roles:** LOG, SUP
- **Purpose:** Execute a dispatch on the move.
- **Actions:** Load vehicles (scan/confirm qty loaded); start trip; update status
  (departed, arrived, delivered, partial, refused); upload GPS/location when enabled;
  capture proof-of-delivery (signature + photo); record delivery exceptions (damage,
  short, late, customer refusal + reason); complete trip.
- **Inputs:** dispatch ref, load confirmation, status updates, photos, signature,
  exception type + reason.
- **Outputs:** `ShipmentTrack` timeline, `POD` records, exception register.
- **ERP integration:** WRITE — dispatch confirmation and POD info posted to ERP if it
  tracks it; READ — customer delivery address.
- **Approvals:** exception (refusal/damage) → SUP; completed POD auto-closes dispatch.
- **Notifications:** to DH on delivery exception; to COMM on delayed delivery; to
  customer via configured channel (optional).
- **Reports:** `R-LOG-03 Trip Report`, `R-LOG-04 POD Register`.

## 12.3 Screen: Delivery / Shipment Status (mobile)
- **Roles:** LOG, SUP, DH, COMM (view), MGMT
- **Purpose:** Where is every in-transit shipment right now?
- **Actions:** View shipment live status; filter by status; see delivery exceptions;
  drill order → customer → dispatch → trip → POD.
- **Inputs:** filters, drill.
- **Outputs:** shipment board: order, dispatch no., customer, transporter, vehicle,
  current status, ETA, POD flag.
- **ERP integration:** reads dispatch info; logistics-only data platform-owned.
- **Approvals:** none.
- **Notifications:** status-change pushes to followers.
- **Reports:** `R-LOG-05 Dispatch Vs Commit`.

## 12.4 Screen: Transporter & Vehicle Register
- **Roles:** LOG, SUP, DH
- **Purpose:** Manage transporters, vehicles, drivers (ERP may hold; platform tracks
  dispatch capacity).
- **Actions:** View transporter/vehicle/driver master; track trip history per
  transporter; mark vehicle availability; assign vehicle to slot; evaluate transporter
  ON-TIME performance.
- **Inputs:** vehicle availability flags, assignments, notes.
- **Outputs:** transporter score, vehicle calendar, driver register.
- **ERP integration:** reads transporter master if ERP has it.
- **Approvals:** new transporter/vendor → DH.
- **Notifications:** to DH on transporter underperformance.
- **Reports:** `R-LOG-06 Transporter Performance`.

## 12.5 Screen: Logistics Dashboard (dept. home)
- **Roles:** LOG, SUP, DH, MGMT
- **Purpose:** Logistics KPIs.
- **Actions:** View KPIs (dispatches today, in-transit, PODs pending, exceptions,
  dispatch vs committed); drill; export.
- **Inputs:** date range, drill.
- **Outputs:** dispatch count/value today, in-transit count, pending PODs, exception
  count, on-time delivery %.
- **ERP integration:** computed from ERP dispatch + platform trip data.
- **Approvals:** none.
- **Notifications:** none.
- **Reports:** `R-LOG-07 Logistics Daily Report`.

---

# 13. DEPARTMENT FRS — QUALITY

## 13.0 Department scope
Quality inspects materials (inward), in-process and finished production lots, records
results, and decides disposition (pass / retain / rework / scrap). Inspection results
feed production, dispatch, and supplier scores.

### Roles
`QINSP` Quality Inspector · `SUP` QC Supervisor · `DH` Quality Head · `PROD`/`STORE`
(interact) · `MGMT`.

## 13.1 Screen: Inspection Queue
- **Roles:** QINSP, SUP, DH
- **Purpose:** Everything awaiting inspection (inward lots, finished lots, rework
  lots).
- **Actions:** View queue by source (inward / production / dispatch pre-check);
  filter by priority/type; claim/assign inspection; open inspection form.
- **Inputs:** filters, assignment.
- **Outputs:** queue with source ref, item/product, qty, submitted by, priority,
  SLA countdown.
- **ERP integration:** reads production records, receipts from cache.
- **Approvals:** none.
- **Notifications:** on new QC request (from Receipts / Production handoff).
- **Reports:** `R-QC-01 Inspection Register`.

## 13.2 Screen: Inspection Execution (mobile)
- **Roles:** QINSP, SUP
- **Purpose:** Record an inspection with results and evidence.
- **Actions:** Open inspection form (type-specific: dimension, visual, material,
  packing, First Article); enter qty inspected; record ok / reject qty; add
  observations; attach photos; set result (pass / retain / reject); route result
  action (release inward, allow operation continue, hold finished lot); sign-off.
- **Inputs:** qty inspected, ok/reject, observations, photos, result, disposition.
- **Outputs:** `QualityCheck`; result action; disposition to Production (rework task)
  or Stores (GRN release) or Dispatch gate (release/hold).
- **ERP integration:** WRITE — posted inspection result to ERP if it demands;
  READ — lot/work order/receipt context.
- **Approvals:** disposition (scrap) → SUP; release of retained stock → SUP;
  concession/waiver → DH.
- **Notifications:** to Production on rework required; to Stores on GRN release /
  rejection; to PUR on supplier rejections (feeds score).
- **Reports:** `R-QC-02 Inspection Results`, `R-QC-03 First-Pass Yield`.

## 13.3 Screen: Quality Issue / NCR (Non-Conformance)
- **Roles:** QINSP, SUP, DH, PROD (view), ENG (view)
- **Purpose:** Manage non-conformances to root cause and closure.
- **Actions:** Raise NCR (ref, source, defect, qty, evidence); classify severity;
  assign root-cause investigation (Production/Engineering); record correction +
  corrective action (CAPA); verify effectiveness; close; escalate as needed.
- **Inputs:** NCR fields, defect code, severity, root cause, CAPA, verification note.
- **Outputs:** NCR register with timestamps per phase; quality score feeds.
- **ERP integration:** none required (platform-owned).
- **Approvals:** NCR closure → SUP/DH; concession → DH.
- **Notifications:** assignees; Production on CAPA; MGMT on critical severity;
  escalation reminder by SLA.
- **Reports:** `R-QC-04 NCR Register`, `R-QC-05 CAPA Status`, `R-QC-06 Defect Pareto`.

## 13.4 Screen: Quality Dashboard (dept. home)
- **Roles:** QINSP, SUP, DH, MGMT
- **Purpose:** Quality KPIs.
- **Actions:** View KPIs (first-pass yield, reject %, NCR open, inspections pending,
  supplier defect %); drill into products/orders; export.
- **Inputs:** date range, filters.
- **Outputs:** FPYP trend, rejection % by product/process, open NCR aging, supplier
  quality, pre-dispatch QC status.
- **ERP integration:** computed from QC inspections + production records.
- **Approvals:** none.
- **Notifications:** none.
- **Reports:** `R-QC-07 Quality Report`.

---

# 14. DEPARTMENT FRS — ENGINEERING / R&D

## 14.0 Department scope
Engineering manages product information, BOM/master data change, engineering change
requests, drawings and documents, revision control and approval. It maintains the
engineering validity behind BOM and routing used by Planning/Production.

### Roles
`ENG` Engineer · `SUP` Engineering Supervisor · `DH` Engineering Head · `PLNR`/`PROD`
(view/consume) · `MGMT`.

## 14.1 Screen: Product & BOM Information
- **Roles:** ENG, PLNR, DH, MGMT; OPER view read-only for reference
- **Purpose:** Single place to see a product, its BOM, and its engineering context.
- **Actions:** Search product (code/name/scan); view BOM tree
  (Product → Component → Item × qty); view item attributes; view linked drawings &
  revisions; export BOM; flag BOM for change.
- **Inputs:** product search; navigation.
- **Outputs:** BOM tree with quantities per unit, item type, revision, source status.
- **ERP integration:** reads `Product`, `BOM`, `Item` from cache (authoritative in ERP).
- **Approvals:** none.
- **Notifications:** none.
- **Reports:** `R-ENG-01 BOM Listing`, `R-ENG-02 BOM Compare`.

## 14.2 Screen: Engineering Change Request & Approval (ECR/ECN)
- **Roles:** ENG, DH, PLNR (impact view), MGMT (high impact), STORE view
- **Purpose:** Structured, audited change to product/BOM/master data.
- **Actions:** Create ECR (product, change type: BOM/item/qty/process/drawing, reason,
  attachments); impact assessment (affected orders, stock, pending production);
  submit for approval; approve/reject (ECN); after approval sync changed master to ERP
  via Integration Layer; track effective date; notify affected departments.
- **Inputs:** product, change fields, reason, attachments, impact scope.
- **Outputs:** ECR/ECN record with revision and effective date; ERP master update.
- **ERP integration:** WRITE — approved ECN pushes item/BOM change to ERP (subject to
  ERP capability); READ — item/BOM for impact.
- **Approvals:** DH (routine), MGMT (customer-facing or safety-critical); cross-check
  by Planning on pending-work impact.
- **Notifications:** DH on submit; originator on decision; Planning + Stores on
  effective date.
- **Reports:** `R-ENG-03 ECN Register`, `R-ENG-04 Change Impact`.

## 14.3 Screen: Engineering Requests (from Production/others)
- **Roles:** ENG, DH, PROD (view), MGMT
- **Purpose:** Capture floor/design requests (drawing needed, spec query, tooling
  change).
- **Actions:** Create/raise request (type, description, source ref); route to
  appropriate engineer; accept/assign; work; reply/attach; close; SLA-track.
- **Inputs:** request details, attachments, assignee.
- **Outputs:** request register with status.
- **ERP integration:** none.
- **Approvals:** assignment → SUP/DH; closure → requestor + DH.
- **Notifications:** assignee; requestor on completion; DH on SLA breach.
- **Reports:** `R-ENG-05 Engineering Request Register`.

## 14.4 Screen: Documents & Revision Control
- **Roles:** ENG, DH, MGMT; read for all depts
- **Purpose:** Version-controlled repository for drawings, specs, datasheets,
  ISO/QC docs.
- **Actions:** Upload document (drawing/spec/datasheet); set type, revision,
  supersedes; link to product/order; submit for approval; approve/reject; view
  revision history; download with permission; mark obsolete.
- **Inputs:** file, metadata, revision, linked refs.
- **Outputs:** `Document` with version history and status; revision diff note.
- **ERP integration:** optional link to ERP item attachments.
- **Approvals:** document approval → DH (or designated document controller).
- **Notifications:** approvers; subscribers on new revision.
- **Reports:** `R-ENG-06 Document Register`.

## 14.5 Screen: Engineering Dashboard (dept. home)
- **Roles:** ENG, SUP, DH, MGMT
- **Purpose:** Engineering KPIs.
- **Actions:** View KPIs (open ECRs, pending requests, documents pending approval,
  ECN this month); drill; export.
- **Inputs:** date range, filters.
- **Outputs:** ECR backlog, request aging, document approval queue, released ECNs.
- **ERP integration:** reads master change logs where available.
- **Approvals:** none.
- **Notifications:** none.
- **Reports:** `R-ENG-07 Engineering Status`.

---

# 15. DEPARTMENT FRS — HR / ADMIN

## 15.0 Department scope
HR maintains employees, departments, roles, attendance, leave, tasks and the central
"approval of who can do what". Employee *activity* is operational accountability, not
surveillance (Section 5 / 20).

### Roles
`HR` HR/Admin Officer · `SUP` Supervisor (attendance edit) · `DH` HR Head/Manager ·
`ADMIN` Platform Administrator · all employees (self-service subset) · `MGMT`.

## 15.1 Screen: Employee Directory
- **Roles:** HR, DH, MGMT; others read basic profile
- **Purpose:** Authoritative employee + department + role + manager structure for the
  RBAC and task assignment.
- **Actions:** Search employee (name/code/dept/role); view profile (department, role,
  manager, phone, email, skills, shift, active); export.
- **Inputs:** search/filter; export.
- **Outputs:** directory card + organization map (who reports to whom).
- **ERP integration:** optional sync of payroll master if ERP holds HR (adapter).
- **Approvals:** none.
- **Notifications:** none.
- **Reports:** `R-HR-01 Employee Directory`.

## 15.2 Screen: Employee Onboarding/Offboarding
- **Roles:** HR, DH, MGMT, ADMIN
- **Purpose:** Create platform users/employees and grant initial permissions.
- **Actions:** Create employee (name, code, dept, role, manager, shift, contact);
  create linked `User` with initial password; assign role/permissionset; set
  departments and manager; deactivate on exit (preserve history); reactivate.
- **Inputs:** employee fields, role, manager, permissionset, active flag.
- **Outputs:** `Employee` + `User` records; RBAC applied.
- **ERP integration:** if HR rolls into ERP, profile is read from cache; platform
  adds operational role. Bidirectional only where ERP allows.
- **Approvals:** DH for role/permission change; ADMIN for admin roles.
- **Notifications:** new user welcome with credentials policy.
- **Reports:** `R-HR-02 Headcount`.

## 15.3 Screen: Roles & Permissions Management
- **Roles:** ADMIN, HR, DH (view)
- **Purpose:** Configure who can view/create/edit/approve/export/admin per module.
- **Actions:** View roles; edit permission matrix (per module × action); create
  custom role; assign role to employee; audit permission changes.
- **Inputs:** role edits, permission grid edits, assignments.
- **Outputs:** updated `Role`/`Permission` set applied immediately; change audited.
- **ERP integration:** none.
- **Approvals:** permission change → ADMIN log; elevated permission grant → MGMT
  sign-off (audit).
- **Notifications:** employee notified when permissions change (security).
- **Reports:** `R-HR-03 Permissions Audit`.

## 15.4 Screen: Attendance
- **Roles:** all employees (self) · HR, SUP, DH (manage) · MGMT (view)
- **Purpose:** Check-in/out, breaks, day status; basis for labor analytics.
- **Actions:** Check-in; check-out; start/end break (optional); view own month
  calendar; supervisor/HR edit with reason (audited); approve corrections.
- **Inputs:** check-in/out; break actions; correction reason.
- **Outputs:** attendance card per employee/day; monthly summary; lateness/absentees.
- **ERP integration:** optional handoff to payroll system (adapter).
- **Approvals:** correction edit → SUP then HR; bulk approval → HR.
- **Notifications:** to SUP/HR on anomalies (early-out, overtime entry).
- **Reports:** `R-HR-04 Attendance Register`, `R-HR-05 Leave Register`.

## 15.5 Screen: Leave & Leave Approval
- **Roles:** all employees (apply) · SUP, DH, HR, MGMT (approve)
- **Purpose:** Standard leave workflow using the Workflow Engine (Section 17.1).
- **Actions:** Apply leave (type, from, to, days, reason, substitute); submit for
  approval; approve/reject; view balance; cancel; export.
- **Inputs:** dates, type, reason.
- **Outputs:** leave record, approval chain, balance update.
- **ERP integration:** optional handoff to payroll.
- **Approvals:** SUP → DH → HR/MGMT (by SLA/type, configurable).
- **Notifications:** approvers; applicant on decision; substitute on approval.
- **Reports:** `R-HR-05 Leave Register`.

## 15.6 Screen: Task Management (platform-wide)
- **Roles:** all with task rights + HR (view)
- **Purpose:** Assign, track, and report any human task across the platform.
- **Actions:** Create task (type, title, due, assignee, priority, refs); assign/
  reassign; update status; comment; attach; close; escalate; view my tasks.
- **Inputs:** task fields.
- **Outputs:** `Task` + status timeline; my-tasks queue (also on mobile home).
- **ERP integration:** none (platform-owned).
- **Approvals:** escalation → DH; closure → creator.
- **Notifications:** assignee; escalations; SLA reminders.
- **Reports:** `R-HR-06 Task Register`.

## 15.7 Screen: Approvals Center (HR/General)
- **Roles:** all approvers (by role) · HR, ADMIN (admin view)
- **Purpose:** One place to see all pending approvals assigned to me (leave,
  material, PO, dispatch, NCR, ECN…). Backed by Workflow Engine (Section 17.1).
- **Actions:** List pending approvals; filter by type; open entity; approve/reject
  with comment; delegate; add watcher; view approval history.
- **Inputs:** decision + comment; delegation target.
- **Outputs:** approval queue; history; SLA due indication.
- **ERP integration:** none (approval is platform-native; only *final* outcome is
  pushed to ERP where applicable).
- **Approvals:** this screen IS the approval channel.
- **Notifications:** due reminders; delegation notices.
- **Reports:** `R-HR-07 Approval Register`, `R-ADM-01 Approval SLA`.

## 15.8 Screen: Admin — Platform Administration
- **Roles:** ADMIN only
- **Purpose:** System-level configuration.
- **Actions:** Manage users/sessions/devices; manage notification rules; manage
  workflow definitions; manage sync jobs and integration status; manage document
  storage; system logs; data-retention & backup; feature flags; company profile.
- **Inputs:** configuration fields.
- **Outputs:** platform configuration; monitors.
- **ERP integration:** view sync health; manual re-sync triggers (Section 18).
- **Approvals:** high-impact config changes audited (two-person for destructive ops).
- **Notifications:** on sync failures and anomalies.
- **Reports:** `R-ADM-01 Approval SLA`, `R-ADM-02 Sync Health Report`.

## 15.9 Screen: HR Dashboard (dept. home)
- **Roles:** HR, DH, MGMT
- **Purpose:** HR/Admin KPIs.
- **Actions:** View KPIs (headcount, present/absent today, open leaves, pending
  approvals, employees without manager, tasks overdue); drill; export.
- **Inputs:** date range, drill.
- **Outputs:** headcount by dept, attendance %, leave pipeline, approval load.
- **ERP integration:** none.
- **Approvals:** none.
- **Notifications:** none.
- **Reports:** `R-HR-08 HR Summary`.

---

# 16. DEPARTMENT FRS — MANAGEMENT

## 16.0 Department scope
Management does not transact; it *sees* the whole company, drills anywhere, and
approves only the exceptional. Everything a manager sees is computed from operational
data (Principles #5).

### Roles
`MGMT` Management · `DH` (their department view) · `ADMIN` (config).

## 16.1 Screen: Executive Operations Overview (Dashboard Home)
- **Roles:** MGMT, DH
- **Purpose:** "What is happening in Manatec right now, what requires attention, and
  why?"
- **Actions:** View KPIs; drill down Company → Department → Process → Order → Product →
  Component → Material; set filters (date range, dept, product); save view; export.
- **Inputs:** filter controls, drill navigation.
- **Outputs:**
  ```
  MANATEC OPERATIONS
  Orders 126 | Production 84% | Inventory 91% | Pending Tasks 38
  Production Status ████████████████████░░░░ 84%
  Delayed Orders 7 | Material Alerts 13
  Department Status (Production / Stores / Logistics …)
  Today's Activities
  ```
  Each number drillable to the underlying records.
- **ERP integration:** computed live from ERP + platform operational data.
- **Approvals:** none.
- **Notifications:** none.
- **Reports:** `R-MGT-01 Executive Overview`, `R-MGT-02 Daily Digest`.

## 16.2 Screen: Order Control Center (management drill)
- **Roles:** MGMT, DH, COMM (view)
- **Purpose:** Answer "where is order #1234?" without asking five departments.
- **Actions:** Search order; view full status chain; drill material/machine/quality;
  flag attention; add executive note.
- **Inputs:** order search; attention flag reason.
- **Outputs:** Customer → Product → Required Qty → Current Production → Material
  Availability → Machine/Capacity → Expected Completion → Dispatch; each hop live and
  drillable.
- **ERP integration:** live read of order + production + stock + machine + dispatch.
- **Approvals:** none.
- **Notifications:** follow this order (status-change alerts).
- **Reports:** `R-ORD-10`, `R-MGT-03 Exceptional Orders`.

## 16.3 Screen: Department-By-Department Overview
- **Roles:** MGMT
- **Purpose:** One screen per department summarizing its health.
- **Actions:** Select department; view KPIs; drill to that department's dashboards
  (read-only for MGMT); export.
- **Inputs:** department selector, date range.
- **Outputs:** per department: today's production, pending tasks, delayed work,
  shortages, approvals pending, department status; cross-department compare.
- **ERP integration:** computed from ERP + platform data.
- **Approvals:** none.
- **Notifications:** none.
- **Reports:** `R-MGT-04 Department Status Matrix`.

## 16.4 Screen: Alerts & Escalations (management queue)
- **Roles:** MGMT, DH (view their dept)
- **Purpose:** Management sees only what needs attention and why.
- **Actions:** View alert feed (critical/urgent); open source record; resolve/ack;
  assign owner; escalate to CEO-quality board note; filter.
- **Inputs:** ack, owner assignment.
- **Outputs:** ranked alert list: order, delay, shortage, machine, NCR-critical,
  pending approvals — each with cause.
- **ERP integration:** alerts computed per rules (Section 17.2 / 18).
- **Approvals:** ack is acknowledgement (audited).
- **Notifications:** rule-pushed (Section 17.2).
- **Reports:** `R-MGT-05 Alert Register`.

## 16.5 Screen: People & Approvals (management)
- **Roles:** MGMT
- **Purpose:** Executive visibility into workforce state and their own approval queue.
- **Actions:** View pending approvals assigned to me; approve/reject with comment;
  view employee/capacity/department workload; drill into activity (Section 15).
- **Inputs:** decision + comment.
- **Outputs:** approval queue; department headcount; attendance; open tasks.
- **ERP integration:** none.
- **Approvals:** this screen executes approvals in the chain.
- **Notifications:** due reminders.
- **Reports:** `R-HR-07 Approval Register`.

## 16.6 Screen: Executive Analytics
- **Roles:** MGMT, DH
- **Purpose:** Trend and variance view (Analytics Layer, Section 17.6).
- **Actions:** Choose metric group (production, inventory, orders, lead time,
  department performance, material consumption, machine utilization, delay analysis);
  view trends; estimated vs actual; compare periods; filter/export.
- **Inputs:** metric, period, filters.
- **Outputs:** trend charts; **Estimated vs Actual** lead-time table (est 7 d / actual
  8.2 d / variance +1.2 d); department KPI trends; forecasts where available (Phase 8).
- **ERP integration:** analytics computed from historical ERP + platform data.
- **Approvals:** none.
- **Notifications:** none.
- **Reports:** `R-ANA-*` series (Section 17.6 / 21).

## 16.7 Screen: AI Management Assistant (Phase 8)
- **Roles:** MGMT, DH
- **Purpose:** Conversational insight over operational data (Recommendation, human
  approves).
- **Actions:** Ask in natural language ("Which orders are at risk of delay?", "Why is
  Order 1024 delayed?", "Which materials will be short next week?"); receive answer
  with data-backed explanation and fact links; request report; approve/reject a
  system-recommended action.
- **Inputs:** NL question; action decision.
- **Outputs:** answer with citations to records; recommended action → approval →
  execution (per Principle #8).
- **ERP integration:** reads operational + ERP data through sanctioned views only.
- **Approvals:** any action it proposes requires human approval (Phase 8 rule).
- **Notifications:** generated by its automation rules.
- **Reports:** auto-generated `R-AI-*`.

## 16.8 Screen: Management Reports Centre
- **Roles:** MGMT, DH
- **Purpose:** Scheduled + on-demand production of all reports (Section 21).
- **Actions:** Browse report library; run on-demand; schedule daily/weekly/monthly;
  subscribe; deliver (app/email); export; download; audit export history.
- **Inputs:** report selector, schedule, recipients, format.
- **Outputs:** generated reports (PDF/Excel), delivered to subscribers.
- **ERP integration:** reports combine ERP + platform data.
- **Approvals:** report access per RBAC; sensitive reports require MGMT.
- **Notifications:** on scheduled report delivery.
- **Reports:** this module administrers all R-* reports.

---

# 17. CROSS-CUTTING ENGINES

These engines are shared services, not features of one department. Each is
configurable, audited, and exposes APIs to every surface.

## 17.1 Workflow / Approval Engine

A configurable state machine. No approval workflow is hard-coded in a screen; every
workflow is defined in `Admin → Config` and instantiated per document.

**Workflow definition (config):**
```
name, entity_type
states: [state, allowed_actions[], transitions]
rules:  (trigger/policy)
levels: [order of approvers by value/category/dept]
escalation: [SLA, escalation path]
notify:  [events → recipients]
```

**Example — Material Request workflow:**
```
Material Request (creator)
  → Supervisor (value ≤ T)     OR Manager (value > T)
  → Stores (reservation/fulfil)
  → Purchase (auto-create requirement if stock short)
  → Manager Approval (if value > T2)
  → ERP (post transaction)
```

**Example — Purchase Requisition workflow:**
```
PUR creates PR
  → SUP approves
  → DH approves (value > T1)
  → MGMT approves (value > T2)
  → Integration Layer creates PO in ERP
  → notify creator + STORE
```

**Supported workflow types (same engine):** leave approval, purchase approval,
material request, production changes, engineering changes, order (feasibility)
approval, dispatch approval, expense/claims approval, stock-count variance approval,
document approval, supplier blacklist, GRN release, BOM/ECN approval.

**Mandatory behavior:**
- Every transition writes `WorkflowState` + `Approval` + `AuditLog` (actor, time,
  before/after).
- SLA per level with escalation automatically reassigns/escalates to next level.
- Rejection returns document to originator with reason; rework loop is configurable.
- Delegation is allowed (actor routes to authorized deputy with expiry).
- System actions (auto-follow-on) are recorded with actor = `system`.

## 17.2 Notification Engine

**Event → Rule → Channel → Recipient.** Rules are configurable in Admin.

**Rule example (Inventory < Minimum):**
```
IF item.onhand < item.min_stock          → notify [Stores] + [Purchase Manager]
IF pending days ≥ 5 and critical         → escalate to DH
```

**Rule example (Production Delay):**
```
IF production.order.delay > threshold     → notify [Planning] + [Manager] + request reason
```

Standard events: order accepted, work order released, operation completed,
production delay, material shortage detected, stock below min, GRN received, PO late,
dispatch confirmed, delivery exception, POD received, NCR raised (critical), QC
ready, approval pending/approved/rejected, approval SLA due, sync failure, robot
alert, ECN effective.

**Channels:** in-app notification center, mobile push (FCM/APNs), email, web
(realtime). Channel preference per user; critical alerts force push even if user
prefers email.

**Delivery guarantees:** exactly-once delivery for critical; read receipts for
approvals; retries with exponential backoff; failure logged.

## 17.3 Lead-Time Engine (dedicated service)

Not a formula inside a dashboard. A service consuming operational state.

**Conceptual composition:**
```
Lead Time = Material Availability
          + Procurement Time (if shortage)
          + Production Queue
          + Processing Time
          + Machine Availability
          + Quality / Inspection
          + Packing
          + Logistics
```

**Example evaluation per order:**
```
Order:
  Material available         → 0
  Production queue           → 2 d
  Manufacturing              → 3 d
  Inspection                 → 0.5 d
  Packing                    → 0.5 d
  Logistics                  → 1 d
  Estimated operational lead time → 7 d
```

**Actual formula:** must be calibrated to Manatec's real processes during Phase 0
(interviews + data). The service stores factors, not constants, so Manatec can tune
them.

**Estimated vs Actual learning:**
```
Estimated 7 d |  Actual 8.2 d | Variance +1.2 d  → stored per order (LeadTimeSnapshot)
```
Over time the engine recalibrates its factors from actuals (Phase 7/8).

**API exposed:** `estimateLeadTime(order)` → days + breakdown; `varianceReport(range)`.

## 17.4 Ordering / Order-Intelligence Engine

At order entry the system computes operational commitment:

```
CUSTOMER ORDER → Product → Qty → BOM → Material Check → Capacity →
Current Workload → Lead-Time Calculation → Expected Completion → Dispatch
```

**Answer to the commercial team:** "Can we accept this order, and what operational
constraints affect its expected completion?" Outputs constraint list, recommended
accept/reject, committed completion date. Reads: items, BOM, stock, reservations, open
orders, machine load, lead-time factors.

## 17.5 Inventory & Production Feasibility Intelligence

**Availability model per item:**
```
Available = On-hand − Reserved + Incoming(open PO with ETA) − Committed(planned)
```

**Item → Product expansion:**
```
PRODUCT A
├── Component A  → Item X × 2, Item Y × 3
├── Component B  → Item X × 1, Item Z × 4
└── Component C  → Item P × 2
```
Then per item: current inventory, reserved, available; the engine computes
**feasible units** of each product = min over all required components
(available_qty / requirement_per_unit). Plus: consumption rate, historical
consumption, required stock, minimum stock, expected shortage date, excess, dead/slow
flags, and production-feasibility per product:
```
Available Product Capacity  Product A ██████████████ 72 units
```

Outputs feed: Planning material constraints, Stores shortage alerts, Order
Intelligence feasibility, Pur requirement auto-generation, and the management
"what can we actually produce" question.

## 17.6 Analytics Layer

Runs on the operational + ERP data warehouse (Section 19). Metric groups: production
trends, inventory trends, order trends, lead-time accuracy (**Estimated vs Actual**),
department performance, material consumption, machine utilization, delay analysis,
historical comparisons. Serves the Management analytics screens and all R-ANA-*
reports.

## 17.7 AI / Automation Engine (Phases 7–8)

**Guard-rail (Principle #8):** AI recommends; humans approve. No AI directly controls
critical manufacturing decisions until explicitly authorized.

Pipeline: `Operational Data → Analytics → AI → Recommendation → Human Approval → Action`.

**Assistants:**
- **Management assistant:** "Which orders are at risk of delay?" → ranked list with
  data-backed reasons; "Why is Order 1024 delayed?" → cause explanation from facts.
- **Inventory assistant:** "Which materials may run short for this week's plan?" →
  shortage list with dates.
- **Production assistant:** delay root-cause lookup.
- **Auto reporting:** daily production, shortages, delays, pending approvals,
  department issues — natural-language + charts.

**Automation rules (configurable):**
```
IF material shortage detected THEN notify stores AND notify planning
                             AND create purchase requirement
                             AND mark affected production orders
IF production order exceeds expected lead time THEN compute delay
                             AND notify planning AND notify management
                             AND request reason
```

**Constraints:** AI answers must be grounded in system data with record links;
hallucinated facts blocked; all AI-generated actions require human confirmation;
prompt/rule inputs audited; model choice configurable.

## 17.8 Robotics Platform (Phase 9)

A robot management layer between the platform and the fleet — never a direct
robot-to-each-system wiring.

**Robot Identity & State:** registration, model, connectivity, battery, status,
location, health, telemetry, logs, alerts (table `Robot`, `RobotLog`).

**Robot Task Manager:**
```
Production Task → Robot Task Manager → Robot → Execution → Result
                                             ↘ Result → Central Platform → Production Status
```
Robot becomes another operational actor: its completed tasks post as production
progress exactly like a human `OperationEntry`.

**Robot account:** authenticates via API key + mTLS (Section 5.3/20); RBAC role
`ROBOT` restricted to its own endpoints; commands target approved robots only;
safety interlocks: any robot task requires a human-supervised start until trust is
proven (Phase 9 policy).

---

# 18. INTEGRATION LAYER & ERP CONNECTOR

## 18.1 Purpose and positions

The Integration Layer is **the only path** between the platform, the ERP, and robots.
Nothing else talks to the ERP. This prevents duplicate data and conflicting records
(Principle #2).

```
CENTRAL PLATFORM (Users, Workflow, Analytics)
                 │
           Integration API
                 │
           Existing ERP
```

## 18.2 ERP connectivity discovery (Phase 0)

During Phase 0, the team determines exactly how the ERP exposes data:

| Mechanism | Notes |
|---|---|
| REST API | Preferred |
| SOAP / Web services | Encapsulate behind the adapter |
| Direct database | Only via read-only views, never writes |
| SQL views | For complex reads |
| CSV / Excel scheduled exports | Fallback for legacy |
| Message queues / events | For real-time events if supported |

**Decision rule:** the platform interacts through official APIs wherever they exist.
Where neither exists, a dedicated **integration adapter** (single owner of DB access)
is built — never per-app DB manipulation.

## 18.3 What integrates — direction matrix

| Data | Direction | Trigger | Carrier |
|---|---|---|---|
| Item / Product / Customer / Supplier / BOM / Machine | ERP → Platform | Schedule + event | Sync job |
| On-hand stock / reservations | ERP → Platform | Schedule (configurable) | Sync job |
| Inventory transactions | ERP → Platform | Event/poll | Sync job |
| Sales orders / POs | ERP → Platform | Event/poll | Sync job |
| GRN / receipts | Platform → ERP | On receipt posting | Event push |
| Material / stock-count adjustments | Platform → ERP | On approval | Event push |
| Production completion / scrap | Platform → ERP | On operation complete | Event push |
| Dispatch confirmation / POD | Platform → ERP | On dispatch | Event push |
| PO creation (from PR) | Platform → ERP | On PR approval | Event push |
| Order acceptance / confirmation | Platform → ERP | On feasibility accept | Event push |
| Attendance / leave (to payroll) | Platform → ERP/HR | On approval | Optional adapter |
| Master change (approved ECN) | Platform → ERP | On ECN approval | Event push |

## 18.4 Integration patterns

- **Outbound writes** are asynchronous, retried, idempotent (unique `integration_id`),
  and produce an ERP transaction reference stored back on the platform record.
- **Inbound reads** are cached into `ERPObjCache` with hashes for change detection and
  staleness timestamps; dashboards use the cache, not live ERP calls.
- **Conflict rule:** ERP is authoritative. A rejected platform write holds the workflow,
  notifies the originator, and logs an audit record with the ERP error.
- **Failure handling:** retry with backoff ×3, then dead-letter queue + alert to
  `ADMIN` (rule). Sync health is visible in `Admin → Integration`.
- **Idempotency & dedup:** every sync/push carries `integration_id`; receivers dedup.
- **Timeouts, pagination, and rate limiting** on both sides to protect ERP load.
- **Monitoring:** per-entity sync lag and error metrics → `R-ADM-02 Sync Health`.

## 18.5 Data sync schedule (defaults, configurable)

| Entity | Frequency |
|---|---|
| Items, Products, BOM | Nightly full + on-demand refresh |
| Customers, Suppliers | Nightly + on-demand |
| On-hand stock | Every 15 min (peak windows configurable) |
| Inventory transactions | Poll every 5 min |
| Sales orders / POs | Poll every 5 min |
| Production records | On event + poll 5 min |
| Machines | Poll 2 min |
| Accounts/Invoices | Nightly |

All configurable in Admin; dashboards mark stale data visually when cache older than
threshold.

---

# 19. DATABASE & API ARCHITECTURE

## 19.1 Database philosophy

- **Do not copy the entire ERP database.** The platform has:
  1. **Operational DB** — platform-native entities (Section 4.1).
  2. **Cache DB** — filtered ERP master/ref copies (`ERPObjCache`).
  3. **Analytics layer** — prepared/de-normalized aggregates and historical snapshots
     for dashboards and AI (separate from operational DB to avoid load).

## 19.2 Logical schema clusters

| Cluster | Entities |
|---|---|
| Identity & security | User, Session, Device, Role, Permission, AuditLog |
| HR | Employee, Department, Attendance, Leave, Task |
| Commerce | OrderInquiry, Quotation, FeasibilityResult, CustomerCard |
| Product & eng | Product, BOM (cached), ECR/ECN, Document, Operation/Routing |
| Manufacturing | ProductionOrder, WorkOrder, OperationEntry, Machine, DowntimeEvent |
| Inventory | MaterialRequest(+Lines), InwardReceipt, OutwardIssue, Transfer, StockCount, Reservation |
| Procurement | ProcurementRequirement, PurchaseRequisition, PurchaseOrder(cache) |
| Logistics | Dispatch, DispatchLine, ShipmentTrack, POD |
| Quality | QualityCheck, RejectionRecord, NCR, CAPA |
| Workflow | WorkflowDefinition, WorkflowInstance, WorkflowState, Approval |
| Notifications | Notification, NotificationRule, DeviceToken |
| Integration | ERPObjCache, SyncJob, IntegrationEvent |
| Intelligence | LeadTimeSnapshot, ShortagePrediction, ConsumptionRecord |
| Robotics | Robot, RobotTask, RobotLog |
| Documents | Document, FileReference |

## 19.3 Design conventions

- Every transaction table has: `id`, `created_at`, `created_by`, `updated_at`,
  `updated_by`, `erp_ref` (where applicable), `status`, `audit` hook.
- Status enums are managed; transitions validated by workflow engine (17.1).
- Soft-delete for master; hard-delete never for operational records (audit retained).
- Timestamps UTC; display local timezone. IDs: ULID/UUID where not ERP-sourced; ERP
  entity ids referenced not duplicated.
- Reservations (stock) are platform-side with ERP-consistent constraint; all
  adjustments audit-logged and mirrored.
- The analytics layer is updated via streaming/batch from operational events
  (lambda/batch), never ad-hoc ETL from screens.

## 19.4 API architecture

- **REST (primary)** with OpenAPI 3 schema. Versioned (`/api/v1`).
- **GraphQL** for the management dashboard graph-style drill queries (optional, or
  REST-only in v1 to reduce scope — decision in Phase 0).
- **API Gateway** fronts mobile web + web control center; JWT/mTLS per surface
  (Section 20).
- Domain resource URLs, e.g.:
  - `GET /orders?status=delayed`
  - `GET /orders/{id}/feasibility`
  - `POST /operations/{workOrderId}/entry`
  - `POST /material-requests/{id}/approve`
  - `GET /analytics/lead-time?period=90d`
  - `POST /integration/events` (internal integration bus)
- WebSocket/SSE for live notification and dashboard streams.
- Rate limiting per API key/user; pagination on all list endpoints; composite
  filters and export endpoints separate from display endpoints.
- **Robotics API** — machine-to-machine endpoints with mTLS + signed payloads,
  restricted to `ROBOT` role.

---

# 20. SECURITY, AUDIT & NON-FUNCTIONAL REQUIREMENTS

## 20.1 Security

**Authentication**
- Password (bcrypt/PBKDF2), JWT access token (8 h) + refresh (14 d) for web.
- Mobile: app token + device binding; optional PIN/biometric (platform policy; 24 h
  re-auth).
- MFA (TOTP) required for `MGMT` and `ADMIN` and any user with export/approve beyond
  threshold.
- Lockout after 5 failed attempts (15 min); forced password change on first login
  and per policy.
- API auth: OAuth2 client credentials for integrations; mTLS + API key for robots.

**Authorization**
- RBAC at module × action (Section 5.2), enforced server-side on every API call
  (never client-side only).
- Every screen/action enforces user's role effective scope (department-level scoping:
  a DH sees own department, MGMT sees all).
- API authorization per role; export permission separated; approval permission
  separated from create/edit.
- Session/device management: user can list and revoke devices; admin can kill
  sessions.

**Communication & data protection**
- TLS 1.2+ everywhere; HSTS; encrypted at rest (DB, object storage, backups).
- Secrets in secret manager (never in code); key rotation policy; API keys hashed at
  rest.
- PII minimization: only operational attributes needed; no unnecessary surveillance
  data (Principle: activity = accountability only).
- File uploads: type allowlist, size limit, virus scan; documents versioned.

**Application security**
- OWASP Top 10: input validation, parameterized queries, CSP, rate limiting, SSRF
  guards on integration adapter, audit of privileged actions, dependency scanning,
  secrets scanning in CI, signed releases.
- Backup: automated nightly DB backups + WAL; tested restore quarterly; retention
  policy; off-site copy.
- Database recovery: point-in-time restore capability; documented runbook.

**Operational security**
- Separate environments (dev/staging/prod); PR-based deploys; no prod DB access from
  dev.
- Monitoring: login anomalies, permission changes, credential misuse, unusual
  export volumes, sync failures → alert rules.

## 20.2 Audit log

Every important transaction is traceable. Minimum data: `actor`, `action`,
`entity_type`, `entity_ref`, `before/after`, `ip/device`, `at`. Immutable (append
only) with retention per policy.

**Example — full chain per order:**
```
Order #10023
Created by Commercial → approved by Manager → planned by Planning →
material issued by Stores → production started by Operator →
production done by Supervisor → dispatched by Logistics
```
Each hop records actor + timestamp + decision. The audit surfaces as a timeline on
every record (Common UX) and as `R-ADM-03 Audit Trail`.

## 20.3 Non-functional requirements

| Area | Requirement |
|---|---|
| Availability | 99.5% planned uptime; no data loss on component failure; graceful degradation of mobile offline queue |
| Performance (web dashboard) | Page load < 3 s p95; KPI strip < 2 s; drill < 2 s; export async with notification |
| Performance (mobile) | Home load < 2 s p95; action confirm < 500 ms optimistic + reconcile |
| Integration latency | Cache freshness per Section 18.5; outbound push acknowledged < 10 s |
| Data integrity | Every ERP write returns ERP ref; reconcile job daily; conflict resolution logged + notified |
| Scalability | Design for single facility first; architecture must extend to multi-plant |
| Concurrency | 126 active orders scale: thousands of users, ten-thousands of records; DB indexed accordingly |
| Reporting | Scheduled + on-demand; reports stream/async for large exports |
| Accessibility | Web WCAG 2.1 AA on core management screens |
| Localisation | English UI v1; language pack architecture ready (fields, dates, timezone) |
| Retention | Operational 24 mo; audit 7 y; analytics as configured |

---

# 21. MASTER REPORTS REGISTER

All reports are defined in Section 16.8 Reports Centre. Access per RBAC export
permission. Every report has filters, schedule option, and delivery (app/email).

| ID | Report | Source screens | Owner |
|---|---|---|---|
| R-ORD-01 | Order Register | 7.1 | Commercial |
| R-ORD-02 | Order Backlog | 7.1 | Commercial |
| R-ORD-03 | Order Acceptance Report | 7.3 | Commercial |
| R-ORD-10 | Order Status Summary / Control | 7.2, 16.2 | Commercial/Mgmt |
| R-COMM-01 | Quotation Register | 7.4 | Commercial |
| R-COMM-02 | Quote Win/Loss | 7.4 | Commercial |
| R-COMM-03 | Customer Aging | 7.5 | Commercial |
| R-PLN-01 | Daily Production Plan | 8.1 | Planning |
| R-PLN-02 | Plan Vs Actual | 8.1, 9.3 | Planning |
| R-PLN-03 | Weekly Load | 8.2 | Planning |
| R-PLN-04 | Capacity Plan | 8.2, 8.5 | Planning |
| R-PLN-05 | Order Priority List | 8.3 | Planning |
| R-PLN-06 | Material Constraint Register | 8.4 | Planning |
| R-PLN-07 | Capacity & Bottleneck | 8.5 | Planning |
| R-PLN-08 | Work Order List | 8.6 | Planning |
| R-PLN-09 | Delay Analysis | 8.7 | Planning |
| R-PROD-01 | Production Entry Register | 9.2 | Production |
| R-PROD-02 | Rejection Register | 9.2, 13.3 | Production |
| R-PROD-03 | Production Progress | 9.3 | Production |
| R-PROD-04 | Target Vs Actual | 9.3 | Production |
| R-PROD-05 | Machine Downtime | 9.4 | Production |
| R-PROD-06 | Machine Utilization | 9.4 | Production |
| R-PROD-07 | Issue Register | 9.6 | Production |
| R-PROD-08 | Daily Production Report | 9.8 | Production |
| R-PROD-10 | Operator Performance | 9.1, 9.5 | Production |
| R-INV-01 | Stock Register | 10.1 | Stores |
| R-INV-02 | Availability | 10.1 | Stores |
| R-INV-03 | Inward Register | 10.2 | Stores |
| R-INV-04 | Issue Register | 10.3 | Stores |
| R-INV-05 | Consumption | 10.3, 10.8 | Stores |
| R-INV-06 | Material Request Register | 10.4 | Stores |
| R-INV-07 | Transfer Register | 10.5 | Stores |
| R-INV-08 | Stock Count Summary | 10.6 | Stores |
| R-INV-09 | Variance Report | 10.6 | Stores |
| R-INV-10 | Feasibility | 10.7 | Stores/Planning |
| R-INV-11 | Product Availability | 10.7 | Stores/Planning |
| R-INV-12 | Shortage Forecast | 10.8 | Stores/Purch |
| R-INV-13 | Consumption Trend | 10.8 | Stores |
| R-INV-14 | Dead & Slow Moving | 10.8 | Stores |
| R-INV-15 | Stores Daily Report | 10.9 | Stores |
| R-PUR-01 | Procurement Requirement Register | 11.1 | Purchase |
| R-PUR-02 | Requisition Register | 11.2 | Purchase |
| R-PUR-03 | Requisition Vs PO | 11.2 | Purchase |
| R-PUR-04 | PO Register | 11.3 | Purchase |
| R-PUR-05 | PO Aging | 11.3 | Purchase |
| R-PUR-06 | Expedite List | 11.3 | Purchase |
| R-PUR-07 | Supplier Performance | 11.4 | Purchase |
| R-PUR-08 | Supplier Score | 11.4 | Purchase |
| R-PUR-09 | 3-Way Match | 11.5 | Purchase |
| R-PUR-10 | Purchase Variances | 11.5 | Purchase |
| R-PUR-11 | Purchase Daily Report | 11.6 | Purchase |
| R-LOG-01 | Dispatch Schedule | 12.1 | Logistics |
| R-LOG-02 | Packing List | 12.1 | Logistics |
| R-LOG-03 | Trip Report | 12.2 | Logistics |
| R-LOG-04 | POD Register | 12.2 | Logistics |
| R-LOG-05 | Dispatch Vs Commit | 12.3, 7.7 | Logistics |
| R-LOG-06 | Transporter Performance | 12.4 | Logistics |
| R-LOG-07 | Logistics Daily Report | 12.5 | Logistics |
| R-QC-01 | Inspection Register | 13.1 | Quality |
| R-QC-02 | Inspection Results | 13.2 | Quality |
| R-QC-03 | First-Pass Yield | 13.2 | Quality |
| R-QC-04 | NCR Register | 13.3 | Quality |
| R-QC-05 | CAPA Status | 13.3 | Quality |
| R-QC-06 | Defect Pareto | 13.3 | Quality |
| R-QC-07 | Quality Report | 13.4 | Quality |
| R-ENG-01 | BOM Listing | 14.1 | Engineering |
| R-ENG-02 | BOM Compare | 14.1 | Engineering |
| R-ENG-03 | ECN Register | 14.2 | Engineering |
| R-ENG-04 | Change Impact | 14.2 | Engineering |
| R-ENG-05 | Engineering Request Register | 14.3 | Engineering |
| R-ENG-06 | Document Register | 14.4 | Engineering |
| R-ENG-07 | Engineering Status | 14.5 | Engineering |
| R-HR-01 | Employee Directory | 15.1 | HR |
| R-HR-02 | Headcount | 15.2 | HR |
| R-HR-03 | Permissions Audit | 15.3 | HR/Admin |
| R-HR-04 | Attendance Register | 15.4 | HR |
| R-HR-05 | Leave Register | 15.5 | HR |
| R-HR-06 | Task Register | 15.6 | HR |
| R-HR-07 | Approval Register | 15.7, 16.5 | HR/Mgmt |
| R-HR-08 | HR Summary | 15.9 | HR |
| R-MGT-01 | Executive Overview | 16.1 | Management |
| R-MGT-02 | Daily Digest | 16.1 | Management |
| R-MGT-03 | Exceptional Orders | 16.2 | Management |
| R-MGT-04 | Department Status Matrix | 16.3 | Management |
| R-MGT-05 | Alert Register | 16.4 | Management |
| R-ADM-01 | Approval SLA | 15.7, 15.8 | Admin |
| R-ADM-02 | Sync Health Report | 15.8, 18 | Admin |
| R-ADM-03 | Audit Trail | 20.2 | Admin |
| R-ANA-* | Analytics Series | 17.6, 16.6 | Management |
| R-AI-* | AI Generated Reports | 16.7, 17.7 | Management |

---

# 22. SKILLS REQUIRED FOR DEVELOPMENT

This section enumerates the complete skill set the build requires — team roles,
domain competencies, technologies, and per-phase skill requirements. Use it to scope
recruitment/partnering and to check estimator coverage.

## 22.1 Team roles (people)

| Role | Count (suggested) | Primary responsibilities |
|---|---|---|
| Product Owner / Business Analyst (Manatec) | 1 | Owns this FRS, department sign-off, prioritisation, UAT |
| Solution Architect | 1 | Overall architecture, ERP integration design, technology choices, guardrails |
| ERP Integration Engineer / Consultant | 1–2 | ERP APIs, adapter, data mapping, sync reliability — the riskiest skill |
| Backend Engineers (full-stack leaning) | 2–4 | Core services: identity, RBAC, workflow, notification, lead-time, ordering, inventory engines, analytics APIs, robotics services |
| Database Engineer / Data Modeller | 1 | Canonical schema, cache/analytics layers, performance, reconciliation |
| Frontend Engineer (Web Control Center) | 1–2 | Dashboard UI, drill-downs, reports centre, charts |
| Mobile Engineer (Android + iOS) | 1–2 (or 1 cross-platform) | Employee app, offline queue, push, scanning |
| QA / Automation Engineer | 1–2 | Test plans, integration tests, UAT, regression |
| DevOps / SRE | 1 | CI/CD, environments, observability, backups, robot lane security |
| UI/UX Designer | 1 (intermittent) | Wireframes for every screen in this FRS, mobile-first patterns |
| Security Engineer / reviewer | 0.5 | Threat model, RBAC review, pen-test, audit log design |
| AI/ML Engineer (Phase 7–8) | 1 | Analytics, risk models, grounding, LLM assistant, automation rules |
| Robotics Integration Engineer (Phase 9) | 1 (part-time start) | Robot adapters, mTLS lane, telemetry ingestion |
| Dev Manager / Scrum Master | 1 | Sprint planning, dependency sequencing (Section 23) |

## 22.2 Domain competencies (must have in the team)

| Competence | Need |
|---|---|
| Manufacturing operations (MTO/assembly/manufacturing) deep knowledge | Every department FRS relies on real process understanding to configure workflow, lead-time, BOM, inventory |
| ERP domain expertise (OS/400, Tally, SAP, Zoho, custom, etc. — identify in Phase 0) | Adapter design, field mapping, MRP semantics |
| Barcoding / scanning / SKU lifecycle | Stores and production mobile flows |
| Warehouse & inventory control practice | Stock counting, reservations, variance workflows |
| ISO/quality processes (inspection, NCR, CAPA) | Quality FRS configuration |
| HR/attendance process | Leave/attendance modules |
| Logistics & dispatch practice | Dispatch flow, POD, transporter tracking |
| Robotics / industrial IoT (Phase 9) | Robot task & telemetry integration |

## 22.3 Technology skills (recommended stack — validate in Phase 0)

| Layer | Suggested technologies | Skills |
|---|---|---|
| Backend | Go, Java (Spring Boot), or Node.js (NestJS) — single choice at Phase 0 | REST, OpenAPI, domain services, event-driven design, message queues (Redis streams / Kafka / RabbitMQ) |
| Databases | PostgreSQL (operational + cache), TimescaleDB or ClickHouse (analytics), Redis (cache/queues) | SQL modelling, migrations, partitioning, time-series |
| Identity | OIDC-compliant (Keycloak or in-house with MFA) | OAuth2, JWT, TOTP, device binding, IAM, RBAC modelling |
| Web frontend | React + TypeScript + Vite; charts (Apache ECharts / Recharts); state (TanStack Query); SSO | Component libraries, dashboards, realtime (WebSocket/SSE) |
| Mobile | Flutter or React Native (one app, two platforms); push (FCM/APNs); local DB for offline (SQLite/Drift) | Offline-first, sync conflict resolution, camera/barcode SDK, biometric auth |
| Integration | API gateway (Kong/Envoy/NGINX), adapter services | SOAP→REST wrapping, CSV/SFTP, idempotency patterns, retries, circuit breakers |
| Analytics/AI | Python (pandas, scikit-learn) for pipelines; LLM API (OpenAI/Azure/other) for assistant with RAG; vector DB optional | ETL, statistical modelling, LLM grounding/guardrails, prompt management, evaluation |
| Robotics (Phase 9) | MQTT / OPC-UA / custom REST driver per robot | mTLS, IoT telemetry ingestion, task handoff protocols |
| DevOps | Docker, Kubernetes or compose, GitHub Actions/GitLab CI, Terraform | CI/CD, monitoring (Prometheus/Grafana/ELK), backup/DR, secret management, IaC |
| QA | Playwright/Cypress, Appium/Maestro, API tests (Postman/Newman/k6) | E2E, load, integration, regression |

## 22.4 Skill mapping by roadmap phase

| Phase | Critical skills (fill from 22.1–22.3) |
|---|---|
| 0 Discovery | Business analyst, ERP consultant, solution architect, solution-domain SME |
| 1 Integration Foundation | Integration engineer, backend, database engineer, security, DevOps |
| 2 Central Dashboard | Frontend, backend, data engineer, UI/UX designer |
| 3 Mobile App | Mobile engineer, backend (offline sync), QA, UI/UX |
| 4 Workflow Engine | Backend (state machines), business analyst (rules), QA |
| 5 Inventory & Product Intelligence | Data engineer, backend, manufacturing SME |
| 6 Ordering + Lead-Time | Backend, data engineer, manufacturing SME |
| 7 Analytics | Data engineer, AI/ML engineer, frontend (visualisation) |
| 8 AI Automation | AI/ML engineer, backend, security reviewer |
| 9 Robotics | Robotics integration engineer, DevOps (mTLS), backend |

## 22.5 Skills that are NOT needed / deliberately excluded

- Full ERP implementation team (we integrate, not replace).
- Large data science team in early phases (analytics before AI).
- Multiple mobile app teams (one app only).
- A permanent robotics team before Phase 9.

---

# 23. DEVELOPMENT ROADMAP & ESTIMATION BASIS

## 23.1 Sequencing principle

Build in **dependency order**, not feature-list order. Integration must exist before
anything reads the ERP; identity/RBAC before dashboards; dashboards before mobile;
operational data volume before intelligence; intelligence before AI; trust before
robots.

```
MANATEC
 ├── EXISTING ERP (unchanged)
 ├── INTEGRATION CORE
 ├── IDENTITY + RBAC
 ├── Dashboard · Mobile · Workflow   (parallel after base)
 ├── OPERATIONAL DATA
 ├── Inventory/Ordering/Production Intelligence
 ├── LEAD-TIME ENGINE
 ├── ANALYTICS LAYER
 ├── AI AUTOMATION
 └── ROBOTICS LAYER
```

## 23.2 Phase deliverables gates

| # | Phase | Entry gate | Exit gate (definition of done) |
|---|---|---|---|
| 0 | Discovery & Architecture | FRS baseline v1.0 | Signed **Manatec Digital System Blueprint** (ERP doc, database map, APIs, workflows, roles, reports, pain points, data ownership, integration limits); tech stack decided; FRS v1.1 updated with ERP reality |
| 1 | Integration Foundation | Blueprint accepted | Auth + RBAC + departments/employees live; ERP connector pulls masters; platform→ERP writes proven with PO + stock + production events; audit + notifications infra; monitoring live |
| 2 | Central Dashboard | Phase 1 UAT | Executive + dept dashboards live with drill-down; order control center works; KPIs from real data; Approvals console |
| 3 | Mobile Application | Dashboard accepted | Planning, Production, Stores, Logistics, Management mobile flows live; offline queue works; attendance; push |
| 4 | Workflow Engine | Mobile in UAT | Configurable approvals live across leave, material, PO, dispatch, NCR, ECN; escalation works; delegation works |
| 5 | Inventory & Product Intelligence | Stock data clean | Availability model validated; feasible-quantity engine answers "what can we produce"; shortages detect and flow to proc; stock counts automated |
| 6 | Ordering + Lead-Time | Feasibility engine stable | Order entry shows feasibility + committed completion; E-vs-A recorded |
| 7 | Analytics | 3+ months good data | Trends, E-vs-A accuracy, dept KPIs, delay analysis approved by management |
| 8 | AI Automation | Analytics accepted | Management assistant, auto reporting, risk detection rules, human-approve actions |
| 9 | Robotics | First robot defined | Robot register, task manager, telemetry, robot→production progress |

## 23.3 Estimation basis for PSM

Estimators should cost from this FRS as follows:
- **Per screen** (Sections 7–16): assign complexity S/M/L by actions, integrations,
  approvals. Small = 3–5 dev-days, Medium = 6–12, Large = 13–20 (indicative).
- **Engines** (Section 17): Workflow 6–10 w-d; Notification 4–6; Lead-Time 6–10;
  Inventory Intelligence 10–15; Order-Intel 6–10; Analytics layer 10–15;
  AI assistant 15–25; Robotics layer 8–15 (indicative, ranges for estimate only).
- **Integration** (Section 18): adapter 5–10 w-d per ERP surface + data mapping.
- **Cross-cutting** (Section 20): security/audit/devops estimate as % of total
  (recommend 15–20%).
- All figures depend on Phase 0 findings (ERP API reality); state them as
  contingency bands in the estimate.

## 23.4 Risks & mitigations

| Risk | Mitigation |
|---|---|
| ERP has no/weak API | Phase 0 adapter design; avoid DB writes; SAP/Zoho/OS400/Custom playbook |
| Data duplication conflict | Principle #1; canonical model (Section 4); integration-only policy (18) |
| Scope creep | This FRS is change-controlled; any new screen/field is an CR |
| Mobile offline sync bugs | Offline-first design from Phase 3; reconciliation jobs; QA from day one |
| Delays from manual data | Start data-cleanup pilots in Phase 0 |
| AI misleadership | Grounding, citation, human-approval gate (Principle #8) |
| Robots unsafe | mTLS lane, supervised startup, role `ROBOT` least privilege |

---

# 24. APPENDIX — SCREEN TEMPLATE & CONVENTIONS

## 24.1 Screen template (as used in every department)

> **Screen:** name · **ID:** optional for traceability
> - **Roles:** who accesses
> - **Purpose:** one line
> - **Actions:** every interaction
> - **Inputs:** every captured field
> - **Outputs:** displayed/generated data
> - **ERP integration:** read (cache) / write (event) and which entity
> - **Approvals:** workflow + level
> - **Notifications:** rule events
> - **Reports:** report IDs sourced

## 24.2 Naming and conventions

- Report IDs `R-<DEPT>-<n>`; modules/screens map 1:1 to RBAC permissions.
- Status lists and enums defined in Phase 0 data dictionary.
- Approval thresholds (values `T1, T2`, delay thresholds) are **configuration
  parameters**, confirmed with Manatec heads in Phase 0.
- All times appear with creating user's timezone; stored UTC.
- All monetary/quantity values retain precision; units of measure come from ERP master.

## 24.3 Open actions for Phase 0 (must answer before/while building)

1. Confirm ERP product, version, and API surfaces (REST/SOAP/DB/export).
2. Confirm item/product/BOM per-company naming and real routing.
3. Confirm approval thresholds and org role names (T1/T2 values, delegation policy).
4. Confirm warehouses, bins, scanning hardware.
5. Confirm mobile users' devices and shop-floor connectivity (offline needs).
6. Confirm single-shift/multi-shift and working calendar for lead-time.
7. Confirm robot types/protocols if already planned (else defer to Phase 9).
8. Confirm retention/compliance requirements for audit and documents.

## 24.4 Change control

- Baseline: v1.0. Any change to scope/screens/roles/integration → written CR,
  impact assessment (effort, data, regression), approved by Product Owner + Architect.
- This FRS is the contract PSM estimates against.

---

*End of Manatec Integrated Digital Operations Platform — Functional Requirement
Specification v1.0.*