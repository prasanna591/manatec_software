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
