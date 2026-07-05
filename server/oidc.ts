import type { Express } from "express";
import * as client from "openid-client";
import { storage } from "./storage";

async function discoverConfig(issuerUrl: string, clientId: string, clientSecret?: string | null) {
  return client.discovery(new URL(issuerUrl), clientId, clientSecret || undefined);
}

export function registerOidcRoutes(app: Express) {
  // Begin an OIDC login: redirect the browser to the IdP's authorization
  // endpoint with PKCE, state, and nonce. Scratch values live on the
  // session so /callback can verify them after the round trip.
  app.get("/api/auth/oidc/login", async (req, res) => {
    const settings = await storage.getSystemSettings();
    if (settings.authMode === "local" || !settings.oidcIssuerUrl || !settings.oidcClientId || !settings.oidcRedirectUri) {
      return res.status(400).json({ error: "oidc_not_enabled" });
    }
    try {
      const config = await discoverConfig(settings.oidcIssuerUrl, settings.oidcClientId, settings.oidcClientSecret);
      const codeVerifier = client.randomPKCECodeVerifier();
      const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
      const state = client.randomState();
      const nonce = client.randomNonce();
      req.session.oidc = { state, nonce, codeVerifier };
      const authUrl = client.buildAuthorizationUrl(config, {
        redirect_uri: settings.oidcRedirectUri,
        scope: "openid profile email groups",
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
        state,
        nonce,
      });
      res.redirect(authUrl.toString());
    } catch (err) {
      console.error("[oidc] login failed:", err);
      res.redirect("/?oidcError=1");
    }
  });

  app.get("/api/auth/oidc/callback", async (req, res) => {
    const scratch = req.session.oidc;
    if (!scratch) return res.redirect("/?oidcError=1");
    delete req.session.oidc;

    const settings = await storage.getSystemSettings();
    if (settings.authMode === "local" || !settings.oidcIssuerUrl || !settings.oidcClientId || !settings.oidcRedirectUri) {
      return res.redirect("/?oidcError=1");
    }

    try {
      const config = await discoverConfig(settings.oidcIssuerUrl, settings.oidcClientId, settings.oidcClientSecret);
      const currentUrl = new URL(req.originalUrl, `${req.protocol}://${req.get("host")}`);
      const tokens = await client.authorizationCodeGrant(config, currentUrl, {
        pkceCodeVerifier: scratch.codeVerifier,
        expectedState: scratch.state,
        expectedNonce: scratch.nonce,
      });
      const claims = tokens.claims();
      if (!claims) return res.redirect("/?oidcError=1");

      const sub = String(claims.sub);
      const email = typeof claims.email === "string" ? claims.email : null;
      const name = typeof claims.name === "string" ? claims.name : null;
      const preferredUsername = typeof claims.preferred_username === "string" ? claims.preferred_username : null;
      const groups = Array.isArray(claims.groups) ? claims.groups.filter((g): g is string => typeof g === "string") : [];

      const allUsers = await storage.listUsers();
      let user = allUsers.find(u => u.authProvider === "oidc" && u.externalId === sub);
      if (!user && email) {
        // "Convert to OIDC" leaves externalId null so the next real OIDC
        // login can claim/link the account by matching email.
        const claimable = allUsers.find(u => u.authProvider === "oidc" && u.externalId == null && u.email === email);
        if (claimable) {
          user = await storage.updateUser(claimable.id, { externalId: sub });
        }
      }
      if (!user) {
        const username = preferredUsername ?? email ?? sub;
        user = await storage.createUser({
          username,
          displayName: name ?? username,
          email,
          passwordHash: null,
          systemAdmin: false,
          authProvider: "oidc",
          externalId: sub,
        });
      } else {
        user = await storage.updateUser(user.id, { displayName: name ?? user.displayName, email: email ?? user.email }) ?? user;
      }

      if (groups.length > 0) {
        const mappings = (await storage.listOidcGroupMappings()).filter(m => groups.includes(m.groupName));
        if (mappings.length > 0) {
          const memberships = (await storage.listFleetMemberships()).filter(m => m.userId === user!.id);
          for (const mapping of mappings) {
            const existing = memberships.find(m => m.fleetId === mapping.fleetId);
            // Never overwrite a manually-granted membership with a group sync.
            if (existing && existing.grantedBy !== "group") continue;
            await storage.upsertFleetMembership({
              fleetId: mapping.fleetId,
              userId: user.id,
              roleId: mapping.roleId,
              grantedBy: "group",
            });
          }
        }
      }

      req.session.regenerate((err) => {
        if (err) return res.redirect("/?oidcError=1");
        req.session.userId = user!.id;
        res.redirect("/");
      });
    } catch (err) {
      console.error("[oidc] callback failed:", err);
      res.redirect("/?oidcError=1");
    }
  });
}

// Discovery-only connectivity check for the Authentication settings UI --
// never completes a login, just confirms the issuer is reachable and
// exposes an OIDC discovery document.
export async function testOidcConnection(issuerUrl: string, clientId: string, clientSecret?: string | null) {
  const config = await discoverConfig(issuerUrl, clientId, clientSecret);
  const metadata = config.serverMetadata();
  return {
    issuer: metadata.issuer,
    authorizationEndpoint: metadata.authorization_endpoint,
    tokenEndpoint: metadata.token_endpoint,
  };
}
