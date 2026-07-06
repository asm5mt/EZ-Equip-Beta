import type { Express, Request, Response, NextFunction } from "express";
import argon2 from "argon2";
import { z } from "zod";
import { storage, userHasSystemAdminPermission } from "./storage";
import type { User } from "@shared/schema";

declare module "express-session" {
  interface SessionData {
    userId?: number;
    // Scratch data for an in-flight OIDC login, cleared on success/failure.
    oidc?: {
      state: string;
      nonce: string;
      codeVerifier: string;
    };
  }
}

declare global {
  namespace Express {
    interface Request {
      user?: User;
      resolvedFleetId?: number;
    }
  }
}

export async function attachCurrentUser(req: Request, _res: Response, next: NextFunction) {
  if (req.session.userId != null) {
    const user = await storage.getUser(req.session.userId);
    if (user) {
      // Fold the grantable "system.admin" fleet-role permission into the same
      // systemAdmin flag every downstream check already reads, alongside the
      // hardcoded users.system_admin bootstrap flag.
      const systemAdmin = user.systemAdmin || await userHasSystemAdminPermission(user.id);
      req.user = { ...user, systemAdmin };
    }
  }
  next();
}

// Fresh installs seed/create system-admin users with password_hash = NULL --
// nobody can log in until someone sets a password. If ADMIN_BOOTSTRAP_PASSWORD
// is set, apply it once to the first system admin that still has no password.
// Safe to leave the env var set permanently: it only ever touches a NULL
// password_hash, so it never overwrites a password set via the UI/CLI later.
export async function bootstrapAdminPassword() {
  const bootstrapPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  if (!bootstrapPassword) return;
  if (bootstrapPassword.length < 8) {
    console.warn("[auth] ADMIN_BOOTSTRAP_PASSWORD is set but shorter than 8 characters; skipping.");
    return;
  }
  const users = await storage.listUsers();
  const target = users.find(u => u.systemAdmin && !u.passwordHash);
  if (!target) return;
  const passwordHash = await argon2.hash(bootstrapPassword);
  await storage.updateUser(target.id, { passwordHash });
  console.log(`[auth] Bootstrap password set for system admin "${target.username}" from ADMIN_BOOTSTRAP_PASSWORD.`);
}

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const changeOwnPasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
  confirmPassword: z.string().min(1),
}).refine(data => data.newPassword === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

const setupSchema = z.object({
  fleetName: z.string().min(1),
  displayName: z.string().min(1),
  username: z.string().min(1),
  email: z.string().email().optional().or(z.literal("")),
  password: z.string().min(8),
});

function slugifyFleetName(name: string): string {
  const base = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return base || "fleet";
}

export function registerAuthRoutes(app: Express) {
  // First-run setup: only reachable while the users table is empty. Once any
  // user exists this always 409s, so it can't be used to re-provision later.
  app.get("/api/auth/setup-status", async (_req, res) => {
    const users = await storage.listUsers();
    res.json({ needsSetup: users.length === 0 });
  });

  // Public (pre-auth): tells the Login page whether to show local
  // username/password, an SSO link, or both.
  app.get("/api/auth/login-config", async (_req, res) => {
    const settings = await storage.getSystemSettings();
    const oidcAvailable = settings.authMode !== "local"
      && !!settings.oidcIssuerUrl && !!settings.oidcClientId && !!settings.oidcRedirectUri;
    res.json({ authMode: settings.authMode, oidcAvailable });
  });

  app.post("/api/auth/setup", async (req, res) => {
    const existingUsers = await storage.listUsers();
    if (existingUsers.length > 0) return res.status(409).json({ error: "already_initialized" });

    const parsed = setupSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "validation_error" });
    const { fleetName, displayName, username, email, password } = parsed.data;

    const fleet = await storage.createFleet({ name: fleetName, slug: slugifyFleetName(fleetName), currency: "USD", notes: null });
    const passwordHash = await argon2.hash(password);
    const user = await storage.createUser({
      username,
      displayName,
      email: email || null,
      passwordHash,
      systemAdmin: true,
    });
    const roles = await storage.listFleetRoles(fleet.id);
    const adminRole = roles.find(r => r.name === "admin")!;
    await storage.upsertFleetMembership({ fleetId: fleet.id, userId: user.id, roleId: adminRole.id, grantedBy: "manual" });

    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ error: "internal_error" });
      req.session.userId = user.id;
      res.json({ id: user.id, username: user.username, displayName: user.displayName, systemAdmin: user.systemAdmin });
    });
  });

  app.post("/api/auth/login", async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "validation_error" });
    const { username, password } = parsed.data;

    const user = await storage.getUserByUsername(username);
    // Constant-shape response whether the user doesn't exist or the password
    // is wrong — don't leak which one failed.
    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: "invalid_credentials" });
    }
    const ok = await argon2.verify(user.passwordHash, password);
    if (!ok) return res.status(401).json({ error: "invalid_credentials" });

    // Regenerate the session on login to prevent session fixation.
    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ error: "internal_error" });
      req.session.userId = user.id;
      res.json({ id: user.id, username: user.username, displayName: user.displayName, systemAdmin: user.systemAdmin });
    });
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) return res.status(500).json({ error: "internal_error" });
      res.clearCookie("connect.sid");
      res.json({ ok: true });
    });
  });

  app.get("/api/auth/me", async (req, res) => {
    if (!req.user) return res.status(401).json({ error: "not_authenticated" });
    const memberships = (await storage.listFleetMemberships()).filter(m => m.userId === req.user!.id);
    res.json({
      id: req.user.id,
      username: req.user.username,
      displayName: req.user.displayName,
      email: req.user.email,
      systemAdmin: req.user.systemAdmin,
      authProvider: req.user.authProvider,
      fleetIds: memberships.map(m => m.fleetId),
    });
  });

  // Self-service password change — distinct from the admin-only
  // PATCH /api/users/:id/password. Always targets req.session.userId (via
  // req.user, which attachCurrentUser derives solely from the session); the
  // request body can never name a different target user.
  app.patch("/api/auth/me/password", async (req, res) => {
    if (!req.user) return res.status(401).json({ error: "not_authenticated" });
    const parsed = changeOwnPasswordSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "validation_error" });
    const { currentPassword, newPassword } = parsed.data;

    if (req.user.authProvider !== "local") {
      return res.status(403).json({ error: "not_local_account" });
    }
    if (!req.user.passwordHash || !(await argon2.verify(req.user.passwordHash, currentPassword))) {
      return res.status(401).json({ error: "invalid_current_password" });
    }

    const passwordHash = await argon2.hash(newPassword);
    await storage.updateUser(req.user.id, { passwordHash });
    res.json({ ok: true });
  });
}
