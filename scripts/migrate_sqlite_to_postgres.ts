// One-off data migration: copies rows from the legacy SQLite data.db into the
// Postgres database pointed to by DATABASE_URL, preserving primary keys and
// resetting each table's serial sequence afterward. Run once per environment
// via `npm run db:migrate-data` after `drizzle-kit generate`/migrate has
// created the Postgres schema.
import "dotenv/config";
import Database from "better-sqlite3";
import { Pool } from "pg";

const SQLITE_PATH = process.env.EZ_EQUIP_SQLITE_PATH || "data.db";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

const BOOLEAN_COLUMNS: Record<string, string[]> = {
  users: ["system_admin"],
  fleet_equipment_types: ["enable_vin_features", "active"],
  fleet_roles: ["built_in"],
  inventory_categories: ["active"],
  inventory_category_fields: ["required"],
  fleet_fuel_types: ["active"],
  assets: ["is_active"],
  maintenance_schedules: ["active"],
  inventory_items: ["low_stock_alert", "reorder_reminder", "cost_tracking", "stocked"],
};

const TIMESTAMP_COLUMNS: Record<string, string[]> = {
  assets: ["acquisition_date", "meter_as_of"],
  meter_readings: ["reading_date"],
  service_events: ["performed_at"],
  inventory_movements: ["occurred_at"],
  attachments: ["created_at"],
  app_settings: ["updated_at"],
};

// FK-safe insertion order.
const TABLES = [
  "fleets",
  "sites",
  "users",
  "fleet_memberships",
  "fleet_equipment_types",
  "fleet_roles",
  "inventory_categories",
  "inventory_category_fields",
  "fleet_fuel_types",
  "inventory_items",
  "assets",
  "meter_readings",
  "maintenance_schedules",
  "maintenance_schedule_assignments",
  "service_events",
  "service_line_items",
  "inventory_movements",
  "attachments",
  "app_settings",
];

function convertRow(table: string, row: Record<string, unknown>) {
  const booleanCols = BOOLEAN_COLUMNS[table] ?? [];
  const timestampCols = TIMESTAMP_COLUMNS[table] ?? [];
  const out: Record<string, unknown> = { ...row };
  for (const col of booleanCols) {
    if (col in out && out[col] != null) out[col] = Boolean(out[col]);
  }
  for (const col of timestampCols) {
    // sqlite integer timestamp columns (drizzle-orm sqlite-core `mode: "timestamp"`) store unix epoch *seconds*.
    if (col in out && out[col] != null) out[col] = new Date(Number(out[col]) * 1000);
  }
  return out;
}

async function main() {
  const sqlite = new Database(SQLITE_PATH, { readonly: true });
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (const table of TABLES) {
      const rows = sqlite.prepare(`SELECT * FROM ${table}`).all() as Record<string, unknown>[];
      if (rows.length === 0) continue;

      const columns = Object.keys(rows[0]);
      for (const row of rows) {
        const converted = convertRow(table, row);
        const values = columns.map((c) => converted[c]);
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
        const quotedColumns = columns.map((c) => `"${c}"`).join(", ");
        await client.query(
          `INSERT INTO "${table}" (${quotedColumns}) VALUES (${placeholders})`,
          values,
        );
      }
      console.log(`${table}: migrated ${rows.length} row(s)`);

      if (columns.includes("id")) {
        await client.query(
          `SELECT setval(pg_get_serial_sequence($1, 'id'), COALESCE((SELECT MAX(id) FROM "${table}"), 1), true)`,
          [table],
        );
      }
    }

    await client.query("COMMIT");
    console.log("Migration complete.");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
    sqlite.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
