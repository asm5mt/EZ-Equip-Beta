import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import argon2 from "argon2";
import { db } from "./storage";
import {
  fleetEquipmentTypes,
  fleetRoles,
  fleetRolePermissions,
  oidcGroupMappings,
  inventoryCategories,
  inventoryCategoryFields,
  fleetFuelTypes,
  serviceFacilityTypes,
  systemSettings,
  lookupProviders,
  appSettings,
} from "@shared/schema";

// ---------------------------------------------------------------------------
// Schema version tagging
// ---------------------------------------------------------------------------

interface JournalEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}

// Every backup gets stamped with the tag of the most recent drizzle
// migration at export time; restore checks this against the running
// instance's own latest tag before attempting to apply anything.
export function getSchemaVersion(): string {
  const journalPath = path.resolve(process.cwd(), "migrations/meta/_journal.json");
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf-8")) as { entries: JournalEntry[] };
  if (!journal.entries?.length) {
    throw new Error("Migrations journal has no entries; cannot determine schema version");
  }
  const latest = journal.entries.reduce((a, b) => (b.idx > a.idx ? b : a));
  return latest.tag;
}

// ---------------------------------------------------------------------------
// Encryption: Argon2id key derivation + AES-256-GCM
// ---------------------------------------------------------------------------

// Same Argon2id parameters as the password hashing in server/auth.ts, which
// calls bare argon2.hash(password) — i.e. the argon2 library's own defaults.
// Kept explicit here since key derivation needs raw bytes plus a caller-
// supplied salt, not the encoded PHC hash string auth.ts stores.
const ARGON2_TIME_COST = 3;
const ARGON2_MEMORY_COST = 65536;
const ARGON2_PARALLELISM = 4;
const KEY_LENGTH = 32; // bytes -- AES-256 key size
const SALT_LENGTH = 16;
const IV_LENGTH = 12; // recommended GCM nonce size
const BACKUP_MAGIC = Buffer.from("EZBK", "ascii");
const BACKUP_FORMAT_VERSION = 1;

async function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    timeCost: ARGON2_TIME_COST,
    memoryCost: ARGON2_MEMORY_COST,
    parallelism: ARGON2_PARALLELISM,
    hashLength: KEY_LENGTH,
    salt,
    raw: true,
  });
}

// Encrypts `payload` with a key derived from `password` via Argon2id, then
// AES-256-GCM. The result is a single self-contained buffer: everything
// needed to decrypt (the Argon2id salt, the GCM IV, the auth tag, and the
// ciphertext) travels with it, so no key material is ever stored separately.
//
// Binary layout (fixed-size fields big-endian, ciphertext runs to EOF):
//   [4 bytes]  magic "EZBK"
//   [1 byte]   format version
//   [2 bytes]  salt length (N)     [N bytes]  salt
//   [2 bytes]  iv length (M)       [M bytes]  iv
//   [2 bytes]  authTag length (T)  [T bytes]  authTag
//   [rest]     ciphertext
export async function encryptBackup(payload: object, password: string): Promise<Buffer> {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = await deriveKey(password, salt);

  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf-8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const header = Buffer.alloc(4 + 1 + 2 + 2 + 2);
  let offset = 0;
  BACKUP_MAGIC.copy(header, offset); offset += BACKUP_MAGIC.length;
  header.writeUInt8(BACKUP_FORMAT_VERSION, offset); offset += 1;
  header.writeUInt16BE(salt.length, offset); offset += 2;
  header.writeUInt16BE(iv.length, offset); offset += 2;
  header.writeUInt16BE(authTag.length, offset); offset += 2;

  return Buffer.concat([header, salt, iv, authTag, ciphertext]);
}

