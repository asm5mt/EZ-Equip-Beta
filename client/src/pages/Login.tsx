import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/Logo";
import { apiRequest } from "@/lib/queryClient";

interface LoginConfig {
  authMode: "local" | "oidc" | "both";
  oidcAvailable: boolean;
}

export default function Login({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const configQ = useQuery<LoginConfig>({ queryKey: ["/api/auth/login-config"] });
  const showLocalForm = !configQ.data || configQ.data.authMode !== "oidc";
  const showSso = configQ.data?.oidcAvailable && configQ.data.authMode !== "local";
  const oidcError = new URLSearchParams(window.location.search).get("oidcError") === "1";

  const login = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/auth/login", { username, password }),
    onSuccess: () => onLoggedIn(),
  });

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
      <Card className="max-w-sm w-full p-6 space-y-5">
        <div className="flex justify-center">
          <Logo size={32} />
        </div>
        {oidcError && (
          <p className="text-sm text-[hsl(var(--status-overdue))]" data-testid="text-oidc-error">
            SSO sign-in failed. Please try again or contact your administrator.
          </p>
        )}
        {showLocalForm && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              login.mutate();
            }}
          >
            <div>
              <Label htmlFor="login-username">Username</Label>
              <Input
                id="login-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
                data-testid="input-login-username"
              />
            </div>
            <div>
              <Label htmlFor="login-password">Password</Label>
              <Input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                data-testid="input-login-password"
              />
            </div>
            {login.isError && (
              <p className="text-sm text-[hsl(var(--status-overdue))]" data-testid="text-login-error">
                Invalid username or password.
              </p>
            )}
            <Button type="submit" className="w-full" disabled={!username || !password || login.isPending} data-testid="button-login-submit">
              {login.isPending ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        )}
        {showLocalForm && showSso && (
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">or</span>
            <div className="h-px flex-1 bg-border" />
          </div>
        )}
        {showSso && (
          <Button variant="outline" className="w-full" asChild data-testid="button-login-sso">
            <a href="/api/auth/oidc/login">Sign in with SSO</a>
          </Button>
        )}
      </Card>
    </div>
  );
}
