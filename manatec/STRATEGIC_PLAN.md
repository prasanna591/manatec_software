# Manatec Electronics — Strategic Plan
## Scalable, Integratable Manufacturing System: Product Catalog → BOM → Inventory → Available-to-Promise (ATP) → Procurement → Sales

**Version:** 1.0  ·  **Prepared:** 20 Sep 2026  ·  **Company:** Manatec Electronics Pvt. Ltd., Puducherry

---

## 1. Executive Summary

Manatec manufactures **95 products across 26 families** of automotive service-station
equipment (wheel balancers, 3D wheel aligners, tyre changers, lifts, air compressors,
paint booths, pollution-checking equipment, nitrogen stations, TPMS and more). The
business operates with strong engineering depth (first in Asia to make computerised
aligners/balancers; CE-certified products; ISO 9001:2015) and a turnover of
₹100–500 Cr.

**One critical operational blind spot exists:** leadership cannot instantly answer

> *"With the stock I have right now, how many units of each product can I build,
> exactly which parts are short, and how long will it take to get them?"*

Today that answer is a manual, multi-day exercise across Excel sheets, engineering
BOMs and procurement files. **The strategic goal is to turn that answer into a
real-time, self-serve number** the whole company — production, purchase, sales and
management — can act on, and to upgrade the existing BOM-analysis prototype into a
scalable, module-based platform that integrates with the systems Manatec already uses.

**The plan in one line:** Build an **Available-To-Promise (ATP) platform** — Product
Registry → multi-level BOM → live inventory → ATP engine → shortage list with
**purchase lead-times & PO tracking** → production plan → sales proposal with a
**credible delivery date** — rolled out in 6 phases over ~12 months.

---

## 2. Current State (from website analysis + existing prototype)

### 2.1 Corporate snapshot (scraped from manatec.net)

| Attribute | Value |
|---|---|
| Nature of business | Manufacturer since 1987 |
| Employees | 101–500 |
| Turnover | ₹100–500 Cr |
| Certifications | ISO 9001:2015; wheel aligners/balancers CE certified |
| GST / IEC / CIN | 34AAFCM1685D1ZN / 2599000688 / U29199TN2007PTC093265 |
| Export status | IndiaMART verified exporter |

### 2.2 Product portfolio (crawled 20 Sep 2026 — see `data/catalog_manatec.json` / `.csv`)

**95 products across 26 categories.** Flagship families by depth:

| Family | Products | Typical price range (₹) |
|---|---|---|
| Wheel Balancer | 12 | 87,000 – 4,29,562 |
| Automotive Machine | 11 | 84,500 – 4,39,700 |
| Lifting Equipment | 8 | 1,22,200 – 4,70,600 |
| 3D Wheel Aligner | 6 | 3,71,700 – 16,87,500 |
| Tyre Changer | 6 | 84,500 – 5,97,500 |
| Body Shop & Utility | 6 | 67,860 – 7,87,500 |
| Wheel Alignment Machine | 5 | 3,25,950 – 9,68,800 |
| Air Compressor | 4 | 68,250 – 1,04,650 |
| + 18 more families (1–3 each) | ... | 14,560 – 10,50,000 |

**Key insight from crawling:** every product page carries a name, spec table,
feature list, price and a high-resolution image. That public catalogue is an
excellent **foundation for the Product Registry** module (Section 5.1) — the
system should re-use it and extend it with internal engineering metadata.

### 2.3 How Manatee products are actually built (the BOM reality)

From the spec/feature data, products are a **mix of three input streams**, each with
very different procurement behaviour:

1. **In-house fabricated structures** — MS sheet/pipe fabrication, machining,
   welding, powder coating (lifts, booths, compressor tanks, cabinets).
2. **Bought-out engineered components** — motors, hydraulic cylinders/pumps,
   castings, bearings, sensors, cameras, screens, refrigeration parts, TPMS packs.
3. **In-house electronics + software** — PCB assemblies, displays, firmware,
   alignment software and vehicle databases.

