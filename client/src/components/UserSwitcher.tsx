import { ChevronDown, Info, LogOut, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Logo } from "./Logo";
import { useAppContext } from "@/lib/app-context";
import { APP_VERSION, BUILD_NUMBER, BUILD_TIME } from "@/lib/version";

export function UserSwitcher() {
  const { currentUser, fleet, fleets, setFleetId, role, logout } = useAppContext();
  const display = currentUser.displayName;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="w-9 px-0 md:w-auto md:px-3" data-testid="button-user-menu" aria-label="User and fleet menu">
          <UserIcon className="size-4 md:mr-1.5" />
          <span className="hidden md:inline">{display}</span>
          <ChevronDown className="hidden md:block size-3.5 ml-1 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>Active Fleet</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={fleet ? String(fleet.id) : ""}
          onValueChange={v => setFleetId(Number(v))}
        >
          {fleets.map(f => (
            <DropdownMenuRadioItem key={f.id} value={String(f.id)} data-testid={`menuitem-fleet-${f.id}`}>
              {f.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled className="text-xs uppercase tracking-wider text-muted-foreground">
          Role: {role}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <Dialog>
          <DialogTrigger asChild>
            {/* preventDefault stops the menu from closing/returning focus before
                the dialog claims it — the standard fix for Dialog-in-DropdownMenu. */}
            <DropdownMenuItem onSelect={e => e.preventDefault()} data-testid="menuitem-about">
              <Info className="size-4 mr-1.5" /> About
            </DropdownMenuItem>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="sr-only">About EZ-Equip</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col items-center text-center gap-2 py-2">
              <Logo size={40} withWordmark={false} />
              <div className="text-lg font-semibold">EZ-Equip</div>
              <div className="text-sm text-muted-foreground">Sessanna Consulting</div>
              <div className="mt-3 text-xs text-muted-foreground space-y-1">
                <div>Version {APP_VERSION} · Build {BUILD_NUMBER}</div>
                <div>Built {new Date(BUILD_TIME).toLocaleString()}</div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        <DropdownMenuItem onClick={() => logout()} data-testid="menuitem-logout">
          <LogOut className="size-4 mr-1.5" /> Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
