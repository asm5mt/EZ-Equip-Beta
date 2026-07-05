// One-off bootstrap/reset: argon2-hash a password and write it to a user's
// password_hash column. Needed because after the local-auth cutover, every
// existing user row has password_hash = NULL -- nobody can log in without this.
//
// Usage: tsx scripts/set-user-password.ts <username> <new-password>
import "dotenv/config";
import { Pool } from "pg";
import argon2 from "argon2";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

async function main() {
  const [username, password] = process.argv.slice(2);
  if (!username || !password) {
    console.error("Usage: tsx scripts/set-user-password.ts <username> <new-password>");
    process.exit(1);
  }
  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    const { rows } = await client.query(`SELECT id, username FROM users WHERE username = $1`, [username]);
    if (rows.length === 0) {
      throw new Error(`No user found with username "${username}".`);
    }
    const passwordHash = await argon2.hash(password);
    await client.query(`UPDATE users SET password_hash = $1 WHERE username = $2`, [passwordHash, username]);
    console.log(`Password set for user "${username}" (id ${rows[0].id}).`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
