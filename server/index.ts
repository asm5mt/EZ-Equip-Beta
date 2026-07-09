import "dotenv/config";
import express, { Response, NextFunction } from 'express';
import type { Request } from 'express';
import helmet from "helmet";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { registerRoutes } from "./routes";
import { initStorage, pool } from "./storage";
import { attachCurrentUser, bootstrapAdminPassword } from "./auth";
import { auditContext } from "./audit";
import { cleanupAuditLog } from "./retention";
import { serveStatic } from "./static";
import { createServer } from "node:http";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// Vite's dev server injects an inline script for React Fast Refresh that
// helmet's default script-src 'self' CSP would block, breaking local dev.
// Production serves a static build with no inline scripts, so full
// defaults apply there.
if (process.env.NODE_ENV === "production") {
  app.use(helmet());
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET is not set");
}

// Behind a reverse proxy (Nginx, etc.) terminating TLS, Express otherwise sees
// every request as plain HTTP and silently drops secure cookies on login.
// Trusting the first proxy hop makes req.secure reflect X-Forwarded-Proto.
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

app.use(session({
  store: new (connectPgSimple(session))({ pool, createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 8, // 8h, refreshed by rolling:true
  },
}));

app.use(attachCurrentUser);

app.use((req, _res, next) => {
  auditContext.run(
    { userId: req.user?.id ?? null, actorLabel: req.user?.username ?? "system", ip: req.ip ?? null },
    next,
  );
});

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await initStorage();
  await bootstrapAdminPassword();
  await registerRoutes(httpServer, app);

  await cleanupAuditLog().catch(err => console.error("[retention] Audit log cleanup failed:", err));
  setInterval(() => {
    cleanupAuditLog().catch(err => console.error("[retention] Audit log cleanup failed:", err));
  }, 1000 * 60 * 60 * 24);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
