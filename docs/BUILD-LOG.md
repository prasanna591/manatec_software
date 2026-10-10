# Build Log

Chronological record of every build step, decision, command, and outcome.
Newest work is appended at the bottom. Keep this file updated as work proceeds.

---

## Step 0 — Requirement specification

- Wrote `Manatec-FRS.md`: full Functional Requirement Specification for the
  Manatec Integrated Digital Operations Platform (24 sections, 10 department FRSs,
  ~70 screens, engines, integration, security, skills, roadmap).
- This FRS remains the contract. All code traces back to a section of it.

## Step 1 — Foundation decisions (Phase 0)

| Decision | Choice | Rationale |
|---|---|---|
| Backend language/framework | **Python + FastAPI** | One language with the later Analytics/AI engines; Pydantic maps to the FRS canonical model; existing environment already has FastAPI/SQLAlchemy. |
| Mobile | **React Native** | Single app Android+iOS (FRS §6.3 one-app principle). |
| ERP integration | **Mock/contract adapter now** | Real ERP API unknown until Phase 0 discovery; platform must build against the contract and swap later (FRS §18). |
| Web UI library | **Ant Design** | Dense enterprise KPI/drill screens out of the box (FRS §6.2). |
| Mobile toolchain | **Expo (managed)** | Push, camera/barcode, secure storage, OTA (FRS §6.3). |
| Build order | **Web dashboard + mobile app first**, on a thin real backend | User priority; reuses the Phase 1 identity/integration slice. |
| Dev database | **SQLite default, Postgres via `DATABASE_URL`** | No Postgres server in this environment; SQLAlchemy makes production a config swap (FRS §19). |

## Step 2 — Repository layout

```
software/
├── Manatec-FRS.md          # the specification (contract)
├── docs/                   # this documentation set
├── backend/                # FastAPI platform core
├── web/                    # Management Web Dashboard (React + Vite + Ant Design)
└── mobile/                 # Employee Mobile App (Expo React Native)
```

## Step 3 — Backend core created (FRS §4, §5, §18, §20)

Files written:

| File | Purpose | FRS ref |
|---|---|---|
| `backend/requirements.txt` | Pinned deps | — |
| `backend/app/config.py` | Settings (DB URL, JWT, sync defaults) | §20 |
| `backend/app/db.py` | SQLAlchemy engine/session | §19 |
| `backend/app/models.py` | Canonical Phase-1 entities | §4.1 |
| `backend/app/security.py` | bcrypt, JWT, `requires(module, action)` RBAC | §5.3, §20.1 |
| `backend/app/seed.py` | Roles, **FRS §5.2 permission matrix**, departments, admin | §5.1, §5.2 |
| `backend/app/erp/mock_erp.py` | ERP adapter contract + deterministic mock + snapshot hashing | §18.2 |

Notes:
- Departments ↔ employees circular FK avoided by storing `head_employee_id` as a
  plain integer (SQLite cannot ALTER-add FKs).
- Default admin: `admin` / `admin123` (dev only — must be rotated before any real use).

## Step 4 — Direction change

- User reprioritised to **build the Web Dashboard and Mobile App first**, and to
  **document every step and process**. This log and the `docs/` set satisfy that.
- Backend scope for this phase is deliberately thin: identity, RBAC, dashboard KPIs,
  tasks, notifications, and the ERP sync contract. Everything else stays per the FRS
  roadmap.

## Step 5 — Employee Mobile App scaffolded (FRS 6.3)

- Scaffolded Expo app in `mobile/` (`create-expo-app` blank-typescript template,
  Expo SDK 57, React Native 0.86, React 19.2.3).
- Per `mobile/AGENTS.md`, read the exact v57 docs (expo-secure-store, SDK reference)
  before writing code.
- Installed: `@react-navigation/native`, `native-stack`, `bottom-tabs`,
  `react-native-screens`, `react-native-safe-area-context`, `expo-secure-store`,
  `expo-constants`. No icon library (tabs are text-only; no extra dependency).