This matters because **~60–70% of the value of each machine is bought-out
components with 2–8 week lead times**, which is exactly why Manatec "doesn't know
how long it takes to order and arrive". A first-cut, domain-driven component map
per family with **lead-time classes** is already provided in
`data/parts_intelligence.csv` and must be replaced with the real engineering BOM.

### 2.4 The existing prototype (what we already have)

A working Flask prototype (`app.py` + `bom_solver.py`) that, given two files —

* `inventory.csv` (item → qty) and
* `master_bom.csv` (product → item → qty/unit) —

computes per product: **max units buildable**, missing items, shortages, leftover
stock and unused inventory, with a web UI and Excel/CSV export.

| Capability | Present today |
|---|---|
| Max buildable units per product (min-of-items logic) | ✅ |
| Missing / short items list | ✅ |
| Leftover / unused stock | ✅ |
| CSV/XLSX upload + Excel export | ✅ |
| Repeat for N units (what-if) | ❌ |
| Product name + **image** from the Manatec catalogue | ❌ (to add) |
| Multi-level / sub-assembly BOM (engines, mounts, PCBs) | ❌ |
| Live inventory (current file is a snapshot) | ❌ |
| Supplier lead-times + PO/ETA tracking | ❌ |
| Sales / quotation delivery-date promise | ❌ |
| Auth, multi-user, audit, APIs | ❌ |
| Database instead of files, horizontal scalability | ❌ |

**The prototype proves the core math.** This plan upgrades it into a platform,
without throwing it away — the ATP engine reuses `bom_solver` logic.

---

## 3. Problem Definition (the thing we are fixing)

When a customer/project is on the table, the questions are always the same and
today cost **days** to answer:

1. **How many units of this product can we build *right now*?** *(ATP)*
   — min over all BOM lines of (stock available ÷ needed per unit).
2. **What exactly is missing?** — item, qty needed, qty short.
3. **How long will it take to get it?** — supplier lead-time, PO open time,
   transit in, inspection. *(the biggest data gap today)*
4. **When can we deliver?** — procurement lead time + production cycle time +
   test/QC + packing + shipping → a **credible promised date**.

Manatec's pain is that **#3 is unmanaged data**, so #1–#4 can't be answered
quickly or reliably. Inventory and purchase data live in Excel/file chaos across
departments; there is no central source of truth, no trigger when stock falls
below a level, and no way to see a shortage *before* a salesman makes a promise.

**Success looks like:** the production manager opens a dashboard, selects a
product and quantity, and instantly sees *buildable now / missing / buy-list with
ETA / proposed delivery date* — and a salesman gets the same view with a quote.

---

## 4. Target Architecture (scalable & integratable)

**Principle: modular monolith with clean API boundaries**, so modules can be
split into services later without a rewrite. Everything behind one read/write API.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        WEB / MOBILE CLIENTS                         │
│   Dashboards · Product cards (name+image) · ATP view · Admin        │
└──────────────────────────────┬──────────────────────────────────────┘
                               │  REST / GraphQL  (JWT auth, roles)
┌──────────────────────────────▼──────────────────────────────────────┐
│                        APPLICATION CORE  (Python/FastAPI)           │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌──────────────────────┐ │
│  │Catalog/   │ │ BOM       │ │ Inventory │ │ ATP & What-if        │ │
│  │Registry   │ │ Mgmt      │ │ Mgmt     │ │ Engine (bom_solver+) │ │
│  └───────────┘ └───────────┘ └───────────┘ └──────────────────────┘ │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌──────────────────────┐ │
│  │Procurement│ │Production │ │Sales/Quote│ │Analytics / Reports   │ │
│  │+ LeadTime │ │Planning   │ │+ ATP dates│ │                      │ │
│  └───────────┘ └───────────┘ └───────────┘ └──────────────────────┘ │
└──────────────┬───────────────────────────────────────────────────────┘
               │  events (PO issued, GRN, BCONSUMPTION) + scheduled jobs