// Reverses encryptBackup. Structural problems (not an EZ-Equip backup file,
// unsupported format version, truncated data) and crypto failures (wrong
// password, corrupted ciphertext -- AES-GCM's auth tag check rejects both)
// each throw a distinct, clear error. Never returns a partially-decrypted
// or garbage result.
export async function decryptBackup(data: Buffer, password: string): Promise<object> {
  const minHeaderLength = BACKUP_MAGIC.length + 1 + 2 + 2 + 2;
  if (data.length < minHeaderLength) {
    throw new Error("Not a valid EZ-Equip backup file: data too short");
  }

  let offset = 0;
  const magic = data.subarray(offset, offset + BACKUP_MAGIC.length); offset += BACKUP_MAGIC.length;
  if (!magic.equals(BACKUP_MAGIC)) {
    throw new Error("Not a valid EZ-Equip backup file: bad magic bytes");
  }
  const formatVersion = data.readUInt8(offset); offset += 1;
  if (formatVersion !== BACKUP_FORMAT_VERSION) {
    throw new Error(`Unsupported backup format version: ${formatVersion}`);
  }
  const saltLength = data.readUInt16BE(offset); offset += 2;
  const ivLength = data.readUInt16BE(offset); offset += 2;
  const authTagLength = data.readUInt16BE(offset); offset += 2;

  if (data.length < offset + saltLength + ivLength + authTagLength) {
    throw new Error("Not a valid EZ-Equip backup file: truncated data");
  }
  const salt = data.subarray(offset, offset + saltLength); offset += saltLength;
  const iv = data.subarray(offset, offset + ivLength); offset += ivLength;
  const authTag = data.subarray(offset, offset + authTagLength); offset += authTagLength;
  const ciphertext = data.subarray(offset);

  try {
    const key = await deriveKey(password, salt);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(plaintext.toString("utf-8"));
  } catch {
    throw new Error("Failed to decrypt backup: incorrect password or corrupted data");
  }
}

// ---------------------------------------------------------------------------
// Config tier: tables + secret-field stripping (shared by export and restore)
// ---------------------------------------------------------------------------

// "Config" tier = safe to export as plain, unencrypted, shareable JSON --
// instance/fleet configuration only, never operational or business data.
export const CONFIG_TIER_TABLES = {
  fleetEquipmentTypes,
  fleetRoles,
  fleetRolePermissions,
  oidcGroupMappings,
  inventoryCategories,
  inventoryCategoryFields,
  fleetFuelTypes,
  serviceFacilityTypes,
  systemSettings,
  lookupProviders,
  appSettings,
} as const;

type ConfigTierTableName = keyof typeof CONFIG_TIER_TABLES;

// Secret fields omitted entirely (never partially redacted -- e.g. no "was
// set" boolean) from a table's exported rows, keyed by table name.
const SECRET_FIELDS_BY_TABLE: Partial<Record<ConfigTierTableName, string[]>> = {
  systemSettings: ["oidcClientSecret", "zipLookupApiKey", "geocodingApiKey", "nhtsaLookupApiKey"],
  lookupProviders: ["authValue", "oauthClientSecret"],
};

function stripSecrets(row: Record<string, unknown>, secretFields: string[] | undefined): Record<string, unknown> {
  if (!secretFields || secretFields.length === 0) return row;
  const clone = { ...row };
  for (const field of secretFields) delete clone[field];
  return clone;
}

// Reads every config-tier table, stripping secret fields per
// SECRET_FIELDS_BY_TABLE, keyed by table name -- used by the config export
// route and, later, by restore's config-tier apply/preview.
export async function readConfigTierTables(): Promise<Record<string, Record<string, unknown>[]>> {
  const result: Record<string, Record<string, unknown>[]> = {};
  for (const [name, table] of Object.entries(CONFIG_TIER_TABLES)) {
    const rows = await db.select().from(table as any);
    const secretFields = SECRET_FIELDS_BY_TABLE[name as ConfigTierTableName];
    result[name] = (rows as Record<string, unknown>[]).map(row => stripSecrets(row, secretFields));
  }
  return result;
}