- App layout:
  ```
  mobile/
  ├── App.tsx                    # SafeAreaProvider + AuthProvider + RootNavigator
  └── src/
      ├── config.ts              # API base from Expo hostUri (LAN) → http://<host>:8099/api/v1
      ├── theme.ts               # colors/spacing/priority palette
      ├── unread.ts              # module-level unread badge store
      ├── api/types.ts           # TS mirrors of backend payloads
      ├── api/client.ts          # fetch wrapper + bearer/auth/endpoints
      ├── auth/storage.ts        # SecureStore (native) / localStorage (web)
      ├── auth/AuthContext.tsx   # signIn/signOut, token + profile persistence
      ├── navigation/RootNavigator.tsx  # splash → Login stack | bottom tabs
      └── screens/
          ├── LoginScreen.tsx         # FRS 6.3.1 (employee code + password)
          ├── HomeScreen.tsx          # FRS 6.3.2 (TODAY / CURRENT TASK / URGENT / pulse)
          ├── TasksScreen.tsx         # my tasks + Start/Complete/Reopen
          ├── NotificationsScreen.tsx # All / Unread, tap to mark read
          └── ProfileScreen.tsx       # profile + access grants + sign out
  ```
- `app.json` name/slug → **Manatec Digital**.
- Verification:
  - `npx tsc --noEmit` → clean (strict mode).
  - `npx expo export --platform android` → Metro bundle OK (849 modules, 1.9 MB).
  - Live smoke test against running backend (127.0.0.1:8099): login as `manager`,
    `dashboard/overview`, `tasks/my`, `notifications/unread-count`, and
    `POST /tasks/{id}/status` all return payloads matching `api/types.ts`.
- Run with: `npx expo start` (backend must be up; device on same LAN resolves via hostUri).
- Next: web dashboard (React + Vite + Ant Design) in `web/`.

## Step 6 — Web Control Center scaffolded (FRS 6.2)

- Scaffolded `web/` with Vite 8 + React 19 + TypeScript (strict), Ant Design 6.6,
  `@ant-design/icons`. No react-router (state-based page switching keeps it minimal).
- Files:
  ```
  web/
  ├── index.html               # title "Manatec Digital"
  └── src/
      ├── main.tsx             # ConfigProvider (primary #1d4ed8) + antd <App> + AuthProvider
      ├── App.tsx              # spin → LoginPage | AppShell
      ├── AppShell.tsx         # FRS 6.2.1 shell: sider nav + header (search, bell, user menu)
      ├── config.ts            # VITE_API_URL override | http://127.0.0.1:8099/api/v1
      ├── unread.ts            # badge store for the bell
      ├── api/types.ts         # mirrors of backend payloads
      ├── api/client.ts        # fetch wrapper + all endpoints
      ├── auth/AuthContext.tsx # localStorage session, 401 → sign out
      └── pages/
          ├── LoginPage.tsx            # antd Form login
          ├── DashboardPage.tsx        # FRS 6.2.2 → KPI strip + departments + activity timeline
          ├── TasksPage.tsx            # Mine/Everyone + status filter + Start/Complete/Reopen
          ├── NotificationsPage.tsx    # All/Unread, mark read
          ├── AdminPage.tsx            # departments/employees/roles + create modals + role grants drawer
          └── AuditPage.tsx            # audit log with filters + before/after diff
  ```
- Role-filtered navigation (FRS 6.2.1): sider menu is built from the user's granted
  modules (Dashboard/Tasks/Notifications/Employees/Admin), so a role that lacks a
  module never sees its menu.
- Global search box is present in the header (FRS 6.2.1); wired to an endpoint when a
  search API lands (FRS roadmap).
- Verification:
  - `npm run build` → tsc + vite build OK (antd bundle ~1.1 MB / 355 kB gzip; the
    >500 kB warning is expected for antd — code-split later).
  - Dev server serves 200 at `http://127.0.0.1:5173`.
  - All endpoint payloads already live-tested in Step 5; web client types mirror them.