┌──────────────▼───────────────────────────────────────────────────────┐
│   DATA LAYER (PostgreSQL) + Redis cache                              │
│   products | bom_lines | inventory | suppliers | purchase_orders     │
│   leadtimes | production_orders | quote_lines | tasks/logs/audit     │
└──────────────┬───────────────────────────────────────────────────────┘
               │  import/export + connectors
┌──────────────▼───────────────────────────────────────────────────────┐
│   INTEGRATIONS  (Excel/CSV → Tally → ERP → IM → email → barcode)    │
└──────────────────────────────────────────────────────────────────────┘
```

**Why PostgreSQL + Redis + Python/FastAPI:**
- Manatec already runs Python; the prototype is pure Python → fastest path to production.
- PostgreSQL gives transactional correctness (stock decrements, POs, quotes) that
  Excel/file-based flows lack, plus room for 100s of concurrent users.
- Modules are independently deployable (containerize each later) → "scalable and integratable".
- File import/export is kept as a first-class integration path, so going live
  doesn't require ripping out existing Excel habits.

---

## 5. Exact Applications & Features to Build

Each application below is a named module with a champion department, a data owner,
and a precise feature list. **Features marked ⭐ are the MVP core** (Phase 1–2).

### 5.1 A · Product & Catalog Registry  *(owner: Marketing/Engg)*
The system's "product card" — public catalogue enriched with internal data.

- ⭐ Seed automatically from `data/catalog_manatec.json` (name, image, category,
  specs, price) — **product name + image everywhere in the UI**.
- Internal fields: model code, product family, GST/HSN, MRP, status (active/EOL).
- Document attachments (manual, CE cert, brochure) per product.
- Approval workflow (draft → review → live).
- API to re-sync public catalogue periodically (new items page on the website).

### 5.2 B · Bill of Materials (BOM) Management  *(owner: Engineering)*
The "items used in each product" layer — the single most important missing dataset.

- ⭐ Multi-level BOM: finished product → sub-assemblies (e.g., "Hydraulic power
  pack", "Main PCB", "Boom assembly") → components. Levels unlimited.
- Quantity per parent + **UoM** (pcs, m, kg, l) + scrap % per line.
- ⭐ Effective-dating & revisions (BOM v1..vN, approve/replace).
- ⭐ Alternative/substitute parts (e.g., SKF vs local bearing) with preference.
- Roll-up viewer: "explode" any product to its full bought-out list.
- BOM comparison between revisions; who-changed-what audit.
- Import from Excel (existing `master_bom.csv` format is the starting schema).

### 5.3 C · Inventory Management  *(owner: Stores)*
Turns today's static stock snapshot into a live ledger.

- ⭐ Item/master catalogue with category, unit, min/max levels, storage location,
  vendor default, fragility.
- ⭐ Stock in / stock out transactions (GRN, issue to production, sales, wastage)
  with who/when; balance always recomputed from ledger (no manual edit).
- Multi-warehouse (raw material, WIP, finished goods; export packing area).
- ⭐ **Min–max alerts**: item falls below min → auto-raise a "restock need".
- Batch / serial tracking for calibrated or imported components (later phase).
- Reorder suggestions based on min-max and open POs.

### 5.4 D · Available-to-Promise (ATP) Engine  *(owner: Production + Sales)*
**The heart of the system.** Upgrades `bom_solver` into a service.

- ⭐ "How many units of each product can I build with current stock?" (per
  product, globally).
- ⭐ **What-if:** "What do I need to build **N** units of product X?" →
  per-item required vs available, total shortage list, cost of shortage.
- ⭐ Respect **shared components** across multiple products and open POs
  (pegging/in-time arrivals) — a stock item in transit may enable production.
- Roll up multi-level BOM automatically (explode sub-assemblies).
- ATP dose not only build *now*, but projected ATP = current + in-transit − committed.
- ⭐ Output feeds directly into the Procurement module as a **buy-list**.

### 5.5 E · Procurement & Lead-Time Intelligence  *(owner: Purchase)*
Solves *"how long does it take to order and arrive?"* — the missing data layer.

- ⭐ **Supplier master**: company, parts supplied, lead-time (order→arrival, days),
  MOQ, price, rating, ETA reliability.
- ⭐ **Lead-time registry per item**: standard lead time + source class
  (import / local / fabricated), safety stock.
- ⭐ **Auto buy-list**: from ATP shortages, grouped by supplier, with suggested
  qty (shortage + safety stock adjustments).
- ⭐ **Purchase Order (PO) lifecycle**: draft → issued → confirmed ETA → GRN →
  closed; status visible on the ATP view.
- RFQ (request-for-quote) tracking and quote comparison.
- PO-vs-ETA alerts: overdue by X days flagged.
- Simple buy price history → moving-average cost for inventory valuation.

### 5.6 F · Production Planning & Scheduling  *(owner: Production)*
Connects ATP to the shop floor.

- ⭐ Production order (make N units of product X by date D) created from a
  confirmed quote or plan.
- ⭐ Auto-availability check at order creation (uses ATP engine) and reservation.
- Work-centre / capacity model (fabrication, machining, electronics, assembly,
  QC) with standard cycle times per product family.
- Backlog view per work centre; simple Gantt (later phase).
- ⭐ **Material pick-list** per production order (from BOM explode) → issue to
  production decrements stock.
- Progress stages (released → in production → QC → packed → dispatched).

### 5.7 G · Sales & Quotation Engine  *(owner: Sales)*
Turns ATP into credible promises to customers/projects.

- ⭐ Quote with product, qty, price (MRP / dealer), margin check.
- ⭐ **Promised delivery date calculation:** today + max(procurement lead time for
  shortages) + production cycle time + packing/shipping buffer. Show
  *"buildable now via stock", "estimated date with purchases", "blocked — see
  missing list"*.
- Quote → production order handoff with one click.
- Follow-up pipeline tracking (prospect → quote → order → dispatch).
- Export quote as PDF/Excel matching Manatec letterhead (later).

### 5.8 H · Integrations & Data Exchange  *(owner: IT)*
"Makes it integratable" — this is what turns the tool into a platform.

- **Excel/CSV import-export** for every master table (inventory snapshots, BOM,
  sell rates) — preserves current workflows in the first go-live.
- **Tally / accounting** export of purchase & sales entries (or via a simple
  connector) — later phase.
- **IndiaMART / website enquiry sync**: webhook pulls the enquiry form from
  manatec.net → creates a lead in the sales module.
- **Barcode / QR item labels** (scan-in/out) — later phase.
- **REST API + webhooks** for third-party ERP integration when Manatec adopts one.
- **Scheduled import** of the public catalogue; refresh product images.

### 5.9 I · Analytics & Dashboards  *(owner: Management)*
- TFM dashboard: buildable count per product, total shortage value, blocked products.
- Inventory health: coverage days, slow-moving / dead stock, accuracy vs counting.
- Procurement KPIs: PO on-time %, lead-time reliability by supplier, open PO value.
- Production throughput: units dispatched/mo vs plan.
- **"Sell-through & promise accuracy":** promised date vs actual dispatch.

### 5.10 J · Platform Services (foundation)  *(owner: IT)*
- ⭐ Role-based access (Admin / Stores / Purchase / Production / Sales / Viewer).
- ⭐ Full audit log (every stock change, BOM change, PO change).
- Notifications/email (restock alerts, overdue POs, quote expiry).
- Data backup & restore; point-in-time stock snapshots.
- Multi-tenancy-ready schema (if Manatec later serves dealers).

---

## 6. Core Algorithm (the math behind modules D/E/G)

The existing `bom_solver.analyze_product` is the seed. The production algorithm is:

```
for product P:
    exploded = flatten(P.bom)                 # resolves all sub-assemblies
    for item, need in exploded:
        have   = on_hand(item) + in_transit(item) − committed(item)
        cap    = have // (need * (1 + scrap%))
    buildable_now = min(cap) over all items

    if requested_qty N > buildable_now:
        shortage[item] = need*N − have        # the buy-list
        eta = supply_lead_time(item)          # from supplier/leadtime registry
        delivery_date = today + max(eta) + production_cycle(P) + shipping_buffer

