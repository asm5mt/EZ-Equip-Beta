import { ChevronDown, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import { useAppContext } from "@/lib/app-context";

export function UserSwitcher() {
  const { currentUser, users, setCurrentUserId, fleet, fleets, setFleetId, role } = useAppContext();
  const display = currentUser?.displayName ?? "User";
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
        <DropdownMenuLabel>Simulate User</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={currentUser ? String(currentUser.id) : ""}
          onValueChange={v => setCurrentUserId(Number(v))}
        >
          {users.map(u => (
            <DropdownMenuRadioItem key={u.id} value={String(u.id)} data-testid={`menuitem-user-${u.id}`}>
              {u.displayName}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled className="text-xs uppercase tracking-wider text-muted-foreground">
          Role: {role}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