- Run: `npm run dev` (backend on 8099 must be up; CORS is open in dev).
- Next: real ERP adapter after Phase 0 discovery, or the FRS roadmap phase 3 modules.

## Step 6.1 — Mobile login gate removed (dev convenience)

- User asked to remove the mobile login page. Since the backend still enforces JWT,
  the app now **auto-signs-in as the demo `manager` user** on launch (FRS 6.3.1
  real PIN/SSO to replace this later).
- `src/auth/AuthContext.tsx`: fills a missing/stale session by calling
  `/auth/login` with a dev account; exposes `reconnect()` on failure.
- `src/navigation/RootNavigator.tsx`: deleted the native-stack login route; the
  signed-out state is a simple "Manatec Digital / RETRY" screen.
- `src/screens/LoginScreen.tsx` deleted. `tsc` clean; Metro bundle rebuilt (200).
- This is dev-only: credentials are hardcoded. Remove before any public build.

## Step 6.2 — Mobile app icon added

- Generated a branded **Manatec Digital** launcher icon with PIL
  (`/tmp/opencode/gen_icon.py`): indigo rounded-square gradient, thin inner ring,
  bold white "M" monogram.
- Wrote the full Expo icon set into `mobile/assets/`:
  - `icon.png` (1024, full icon — used by Expo Go / iOS / launcher)
  - `android-icon-background.png` (solid indigo adaptive background)
  - `android-icon-foreground.png` + `android-icon-monochrome.png` (transparent, "M" in the adaptive safe zone)
  - `splash-icon.png` (transparent, for the splash screen)
  - `favicon.png` (48, web favicon)
- Config already referenced these files in `app.json`; no config change needed.
- Also rendered the icon inside the app: the splash and the reconnect screen now
  show the logo image instead of plain text.
- Verified pixel geometry (sizes + transparency bboxes) with PIL; `tsc` clean;
  Metro bundle 200. Note: couldn't visually inspect the PNG (no image input in
  this model) — worth a quick human look at the launcher icon.

## Step 6.3 — Mobile stuck on entry screen: fixed with request timeouts

- Symptom: app stayed on the splash/entry page and never reached Home.
- Root cause: the API fetch had **no timeout**. When the phone could not reach
  `10.197.49.244:8099/api/v1`, the silent auto-login (Step 6.1) hung indefinitely,
  so `initializing` never resolved. (Backend itself was healthy.)
- Fix in `src/api/client.ts`: every request now aborts after **8 s**
  (`AbortController`) and surfaces `Server timed out at …` / `Cannot reach …`,
  so the entry screen transitions to the RETRY screen instead of hanging.
- Also fixed a brace error introduced while editing `api.login`.
- Verified: `tsc` clean, Metro bundle 200. On the phone: reload the app — it should
  quickly land on Home (server reachable) or on the RETRY screen (server not
  reachable — check same Wi-Fi).

## Step 6.4 — Tab bar icons added (mobile)

- Bottom tabs were text-only; installed `@expo/vector-icons` and added
  `tabBarIcon` (Ionicons) for Home / Tasks / Notifications / Profile, with
  focused (filled) vs unfocused (outline) variants and active-tint coloring.
- Fixed an invalid `md-`-prefixed glyph name (`checkmark-circle` is the valid one).
- Verified: `tsc` exit 0, Metro bundle 200.

## Step 6.5 — Global search wired + admin edit/delete (web + backend)

Closes two FRS 6.2.1 TODOs: the header search box was unwired, and admin had
no update/delete path.

- **Backend `app/routers/search.py`** — `GET /api/v1/search?q=` for any
  authenticated user; searches ERP cached items/products/customers/suppliers/
  sales orders/production orders (case-insensitive substring over code/name/
  order_no/customer/product) plus local employees, departments and tasks.
  Returns grouped hits `{kind, label, ref, page}` (max 5/kind), requiring ≥2
  chars. Registered in `main.py`.
