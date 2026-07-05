import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";

export function NoFleetAssigned({ onLogout }: { onLogout: () => void }) {
  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
      <Card className="max-w-md w-full p-6 text-center space-y-4">
        <div className="flex justify-center">
          <Logo size={32} />
        </div>
        <div>
          <h1 className="text-lg font-semibold">No fleet assigned</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Your account doesn't have access to any fleet yet. Contact your System
            Administrator to request access.
          </p>
        </div>
        <Button variant="outline" onClick={onLogout} data-testid="button-no-fleet-logout">
          Log out
        </Button>
      </Card>
    </div>
  );
}
