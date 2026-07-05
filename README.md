# EZ-EQUIP

Equipment maintenance tracker for fleets, garages, and shops. Replaces a
maintenance spreadsheet with a clean web app: assets with primary meters,
either-trigger maintenance schedules, service event logging with line-item
parts consumption, inventory with low-stock alerts, and a multi-fleet,
multi-user model with role-based access.

Built as a self-hosted, single-process Node app backed by PostgreSQL —
structured cleanly enough to migrate to ASP.NET Core when the time comes.

---

## Stack

- **Frontend:** React 18, Vite, TypeScript, Tailwind CSS v3, shadcn/ui, wouter (hash routing), TanStack Query v5
- **Backend:** Express 4, Drizzle ORM
- **Database:** PostgreSQL (`pg` + `drizzle-orm/node-postgres`), schema-versioned with drizzle-kit migrations
- **Bundling:** Single Node process serves the API and the built SPA
- **Containerization:** Multi-stage Dockerfile + docker-compose (app + Postgres)

The frontend deliberately uses **no browser storage** (no `localStorage`,
`sessionStorage`, `indexedDB`, or cookies). All persistent state lives in
the Postgres database. UI state — current fleet, simulated user, theme — is
held in React state and rebuilt on each load.

---

## Quick start (development)

Requires Node.js 20+ and a running PostgreSQL instance.

```bash
docker run -d --name ez-equip-dev-postgres \
  -e POSTGRES_USER=ez_equip -e POSTGRES_PASSWORD=ez_equip -e POSTGRES_DB=ez_equip \
  -p 5433:5432 postgres:16-alpine

echo "DATABASE_URL=postgres://ez_equip:ez_equip@localhost:5433/ez_equip" > .env

npm install
npm run dev
```

The dev server starts on port **5000** and serves both the API and the
Vite-powered React app on the same port. On boot the app runs any pending
drizzle-kit migrations against `DATABASE_URL`. If no users exist yet, the
app shows a first-run setup wizard where you create your fleet and admin
account before logging in.

Useful scripts:

| Script                  | Purpose                                                     |
| ----------------------- | ------------------------------------------------------------ |
| `npm run dev`           | Dev server with HMR                                          |
| `npm run check`         | TypeScript typecheck                                         |
| `npm run build`         | Production build to `dist/`                                  |
| `npm run start`         | Run the production build (`NODE_ENV=production`)              |
| `npm run db:generate`   | Generate a new drizzle-kit migration from `shared/schema.ts` |
| `npm run db:push`       | Drizzle schema push (dev convenience, bypasses migrations)    |
| `npm run db:migrate-data` | One-off: copy rows from a legacy `data.db` SQLite file into `DATABASE_URL` |

---

## Run with Docker

```bash
docker compose up --build
```

`docker-compose.yml` starts two services:

- **postgres** — PostgreSQL 16, data persisted in the named volume `ez_equip_pgdata`.
- **ez-equip** — builds the React app and the Node bundle in a Debian-slim
  build stage, ships only `dist/`, the generated `migrations/`, and
  production deps in the runtime stage, and connects to `postgres` via
  `DATABASE_URL`. Exposes port **5000**.

### Backups

Back up the Postgres volume with `pg_dump`:

```bash
docker compose exec postgres pg_dump -U ez_equip ez_equip > backup.sql
```

Restore with `psql -U ez_equip -d ez_equip < backup.sql`.

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
├── migrations/               # drizzle-kit generated SQL migrations
├── scripts/
│   └── migrate_sqlite_to_postgres.ts  # one-off legacy data.db → Postgres import
├── Dockerfile
├── docker-compose.yml
└── README.md
```

---

## Schema and storage

The Drizzle schema in `shared/schema.ts` is the source of truth. Schema
changes are captured as versioned SQL files in `migrations/` via
`npm run db:generate`. On boot, `server/storage.ts` runs any pending
migrations against `DATABASE_URL` (`drizzle-orm/node-postgres/migrator`)
before serving traffic.

On first run (empty `users` table), the app serves a setup wizard
(`GET /api/auth/setup-status`, `POST /api/auth/setup`) that creates your
first fleet and admin account. Every fleet created — via the wizard or
later by an admin — is seeded with a default set of equipment types
(vehicle, generator, trailer, tractor, ATV, snowmobile, lawn, equipment),
fuel types, the built-in `viewer` / `editor` / `admin` roles, and starter
inventory categories (oil, filter, fluid, part) via `createFleet()` in
`server/storage.ts`.

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

EZ-EQUIP is intentionally portable. PostgreSQL is now the primary
datastore; the following migration paths remain sketched here for the
future:

### 1. PostgreSQL — done

`shared/schema.ts` uses Drizzle's `pgTable` types, `server/storage.ts`
connects via `pg` + `drizzle-orm/node-postgres`, and schema changes ship
as drizzle-kit migrations in `migrations/`. Existing installs still
running the legacy SQLite `data.db` can move their data over with:

```bash
npm run db:migrate-data   # reads ./data.db, writes to $DATABASE_URL
```

Run this once against an empty, freshly-migrated Postgres database —
it preserves row IDs and resets each table's serial sequence afterward.

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