- **Backend admin router** — added `PUT/DELETE /admin/departments/{id}`,
  `PUT/DELETE /admin/employees/{id}`, `PUT/DELETE /admin/users/{id}` and
  `GET /admin/users` (users were previously unlistable):
  - Updates use `exclude_unset` partial models; unique code/username conflicts
    → 409, unknown role → 400; every change is audited (before/after diff).
  - Deletes are guarded: department refuses while it has employees/tasks;
    employee refuses while referenced by a user/manager/department-head.
  - User "delete" is a safe **deactivate** (`active=False`); self-deactivate
    blocked; deactivated users get 401 on login.
  - RBAC: update → `Employees:edit`, delete → `Admin:delete`; operator still
    403 (tested). New schemas in `schemas.py`.
- **Web `AppShell.tsx`** — header `Input.Search` now queries the API with a
  300 ms debounce and shows grouped hits in a Popover (kind tag + label).
  Results are filtered to pages the user can actually see; clicking a hit
  navigates to Dashboard / Tasks / Administration.
- **Web `AdminPage.tsx`** — Departments and Employees tables gained Edit (modal,
  prefilled, reused for create) and Delete (Popconfirm). New **Users tab** lists
  users with role + active state and offers Edit (role change + optional
  password reset) and Deactivate.
- Verification: `pytest` 12 passed (added search + update/delete/RBAC tests);
  web `npm run build` clean (tsc + vite), `npm run lint` clean (only pre-existing
  warnings).

## Step 6.6 — Mobile ↔ backend contract audit, and the 4 gaps it exposed

Goal: make every mobile feature actually reach the backend, not just compile.

### The contract itself was already clean

Rather than eyeball 40-odd call sites, I checked them mechanically:

1. Dumped every route from the FastAPI app object and confirmed each path the
   mobile client calls exists (all 43 do).
2. Stood up the backend and captured **live payloads** for all 21 read
   endpoints as `manager`, plus every write path per role.
3. Wrote a validator that parses the interfaces out of `mobile/src/api/types.ts`
   and checks each recorded payload field-by-field (presence, primitive type,
   string-literal unions, nullability, nested objects/arrays).

Result: **0 errors**. The only findings were response fields the client did not
declare — `LedgerRow.item_id/code/description`, `LeaveRequest.employee_id` and
`leave/balances.as_of` — all now in `types.ts`.

The validator was regression-checked against a deliberately corrupted fixture
(dropped field, wrong primitive, bogus enum value, `null` for a non-nullable
field) and flagged every one, so the clean result is trustworthy.

Also confirmed while auditing:

- Every `can(module, action)` gate in the screens matches the backend
  `requires(module, action)` on the endpoint behind it (Stock edit, Quotes
  approve, Notices poster roles, guest security roles, roster HR roles).
- The tab-badge unread count is correct — HomeScreen feeds it from
  `notifications/unread_only=true`, which is the server's own unread count.
- `POST /production/orders/{id}/status` takes
  `planned → released → in_production → qc → packed → dispatched` (plus
  `cancelled`) and `ProductionScreen` already sends exactly those.

### The 4 real gaps (all fixed here)

| # | Gap | Why it mattered | Fix |
|---|---|---|---|
| 1 | Access token was never renewed | Backend issues an 8 h access token and a 14 d refresh token; the app stored the refresh token and never used it, so every user was kicked to the login screen twice a day | Silent refresh in `api/client.ts` |
| 2 | No way to raise a purchase order | The buy-list screen told the user "Raise one from the buy-list tab" — that button did not exist, and `api.createPurchaseOrder` had no caller. Procurement could only list, issue and cancel | "Raise N draft orders" on the buy-list |
| 3 | No goods receipt | `api.receivePurchaseOrder` had no caller, so an issued PO could only be cancelled and stock could never be received from mobile | `ReceiveSheet` on issued/partial POs |
| 4 | No stock movement history | `api.inventoryLedger` had no caller, so an adjustment could not be verified after posting | Per-item "History" sheet |

**Gap 1 — silent token refresh** (`api/client.ts`, `auth/AuthContext.tsx`)
- `refreshAccessToken()` posts the refresh token to `POST /auth/refresh`,
  swaps in the new access token and notifies AuthContext to persist it, so a
  renewal survives an app restart.
