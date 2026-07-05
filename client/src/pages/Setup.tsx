import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/Logo";
import { apiRequest } from "@/lib/queryClient";

export default function Setup({ onComplete }: { onComplete: () => void }) {
  const [fleetName, setFleetName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const setup = useMutation({
    mutationFn: async () =>
      apiRequest("POST", "/api/auth/setup", { fleetName, displayName, username, email, password }),
    onSuccess: () => onComplete(),
  });

  const canSubmit = fleetName && displayName && username && password.length >= 8 && !setup.isPending;

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
      <Card className="max-w-sm w-full p-6 space-y-5">
        <div className="flex justify-center">
          <Logo size={32} />
        </div>
        <div className="text-center">
          <h1 className="text-lg font-semibold">Welcome to EZ-Equip</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Set up your fleet and admin account to get started.
          </p>
        </div>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setup.mutate();
          }}
        >
          <div>
            <Label htmlFor="setup-fleet-name">Fleet name</Label>
            <Input
              id="setup-fleet-name"
              value={fleetName}
              onChange={(e) => setFleetName(e.target.value)}
              placeholder="e.g. Acme Fleet Services"
              autoFocus
              data-testid="input-setup-fleet-name"
            />
          </div>
          <div>
            <Label htmlFor="setup-display-name">Your name</Label>
            <Input
              id="setup-display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Alex Johnson"
              data-testid="input-setup-display-name"
            />
          </div>
          <div>
            <Label htmlFor="setup-username">Username</Label>
            <Input
              id="setup-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. alex"
              data-testid="input-setup-username"
            />
          </div>
          <div>
            <Label htmlFor="setup-email">Email (optional)</Label>
            <Input
              id="setup-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. alex@example.com"
              data-testid="input-setup-email"
            />
          </div>
          <div>
            <Label htmlFor="setup-password">Password</Label>
            <Input
              id="setup-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              data-testid="input-setup-password"
            />
          </div>
          {setup.isError && (
            <p className="text-sm text-[hsl(var(--status-overdue))]" data-testid="text-setup-error">
              Something went wrong. Please check your inputs and try again.
            </p>
          )}
          <Button type="submit" className="w-full" disabled={!canSubmit} data-testid="button-setup-submit">
            {setup.isPending ? "Setting up…" : "Create fleet and admin account"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
