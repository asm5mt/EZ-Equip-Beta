import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { Request, Response } from "express";

// Never distinguish "rate limited" from any other failure in the response
// body — that itself would be an information leak.
function rateLimitHandler(_req: Request, res: Response) {
  res.status(429).json({ error: "rate_limited", message: "Too many attempts. Please try again later." });
}

// Volumetric guard against a single source hammering the login endpoint.
export const loginIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

// Tighter per-account guard so a distributed attack (many IPs, one target
// username) still gets locked out even though the IP limiter above wouldn't
// catch it.
export const loginUsernameLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const username = typeof req.body?.username === "string" ? req.body.username.trim().toLowerCase() : "";
    return username || ipKeyGenerator(req.ip ?? "");
  },
  handler: rateLimitHandler,
});

// The OIDC callback doesn't accept a password, but it's still an
// unauthenticated endpoint that mints a session on success, so it gets the
// same volumetric protection as local login.
export const oidcCallbackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});