- Single-flight: concurrent callers share one in-flight refresh.
- Two triggers: proactive, from the JWT `exp` claim (renew 120 s early so a
  request never races the clock), and reactive, retrying once on a 401 for a
  token revoked server-side. The retry is never itself retried, so a dead
  refresh token cannot loop.
- `bootstrap` now restores from *either* token: a stale access token on disk
  gets renewed instead of logging the user out. A genuinely dead refresh token
  still clears the session and lands on Login.
- JWT payload decoding is hand-rolled base64 — Hermes does not expose `atob`
  everywhere, and this avoids a dependency.

**Gap 2 — raise POs from the buy-list** (`ProcurementScreen.tsx`)
- One PO per supplier, because a PO carries a single supplier; rows are grouped
  by the `supplier_id` the buy-list already returns, so no extra
  `catalog/suppliers` call and no extra permission is needed.
- Rows with no mapped supplier are counted and reported ("N rows skipped") rather
  than silently dropped. Gated on `Purchase:create`, matching the backend.
- On success the screen jumps to the ORDERS tab with a confirmation banner.

**Gap 3 — goods receipt** (`ProcurementScreen.tsx`)
- `ReceiveSheet` lists every open line pre-filled with its `remaining` qty
  (a delivery usually lands complete), with −/+ steppers and a numeric field.
- Guards the two ways this goes wrong in the field: an over-receipt is flagged
  before sending (the server rejects it with 409 "Over-receipt on line N"), and
  Confirm is disabled when nothing is entered.
- Gated on `Purchase:edit`, matching the backend.

**Gap 4 — movement history** (`StockScreen.tsx`)
- A "History" action on every row opens the item's ledger from
  `GET /inventory/ledger?item_id=`, showing type, timestamp, note and a
  signed delta badge.
- If the sheet is open while an adjustment is posted, it reloads, so it cannot
  show a stale balance.

### Verification

- `npx tsc --noEmit` → clean (strict).
- `npx expo export --platform android` → Metro bundle OK (2.5 MB).
- `pytest` → **22 passed**.
- End-to-end replay of the exact requests the new UI sends, against the live
  backend (`purchase` role), all passing:
  - buy-list → group by supplier → 1 draft PO raised per supplier (201, `draft`);
  - issue → `issued`; receive half a line → 200 and **stock on-hand rises by
    exactly the received qty**, PO becomes `partial`, `received_qty` tracked;
  - receive the balance → `completed`, no open lines;
  - over-receipt → 409 (the case the sheet warns about);
  - adjustment → ledger row carries every field the history sheet renders;
  - refresh: valid token works, `/auth/refresh` returns a working access token,
    a garbage refresh token 401s, a bogus access token 401s (the retry path).

### Not done / deliberate

- `api.unreadCount` and `api.catalogCategories` are still uncalled. Both are
  redundant with endpoints the app already uses, so they were left in place
  rather than removed — HomeScreen's unread feed already is the server count.
- No supplier picker for an ad-hoc PO: raising from the buy-list covers the
  flow the screen advertises, and it avoids requiring `Catalog:view` on top of
  `Purchase:view`.
- Step 6.1's auto-login is still dev-only hardcoded credentials; this change
  makes it *survive* longer, which does not make it production-safe.

---

## Step 6.7 — UI/UX pass: legibility, reachability, and honest loading

Driven by the `design-taste-frontend` skill, scoped to what actually applies to
a multi-step product UI (its own scope note excludes dashboards and product
flows, so its hero/bento/marquee/serif/image rules were skipped). Mode chosen
was **redesign-preserve**: the token file and information architecture were
already sound, so this is targeted evolution, not a new visual language.

Design read: a plant-floor operations app for shop-floor staff on a phone,
one-handed and often gloved, in bright plant lighting. Trust-first and
high-legibility, leaning dense-native rather than airy-marketing. No style was
introduced; the existing indigo/slate palette is preserved.

### What was actually broken (measured, not assumed)

