// One-off backfill for the auth/permissions phase-1 migration cutover.
// Run after migration A (additive: fleet_role_permissions/oidc_group_mappings/
// system_settings tables + fleet_memberships.role_id/granted_by, legacy
// fleet_roles.permission and fleet_memberships.role still present) and
// before migration B (drops the legacy columns, makes role_id NOT NULL).
//
// - Populates fleet_role_permissions from each role's legacy `permission`
//   tier (viewer/editor/admin), so a custom role someone already retitled
//   still gets the right default set.
// - Populates fleet_memberships.role_id by matching (fleet_id, name) against
//   the legacy `role` string.
// - Seeds the single system_settings row.
import "dotenv/config";
import { Pool } from "pg";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  viewer: ["assets.view", "inventory.view", "data.export"],
  editor: [
    "assets.view", "inventory.view", "data.export",
    "assets.edit", "assets.delete", "meters.log", "meters.edit",
    "schedules.manage", "service.log", "service.edit", "inventory.manage",
  ],
  admin: [
    "assets.view", "inventory.view", "data.export",
    "assets.edit", "assets.delete", "meters.log", "meters.edit",
    "schedules.manage", "service.log", "service.edit", "inventory.manage",
    "fleets.manage_settings", "users.manage", "roles.manage",
  ],
};

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { rows: roles } = await client.query(
      `SELECT id, fleet_id, name, permission FROM fleet_roles`,
    );
    let permissionRows = 0;
    for (const role of roles) {
      const keys = DEFAULT_ROLE_PERMISSIONS[role.permission] ?? DEFAULT_ROLE_PERMISSIONS.viewer;
      for (const key of keys) {
        await client.query(
          `INSERT INTO fleet_role_permissions (role_id, permission_key) VALUES ($1, $2)`,
          [role.id, key],
        );
        permissionRows++;
      }
    }
    console.log(`fleet_role_permissions: inserted ${permissionRows} row(s) for ${roles.length} role(s)`);

    const { rowCount: membershipsUpdated } = await client.query(`
      UPDATE fleet_memberships fm
      SET role_id = fr.id
      FROM fleet_roles fr
      WHERE fr.fleet_id = fm.fleet_id AND fr.name = fm.role
    `);
    console.log(`fleet_memberships: backfilled role_id on ${membershipsUpdated} row(s)`);

    const { rows: unmatched } = await client.query(
      `SELECT id, fleet_id, user_id, role FROM fleet_memberships WHERE role_id IS NULL`,
    );
    if (unmatched.length > 0) {
      throw new Error(
        `${unmatched.length} membership row(s) had no matching fleet_roles row: ${JSON.stringify(unmatched)}`,
      );
    }

    const { rowCount: settingsInserted } = await client.query(`
      INSERT INTO system_settings (auth_mode)
      SELECT 'local'
      WHERE NOT EXISTS (SELECT 1 FROM system_settings)
    `);
    console.log(`system_settings: inserted ${settingsInserted} row(s)`);

    await client.query("COMMIT");
    console.log("Backfill complete.");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
