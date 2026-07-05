import type { Express, Request, Response, NextFunction } from "express";
import argon2 from "argon2";
import { z } from "zod";
import { storage } from "./storage";
import type { User } from "@shared/schema";

declare module "express-session" {
  interface SessionData {
    userId?: number;
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
    if (user) req.user = user;
  }
  next();
}

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export function registerAuthRoutes(app: Express) {
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
      fleetIds: memberships.map(m => m.fleetId),
    });
  });
}