| Finding | Evidence | Fix |
| --- | --- | --- |
| Body/caption text failed WCAG AA **app-wide** | `muted #64748b` on `bg #f1f5f9` = **4.34:1** (needs 4.5) | Retuned to `#617187` → 4.54:1 |
| Overlines, placeholders and inactive chip text failed badly | `textLight #94a3b8` on `bg` = **2.34:1** | Retuned to `#66707f` → 4.58:1 |
| Error banner text failed | `danger #dc2626` on `dangerSoft` = **3.95:1** | Retuned to `#ca2323` → 4.55:1 |
| Procurement buy-list badge failed | `teal #0d9488` on `tealSoft` = **3.32:1** | Retuned to `#0b7c72` → 4.50:1 |
| Buttons were not identifiable as controls | `borderStrong #cbd5e1` on card = **1.48:1** (needs 3) | New `controlBorder #8e959e` = 3.02:1, used only for interactive outlines |
| **Screen readers had almost nothing to read** | 30 `Pressable` controls, **2** accessibility labels in the whole app | **24/24** inline `Pressable`s now carry role, label and state |
| Goods-receipt steppers were 30×30 | Below the 44pt comfortable target | Shared `Stepper`, 44×44 buttons, labelled "Increase/Decrease …" |
| Every list flashed a generic spinner | 15 `<Loading>` call sites | `ScreenSkeleton` / `ListSkeleton` / `DetailSkeleton` shaped like the real content |
| Four forms used the placeholder as the label | Guest, Notices, Quotes, Leave | `Field` + `TextField`: real label above, hint/error below, label doubles as the accessibility name |
| Em-dashes in visible copy | 5 in strings, plus `formatDate` fallback | Zero in UI source; shared `NOT_SET = 'Not set'` |

A validator now parses `theme.ts` and checks **31 foreground/background pairs**
(0 failures). One genuine regression was caught this way and fixed: the new
selected-row state put caption grey on `primarySoft` (4.08:1), so selected rows
step their sublabel up to full-strength text.

### Shared primitives added

`Skeleton`, `ListSkeleton`, `DetailSkeleton`, `ScreenSkeleton`, `Field`,
`TextField`, `Chip`, `OptionRow`, `Stepper`, plus `mobile/src/motion.ts`
(`useReducedMotion`, `usePressFeedback`, `ripple`, `useEnter`).

Five hand-rolled near-duplicate chip implementations and three duplicated
product pickers were collapsed onto `Chip` / `OptionRow`, which is what makes
the accessibility and touch-target guarantees hold everywhere instead of
per-screen. Tabular numerals were added for quantities and money so columns
stay aligned while values change.

### Motion

Only where it carries meaning: press feedback and state-change entrances. All
of it routes through `useReducedMotion()`, which mirrors the OS setting and
collapses to an instant state swap. No decorative animation was added.

### Deliberately not done

- **No `expo-haptics`.** It is available in SDK 57 and would suit a gloved
  workflow, but it is a new native dependency that cannot be verified without a
  device, so core `Pressable` + `android_ripple` feedback was used instead.
  Worth adding once a device build is in the loop.
- **No dark mode.** The app is single-theme light; adding a second theme is a
  product decision, not a polish pass.
- **`Loading` kept** for short waits with no stable layout (modal bodies). It is
  now announced to assistive tech. Screens use skeletons.
- IA, nav labels, screen names, permissions and all API contracts untouched.

### Verified

- `cd mobile && npx tsc --noEmit` — clean.
- `npx tsc --noEmit --noUnusedLocals --noUnusedParameters` — clean (the refactor
  left no dead imports, styles or state behind).
- `npx expo export --platform android` — bundles, 2.5 MB, unchanged from before.
- Contrast validator over the parsed palette — 31/31 pairs pass.
- `24/24` inline `Pressable`s labelled; `0` em-dashes in UI source.
- Backend untouched, so `python -m pytest -q` (22 passed) still applies.

## Step 6.8 — Token lifetimes + refresh rotation/revocation (Phase 1, item 1)