Output for UI:
  buildable_now, shortage list (item,qty,cost), buy-list grouped by supplier,
  earliest delivery date, blocked_or_ok status
```

This is **pure, testable Python** — the current `analyze_product` can be retained,
extended for multi-level + in-transit + shared-component pegging, and served as a
REST endpoint that any front-end or future ERP can call.

---

## 6A. Strategic Plan — "Buildable-from-Inventory" + "Lead-Time-Driven Ordering" (the core loop)

Two features **are** the product:

- **Feature I · Buildable-from-inventory (ATP):** every product → *how many units
  can we build today from items actually in stock?* — including in-transit POs,
  minus material already committed to open production orders, exploded through
  multi-level BOMs with scrap.
- **Feature II · Lead-time-driven ordering:** for any build target or forecast →
  exactly what is short (item, qty, ₹), from which supplier, at what ETA; decide
  **order now vs defer**; raise POs; GRN lands stock and the next morning ATP is
  higher. The loop closes when the system *measures* real lead times from PO
  history instead of guessing them.

### The closed operational loop (daily rhythm)

```
STEP 0  DATA (each morning)   stock ledger truth · open POs (in-transit) ·
        open MOs (committed) · live BOMs · supplier lead-times + prices
STEP 1  COMPUTE               ATP for all SKUs (buildable_now, blocking item) ·
        global shortage = Σ need(all demand + forecasts)
                            − (on_hand + in_transit − committed)   → the buy-list
