import { ChevronDown, LogOut, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import { useAppContext } from "@/lib/app-context";

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
        <DropdownMenuItem onClick={() => logout()} data-testid="menuitem-logout">
          <LogOut className="size-4 mr-1.5" /> Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