First Phase 1 (P0 foundations) item from `AGENT.md` §14. Before this, the
access token lived 8 h and the refresh token was a stateless JWT that could
never be revoked; the spec requires 15–30 min access, rotation, revocation,
a device/session list and "logout all devices".

### Backend

- **`config.py`** — `token_expire_hours: 8` → `access_token_minutes: 30`
  (within the 15–30 AGENT.md target).
- **`models.py`** — new `RefreshSession` table: `jti` (unique), SHA-256
  `token_hash` (the token itself is never stored), `device`, `user_agent`,
  `ip`, `created_at`, `last_used_at`, `expires_at`, `revoked_at`,
  `revoked_reason`, `replaced_by_jti`.
- **`security.py`** — tokens now carry `jti`/`iat`/`type`; access is created
  from `access_token_minutes`; added `hash_token()` and
  `decode_token(expected_type=...)`. **`get_current_user` rejects a refresh
  token presented as a bearer.**
- **`app/sessions.py`** (new) — `issue_session`, `rotate_session`,
  `revoke_all`, `revoke_by_token`, `revoke_session`, `list_sessions`.
  Rotation retires the presented row and mints a new one. **Reuse detection:**
  presenting an already-retired/rotated token revokes the whole family.
- **`routers/auth.py`** — login issues a session; refresh returns a **new
  access + refresh pair**; added `GET /auth/sessions`,
  `DELETE /auth/sessions/{id}`, `POST /auth/logout`,
  `POST /auth/logout-all`; login/logout are audited.

### Clients (rotation is only safe if both persist the new refresh token)

- **mobile** `api/client.ts` — refresh reads and stores the rotated
  `refresh_token`; added `sessions`, `logout`, `logoutAll`. `AuthContext`
  revokes server-side on `signOut` and exposes `signOutAll`; ProfileScreen
  lists active devices and offers "Sign out of all devices".
- **web** — implemented silent refresh that was entirely missing (a 30 min
  access token would otherwise drop the session every half hour):
  single-flight `refreshAccessToken`, proactive renewal from the JWT `exp`,
  reactive retry once on 401, rotated-token persistence, global unauthorized
  handler, and server-side logout. `AuthContext` persists the refresh token.
- Fixed three pre-existing `tsc` errors in the unused
  `web/src/components/charts/Charts.tsx` (unused var/param, duplicate key)
  that were blocking `npm run build`.

### Verified

- `pytest` → **32 passed** (27 prior + 5 new: rotation + reuse detection,
  refresh-token-as-access rejected, session list + logout-all, single logout,
  short-lifetime assertion).
- Table auto-migrates onto the existing dev SQLite DB via `_add_missing_columns`.
- `mobile && npx tsc --noEmit` → clean.
- `web && npm run build` → clean; `npm run lint` → no new errors.

## Step 6.9 — Remove the last client role gate (Phase 1, item 2)

`AGENT.md` §2 requires UI gating on `Module:action` grants, never on
`user.role === "ADMIN"` (the ADMIN bypass is meant to live server-side only).

A full sweep for `isInRole` / role comparisons across `mobile/`, `web/` and
`backend/` found the migration already complete **except** the client-side
ADMIN bypass in `mobile/src/auth/permissions.ts::can()` and `hasModule()`.
Web `AppShell.has()` was already permission-only; backend `requires()` keeps
the ADMIN bypass deliberately.

- Removed both `if (user.role === 'ADMIN') return true;` shortcuts, with a
  comment explaining that the server seeds every permission for ADMIN, so the
  grant list is complete and the client can stay role-free. The only remaining
  `user.role` reads are display/cosmetic (`accentFor`, role labels).
- Added `test_admin_grants_cover_every_module_for_role_free_client_gating`:
  asserts ADMIN's `/auth/me` permissions cover all six actions for every
  module in the seeded matrix — the invariant that makes the role-free client
  check safe.

### Verified

- `pytest` → **33 passed** (added the admin-grant-coverage test).
- `mobile && npx tsc --noEmit` → clean.


