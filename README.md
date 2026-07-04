# EZ-EQUIP

Equipment maintenance tracker for fleets, garages, and shops. Replaces a
maintenance spreadsheet with a clean web app: assets with primary meters,
either-trigger maintenance schedules, service event logging with line-item
parts consumption, inventory with low-stock alerts, and a multi-fleet,
multi-user model with role-based access.

Built as a self-hosted, single-process Node app backed by SQLite — small
enough to run on a workshop laptop, structured cleanly enough to migrate
to PostgreSQL and ASP.NET Core when the time comes.

---

## Stack

- **Frontend:** React 18, Vite, TypeScript, Tailwind CSS v3, shadcn/ui, wouter (hash routing), TanStack Query v5
- **Backend:** Express 4, Drizzle ORM
- **Database:** SQLite (`better-sqlite3`) — single file, idempotent schema
- **Bundling:** Single Node process serves the API and the built SPA
- **Containerization:** Multi-stage Dockerfile + docker-compose

The frontend deliberately uses **no browser storage** (no `localStorage`,
`sessionStorage`, `indexedDB`, or cookies). All persistent state lives in
the SQLite database. UI state — current fleet, simulated user, theme — is
held in React state and rebuilt on each load.

---

## Quick start (development)

Requires Node.js 20+.

```bash
npm install
npm run dev
```

The dev server starts on port **5000** and serves both the API and the
Vite-powered React app on the same port. SQLite is created automatically
at `data.db` in the project root the first time the server boots, with a
seeded fleet so you can navigate immediately.

Useful scripts:

| Script           | Purpose                                              |
| ---------------- | ---------------------------------------------------- |
| `npm run dev`    | Dev server with HMR                                  |
| `npm run check`  | TypeScript typecheck                                 |
| `npm run build`  | Production build to `dist/`                          |
| `npm run start`  | Run the production build (`NODE_ENV=production`)     |
| `npm run db:push`| Drizzle schema push (rarely needed; see Schema below)|

---

## Run with Docker

```bash
docker compose up --build
```

The image:

- Builds the React app and the Node bundle in a Debian-slim build stage.
- Ships only `dist/` and production deps in the runtime stage.
- Persists `ez-equip.db` in a named volume `ez_equip_data` mounted at `/data`.
- Exposes port **5000**.

To use a host-mounted directory instead of a named volume, replace the
volume mapping with a bind mount:

```yaml
volumes:
  - ./data:/data
```

The database path inside the container is controlled by
`EZ_EQUIP_DB_PATH` (defaults to `/data/ez-equip.db` in the image).

### Backups

The app writes to a single SQLite file. Back it up with:

```bash
docker compose exec ez-equip sqlite3 /data/ez-equip.db ".backup '/data/backup.db'"
```

Then copy `backup.db` out of the volume.

---

## Application model

| Concept | Notes |
| ------- | ----- |
| **Fleets** | Top-level tenants. Sites belong to fleets. Assets belong to fleets. |
| **Sites** | Physical locations within a fleet (garage, shop, yard). |
| **Users + memberships** | Each user has a role (`viewer`, `editor`, `admin`) per fleet. The Admin page exposes user/fleet/membership management. |
| **Assets** | Vehicles, trailers, tractors, generators, snowmobiles, ATVs, lawn equipment, generic equipment. Each has a primary meter (`mileage`, `hours`, `count`, or a custom-labeled meter). |
| **Meter readings** | Append-only log per asset. Posting a reading newer than the current value bumps `asset.currentMeter`. Service events also auto-create a meter reading when meter-at-service is supplied. |
| **Maintenance schedules** | Per-asset rules with optional **meter interval** and **day interval**. Either trigger fires the schedule due — that is, a 5,000-mile / 6-month rule fires whichever is reached first. Annual/time-only schedules (e.g., NY inspection) are first-class. |
| **Service events** | Repairs, scheduled services, inspections. May reference a schedule. Carry vendor/technician/cost/notes. |
| **Service line items** | Parts and fluids consumed during a service. Each line either references an inventory item (decrementing stock and writing a movement) or is a one-off (free-form name + part number). |
| **Inventory items + movements** | Parts, fluids, filters, consumables. Stocked items participate in low-stock alerts; ad-hoc items are tracked but never trigger reorder. Every change writes an inventory movement. |

The either-trigger rule is the core domain invariant. See
`client/src/lib/schedule.ts` for the reference implementation.

---

## Project layout

```
ez-equip/
├── client/                  # React app
│   └── src/
│       ├── App.tsx          # hash router + AppProvider
│       ├── components/      # AppShell, Logo, QuickAddSheet, GlobalSearch, UserSwitcher
│       ├── lib/             # queryClient, format, schedule, app-context
│       └── pages/           # Dashboard, Assets, AssetDetail, AssetForm, …
├── server/
│   ├── index.ts             # Express bootstrap (template default)
│   ├── routes.ts            # /api/* CRUD endpoints
│   ├── storage.ts           # Drizzle storage + seed
│   └── vite.ts              # Vite middleware (template default)
├── shared/
│   └── schema.ts            # Drizzle tables, Zod insert schemas, shared types
├── Dockerfile
├── docker-compose.yml
└── README.md
```

---

## Schema and storage

