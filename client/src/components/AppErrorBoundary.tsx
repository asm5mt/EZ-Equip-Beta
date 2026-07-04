import { Component, ReactNode } from "react";
import { AlertTriangle, Home, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type Props = { children: ReactNode };
type State = { error: Error | null; info: string | null };

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    this.setState({ error, info: info.componentStack });
    console.error("EZ-EQUIP render error", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
        <Card className="max-w-2xl w-full p-6 space-y-5">
          <div className="flex items-start gap-3">
            <div className="size-10 rounded-md bg-[hsl(var(--status-overdue)/0.12)] text-[hsl(var(--status-overdue))] flex items-center justify-center shrink-0">
              <AlertTriangle className="size-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">EZ-EQUIP hit a screen error</h1>
              <p className="text-sm text-muted-foreground mt-1">
                The app caught the crash instead of leaving a blank white screen. Try reloading, or send this error text with your next note.
              </p>
            </div>
          </div>
          <div className="rounded-md border border-border bg-muted/35 p-3">
            <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground mb-2">Error</div>
            <pre className="text-xs whitespace-pre-wrap break-words max-h-56 overflow-auto">{this.state.error.message}</pre>
            {this.state.info && (
              <pre className="text-[11px] text-muted-foreground whitespace-pre-wrap break-words max-h-48 overflow-auto mt-3">{this.state.info}</pre>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button type="button" onClick={() => window.location.reload()} data-testid="button-reload-after-error">
              <RotateCcw className="size-4 mr-1.5" /> Reload
            </Button>
            <Button type="button" variant="outline" onClick={() => { window.location.hash = "#/"; window.location.reload(); }} data-testid="button-home-after-error">
              <Home className="size-4 mr-1.5" /> Go to Dashboard
            </Button>
          </div>
        </Card>
      </div>
    );
  }
}