STEP 2  DECIDE                reorder policy: min/max + safety stock + MOQ + batch ·
        "order by / needed-by" date = today + lead − review_window ·
        consolidate per supplier → prioritized recommendations
STEP 3  EXECUTE               buy-list → POs (issue: ETA = today + resolved lead) ·
        GRN on arrival posts stock (immutable ledger) → ATP recomputes automatically
STEP 4  LEARN                 each month: actual open→GRN days vs promised ETA
        re-trains the lead-time registry (item → supplier → class defaults)
```

### Decision rule (concrete, ships in P1)

- **Reorder trigger:** reorder when `available < min_qty`; order up to `max_qty`.
- **min_qty** = forecast usage during `(supplier lead_time + review_period)` + safety stock.
- **safety stock** = start with a 2-week buffer (or `Z × σ(demand over lead)` once P3 history exists).
- **order qty** = `ceil((max_qty − available)/MOQ) × MOQ`, minus what's already on open POs;
  skip items already covered → no double-orders.
- **Priority:** limiting/blocking components of buildable SKUs first (the buy-list
  already sorts by lead-time × value).
- **Promised date** = today + `max(procurement lead, 0)` + production cycle + shipping buffer
  (from the family — already wired into quotes).

### Strategic rollout

| Phase | Actions | Exit criteria |
|---|---|---|
| **P0 (now)** | Prototype runs the exact loop on the 7-sample BOM set (63 lines, one sub-assembly), one warehouse | What-if → buy-list → PO → GRN → re-ATP verified end-to-end ✅ |
| **P1 · Real data (wk 1–4)** | Curate BOMs for the **top-10 SKUs with real demand** (≈0.5 day/SKU: code+qty from old `bom_solver` data + a store walk, one CSV upload each); load real supplier price + lead-time sheet; **physical recount = opening balance** (`/import/inventory`, idempotent); set min/max per item | Top-10 BOMs live; stock truth reconciled once; buy-list ₹ matches what POs actually raise |
| **P2 · Weekly ritual (wk 5–8)** | Monday production meeting runs the global what-if from a forecast Excel (job list of product+qty); purchase raises POs from it same week; GRN entered day of arrival; dashboard shows buildable %, ₹ shortage, top-20 blocking components | Purchase no longer derives shortages by hand; MTTR for "can we build N?" → same meeting |
| **P3 · Learning lead-times (mo 3–6)** | Monthly open→GRN vs ETA reconciliation re-trains item/supplier lead-times + overdue alerts; tune safety stock from real variance; multi-user roles (stores/purchase/production/sales) at full strength; API = same loop programmatically (Tally/IM later) | ETA accuracy ≥ 80% within buffer; reorder policy no longer hand-tuned |

### Data foundations → immediate actions
1. **BOMs are the ceiling:** the loop is only as smart as its BOMs — 7 today, need ~10 live. Budget and schedule the curation.
2. **Lead times start as class defaults** (short 7 / medium 20 / import 45 / fabricated 10); demo prices exist for 32 codes — full real sheet needed; measured data replaces estimates from P3.
3. **Part aliases:** keep codes unique; mark duplicates as substitutes (`item_substitutes`) instead of merging — substitutes used in shortage resolution.
4. **Demand input:** P2 uses manual `target qty` (what-if); forecast Excel → global shortage run comes after.
5. **Multi-warehouse is a flag away** — `warehouse_id` already exists on every ledger and stock row.

### KPIs (see §11, these two features)
- Answer time for "can we build N?" — from days to **<1 min** (prototype already instant).
- **Buy-list ₹ accuracy:** monthly variance vs POs actually raised, target ±5%.
- **ETA accuracy = |GRN date − promised ETA|**, target ≥ 80% within buffer by P3.
- **Buildable ratio ≥ 80%** of SKUs with buildable ≥ 30-day forecast demand.
- **Dead stock:** items with zero ledger movement for 6 months — reported free from the ledger.

### Risks & controls
- **BOM drift** (floor changed the part, BOM didn't) → weekly plan meeting reconciles "missing from stock" vs "missing from BOM".
- **Supplier lead-time optimism** → configurable buffer on ETA (e.g., +10%) until measured data replaces it.
- **Over-purchase from rough min/max** → "needed-by" date + open-PO offset + ₹-threshold approvals.
- **Code↔code mapping** of scraper catalogue to internal item codes — one-time mapping table maintained by Engineering.

### Where it lives today (map to code)
- **Feature I:** `atp_service.all_buildable / build_n` · UI `/atp` · `GET /api/v1/atp/buildable`, `POST /api/v1/atp/what-if`.
- **Feature II:** `leadtime.resolve_lead_days` · `procurement_service.part_shortages` → `POST /api/v1/procurement/buy-list` · PO issue → ETA · GRN posts via ledger · `min/max` alerts on `/inventory` · summary on `/dashboard`, history on `/audit`.

---

## 7. Data Model (core tables)

| Table | Key fields |
|---|---|
| `products` | id, name, model_code, family_id, category, image_url, price, status |
| `families` | id, name, default_cycle_days, default_shipping_days |
| `bom_header` | id, product_id, rev, effective_from/to, status |
| `bom_lines` | id, header_id, parent_item_id, child_item_id, qty, uom, scrap_pct |
| `items` | id, code, description, uom, category, min, max, default_vendor_id |
| `item_substitutes` | item_id, alt_item_id, preference |
| `inventory_ledger` | id, item_id, warehouse_id, trans_type, qty_delta, ref_po/prod, ts, user_id |
| `warehouses` | id, name |
| `suppliers` | id, name, contact, lead_time_days, moq, rating |
| `supplier_items` | supplier_id, item_id, price, lead_time_days, moq |
| `leadtime_registry` | item_id, source_class, lead_days_min, lead_days_max, notes |
| `purchase_orders` | id, po_no, supplier_id, status, issue_date, eta, total_value |
| `po_lines` | id, po_id, item_id, qty, unit_price, received_qty |
| `production_orders` | id, product_id, qty, due_date, status, source_quote_id |
| `prod_order_lines` | id, order_id, item_id, plan_qty, issued_qty |
| `quotes` | id, quote_no, customer, product_id, qty, price, promised_date, status |
| `users / roles / audit_log` | standard platform tables |

**Supply-chain question the schema answers:** `ATP(item) = on_hand + sum(po_lines.open)
− sum(prod_order.reserved) − sum(quotes.pending)`. Every promised date is traceable
to a PO ETA — that is the mechanism to *finally know how long orders take*.

---

## 8. Integration Phasing

| Phase | What connects | Method |
|---|---|---|
| 1 | Excel/CSV ↔ system | Import/export wizards (already has the readers) |
| 2 | Manatec website catalogue | Scraper (already built, scheduled refresh) |
| 3 | Enquiry/lead from manatec.net | Webhook / IM enquiry API |
| 4 | Tally / accounting | Export ledger summaries (and later API) |
| 5 | Barcode/QR scanning in stores | PWA + USB scanner |
| 6 | Future ERP (SAP/Odoo/Tally) | REST API + webhooks (module boundaries already there) |

---

## 9. Development Roadmap (≈12 months)

| Phase | Duration | Scope | Exit criteria |
|---|---|---|---|
| **M0 · Foundations + Catalogue** | 2 wk | Product Registry seeded from scraped catalogue (name+image), auth, DB, Excel import of BOM/inventory | ✅ Done — 95 products seeded from `data/catalog_manatec.json`, cookie/JWT auth + roles, SQLite/PostgreSQL-ready schema, CSV+Excel BOM & opening-stock import |
| **M1 · BOM + Inventory (single-user full)** | 5–7 wk | Multi-level BOM editor, ledger-based inventory, min/max alerts, one warehouse | ✅ Done (working build) — 7-sample-product BOMs (63 lines) + multi-level sub-assembly demo, immutable ledger, min/max reorder alerts, `/bom`, `/items`, `/inventory` pages |
| **M2 · ATP + What-if (the ask)** | 3–4 wk | ATP "buildable now", build-N-what-if with shortage cost, shared-component aware | ✅ Done — `/atp` + API (`GET /atp/buildable`, `POST /atp/what-if`), multi-level explode with scrap, shared-component limiting logic, shortage ₹ valuation, max lead-time |
| **M3 · Procurement + Lead-time** | 4–5 wk | Suppliers, lead-times, auto buy-list, PO lifecycle + ETA, overdue alerts | ✅ Done — 5 suppliers + item prices, lead-time resolution (item→supplier→class), `POST /procurement/buy-list`, PO create/issue (ETA)/receive (GRN → stock) |
| **M4 · Production + Sales + Quotes** | 5–6 wk | Production orders + pick-lists, capacity, quote engine with promised-date, quote→PO handoff | ✅ Done (light) — MO lifecycle (create/confirm-from-quote/release/issue-material/status), quote engine with ATP-backed promised date, quote→MO confirmation, 16-line material issue |
| **M5 · Analytics, Integrations, Scale** | 4–6 wk | Dashboards, IM/website sync, Tally export, barcode, API hardening, multi-user, multi-warehouse | ◐ Partial — `/dashboard` + all-metrics JSON API, audit log, auth-guarded API (bearer + UI cookie); Tally export, barcode, multi-warehouse, capacity scheduling remain |

**Total ≈ 12 months, MVP (usable single-department) in ≈ 9 weeks (M0–M2). Rebuild scope: the M0–M4 spine is implemented end-to-end in `manatec_platform/` (renamed from `platform/` — old name shadowed Python's stdlib `platform` module and broke `uuid`).**

### Build status & next work
Run commands (see repo root):
```bash
python3 -m manatec_platform.seed                     # bootstrap (idempotent)
python3 -m uvicorn manatec_platform.app:app --port 8001   # UI + JSON API
# login admin/admin123 · UI: http://127.0.0.1:8001 · API docs: http://127.0.0.1:8001/docs
```
- ✅ Seeded: 95 products / 26 families / 5 suppliers / 146 items / 54 stocked / 7 BOM products / 63 BOM lines / demo sub-assembly (`balancer-accessory-kit`) / 32 supplier prices / reorder levels.
- ✅ Verified end-to-end: login → ATP what-if → buy-list → PO→issue→GRN (stock up) → quote→confirm→MO→release→material issue (16 lines) → status flow; dashboard + all 10 UI pages 200; 41 JSON routes registered; API returns 401 without auth.
- ⏭ Next (validated, not built): (1) full multi-user/multi-warehouse hardening, (2) Tally/IM export, (3) capacity scheduling, (4) production pick-lists as printable docs, (5) overdue-PO + supplier-rating dashboard, (6) sync of remaining catalogue fields (specs/docs) and a curated BOM for more top-10 products.

---

## 10. Team & Effort

| Role | FTE | When |
|---|---|---|
| Technical lead (full-stack, Python/DB) | 1 | M0–M5 |
| Backend/full-stack developer ×2 | 2 | M0–M5 |
| UI/UX + D3/chart developer | 0.5–1 | M0–M5 |
| QA / data steward (imports & reconciliation) | 1 | M0–M5 |
| Business champions (ENG/Production/Purchase/Sales/Stores) | 5 × 10% | M0–M5 |
| PM / BA (data & workflow) | 0.5 | M0–M5 |

Key dependency: **Engineering must release real BOMs for at least the top 10
products early in M1** — that is the biggest scheduling risk.

---

## 11. KPIs (Success Metrics)

| Metric | Today | Target (6 mo) |
|---|---|---|
| Time to answer "buildable units of product X" | 1–3 days | < 5 seconds |
| Time to produce a shortage/buy-list | 1–2 days | Real-time, auto-grouped by supplier |
| Order→arrival visibility per item | None | 100% of bought-out items tracked |
| Quote delivery-date accuracy | Manual guess | ≥ 90% on promised dates |
| Stock-out surprises in production | Frequent | Near-zero (min/max alerts + auto restock) |
| Inventory data accuracy | Unknown | ≥ 95% ledger-vs-count |
| Open PO value visibility | In Excel silos | Real-time dashboard |

---

## 12. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Engineering BOMs incomplete/delayed | Phase 2 slips | Start with top-10 products; Excel import template; parts_intelligence.csv as placeholder |
| Data reconciliation effort (messy stock) | Delayed trust | Ledger-based stock + count/audit workflow; point-in-time snapshot |
| Resistance to replacing Excel habit | Low adoption | Excel import/export preserved; dashboards read-only for management |
| Long-lead imported parts still bottleneck | Unreliable delivery dates | Lead-time registry + ETA reliability ratings on suppliers; safety stock for imports |
| Scope creep to full ERP | Build stalls | Scope=MVP of ATP; ERP integration via API later |
| Website scrape (IndiaMART template) changes | Stale catalogue | Keep scraper isolated/scheduled; manual add product in Registry |

---

## 13. Immediate Next Steps (this week)

1. **Load the top-10 real BOMs** into the current `master_bom.csv` format
   (engineering provides data) — the prototype already proves the numbers.
2. Load a **current inventory snapshot** and run the existing analyzer → get the
   first real "how many can we build" answer this week, using the sample UI.
3. Capture **supplier lead-times for the top 30 long-lead items** (motors,
   sensors, cameras, castings, bearings) into `data/parts_intelligence.csv`
   structure → the seed of the Lead-Time Registry (M3).
4. Freeze module naming & access roles (Section 5) with department heads.
5. Start M0: stand up PostgreSQL + FastAPI skeleton, seed the Product Registry
   from the already-scraped catalogue (**95 products with images**).

---

## 14. Appendix A — What is already deliverable in this repo

| Asset | Path | Purpose |
|---|---|---|
| Product crawler | `scraper/scrape_manatec.py` | Re-scrapes manatec.net → catalogue (95 products, 26 families) |
| Product catalogue | `data/catalog_manatec.json` / `.csv` | Product name + image + specs + price, ready for Registry |
| Parts intelligence (starter) | `data/parts_intelligence.csv` | Component map per family + lead-time classes to validate/replace |
| ATP prototype | `app.py` / `bom_solver.py` | Working "how many can I build" engine with UI + Excel export |
| Sample data | `sample_inventory.csv` / `sample_master_bom.csv` | Demonstrable end-to-end run |