The Drizzle schema in `shared/schema.ts` is the source of truth. The
storage layer (`server/storage.ts`) runs a `CREATE TABLE IF NOT EXISTS`
pass on boot so the SQLite file is always in sync with the schema —
**no migration step is required for normal operation**. `npm run db:push`
remains available if you prefer to drive the schema with drizzle-kit.

`seedIfEmpty()` runs once when the DB is empty and populates the
`Sessanna Home Fleet` with three users (`jaimy` / `tech` / `viewer`),
four assets, sample maintenance schedules, an oil-change event, and
six inventory items so the app is immediately interactive.

---

## API reference (high-level)

All endpoints live under `/api/`. Bodies are JSON; insert payloads are
validated with Zod schemas from `shared/schema.ts`.

| Endpoint | Methods |
| -------- | ------- |
| `/api/fleets` | `GET`, `POST` |
| `/api/sites`, `/api/fleets/:id/sites` | `POST`, `GET` |
| `/api/users`, `/api/fleet-memberships` | `GET`, `POST` |
| `/api/assets[?fleetId=…]`, `/api/assets/:id` | `GET`, `POST`, `PATCH`, `DELETE` |
| `/api/meter-readings[?assetId=…]` | `GET`, `POST` |
| `/api/schedules[?assetId=…]`, `/api/schedules/:id` | `GET`, `POST`, `PATCH`, `DELETE` |
| `/api/service-events[?assetId=…]`, `/api/service-events/:id` | `GET`, `POST` |
| `/api/service-line-items[?serviceEventId=…]` | `GET`, `POST` |
| `/api/inventory-items[?fleetId=…]`, `/api/inventory-items/:id` | `GET`, `POST`, `PATCH`, `DELETE` |
| `/api/inventory-movements[?itemId=…]` | `GET`, `POST` |
| `/api/search?q=…` | `GET` (assets, inventory, service events) |

---

## Migration notes

EZ-EQUIP is intentionally portable. The following migration paths are
supported by the existing schema and are sketched here for the future:

### 1. PostgreSQL

`shared/schema.ts` uses Drizzle's `sqliteTable` types. The migration to
PostgreSQL is a structural rename:

- Replace `drizzle-orm/sqlite-core` imports with `drizzle-orm/pg-core` and
  swap `sqliteTable` → `pgTable`, `integer({ mode: "boolean" })` → `boolean`,
  `integer({ mode: "timestamp" })` → `timestamp({ withTimezone: true })`.
- Replace `better-sqlite3` with `pg` + `drizzle-orm/node-postgres`.
- Drop the bespoke `CREATE TABLE IF NOT EXISTS` block in `server/storage.ts`
  and use drizzle-kit migrations against PostgreSQL.

No data shape changes are required — there are no SQLite-specific column
types in use beyond JSON-as-text fields, which Postgres handles natively.

### 2. ASP.NET Core / .NET

The schema maps cleanly to EF Core entities:

- One DbSet per Drizzle table; FKs as navigation properties.
- The `evaluateSchedule` rule (see `client/src/lib/schedule.ts`) becomes a
  domain service in the .NET project — port the function as-is.
- The REST surface is intentionally thin; controllers can mirror the
  routes in `server/routes.ts` 1-to-1.
- Use Npgsql + EF Core migrations against the same PostgreSQL database
  for a Node→.NET cutover with no downtime: stand up the .NET service
  reading the same DB, then switch the load balancer.

### 3. Active Directory / SSO

Local users live in the `users` table with a nullable `passwordHash`. The
plan is to retire local auth in two steps:

1. Introduce an OIDC/SAML middleware (or AD via LDAP) that maps the
   verified subject to a `users.username`. Existing rows are reused; new
   logins auto-provision a row.
2. Continue to read `fleet_memberships` for authorization. Group-claim
   mappings can populate `fleet_memberships.role` automatically. The role
   model (`viewer | editor | admin`) was deliberately kept small so it
   maps cleanly to AD security groups.

The current "simulate user" switcher in the topbar is a developer-only
device; remove the `UserSwitcher` component once auth is wired.

---

## Conventions

- **Hash routing.** Routes use wouter's `useHashLocation`. Internal
  navigation goes through `<Link href="/...">`. The hash prefix is
  applied automatically.
- **Query keys.** `["/api/path"]`, `["/api/path", id]`,
  `["/api/path", { fleetId }]`. The default `queryFn` in
  `client/src/lib/queryClient.ts` understands all three forms.
- **Mutations.** All write requests go through `apiRequest` from
  `lib/queryClient`. After every mutation, invalidate the relevant
  `queryKey` prefix.
- **Test IDs.** Every interactive element and dynamic display has a
  `data-testid` attribute following `{action}-{target}` and
  `{type}-{id}` patterns.
- **Either-trigger rule.** A schedule with both meter and day intervals
  is overdue when **either** runs out. Implemented in `lib/schedule.ts`
  and surfaced consistently on the dashboard, asset detail, and the
  Maintenance overview page.
- **No browser storage.** Anywhere persistence would tempt the use of
  `localStorage`, write to the API instead.

---

## Roadmap

- File attachments on service events (receipts, photos)
- CSV import for legacy spreadsheets
- Per-asset cost-per-mile rollups
- Mobile-friendly meter capture (camera OCR of odometers)
- AD/SSO integration (see Migration notes)

---

(C) 2026 Sessanna Consulting
