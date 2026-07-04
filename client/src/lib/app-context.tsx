import { createContext, useContext, useState, useMemo, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Fleet, User, FleetMembership, FleetRole } from "@shared/schema";

export type Role = string;

interface AppContextValue {
  fleet: Fleet | null;
  fleets: Fleet[];
  setFleetId: (id: number) => void;
  currentUser: User | null;
  setCurrentUserId: (id: number) => void;
  users: User[];
  memberships: FleetMembership[];
  fleetRoles: FleetRole[];
  role: Role;
  permission: "viewer" | "editor" | "admin";
  canEdit: boolean;
  canAdmin: boolean;
  isLoaded: boolean;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [fleetId, setFleetId] = useState<number | null>(null);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);

  const fleetsQ = useQuery<Fleet[]>({ queryKey: ["/api/fleets"] });
  const usersQ = useQuery<User[]>({ queryKey: ["/api/users"] });
  const membershipsQ = useQuery<FleetMembership[]>({ queryKey: ["/api/fleet-memberships"] });

  const fleets = fleetsQ.data ?? [];
  const users = usersQ.data ?? [];
  const memberships = membershipsQ.data ?? [];

  const fleet = useMemo(() => {
    const id = fleetId ?? fleets[0]?.id ?? null;
    return id ? fleets.find(f => f.id === id) ?? null : null;
  }, [fleetId, fleets]);
  const fleetRolesQ = useQuery<FleetRole[]>({ queryKey: ["/api/fleet-roles", { fleetId: fleet?.id }], enabled: !!fleet?.id });
  const fleetRoles = fleetRolesQ.data ?? [];

  const currentUser = useMemo(() => {
    const id = currentUserId ?? users[0]?.id ?? null;
    return id ? users.find(u => u.id === id) ?? null : null;
  }, [currentUserId, users]);

  const role: Role = useMemo(() => {
    if (!fleet || !currentUser) return "viewer";
    const m = memberships.find(m => m.fleetId === fleet.id && m.userId === currentUser.id);
    return ((m?.role as Role) ?? "viewer");
  }, [fleet, currentUser, memberships]);

  const permission = useMemo<"viewer" | "editor" | "admin">(() => {
    const configured = fleetRoles.find(r => r.name === role);
    return ((configured?.permission as any) ?? (["viewer", "editor", "admin"].includes(role) ? role : "viewer"));
  }, [fleetRoles, role]);

  const value: AppContextValue = {
    fleet,
    fleets,
    setFleetId: (id: number) => setFleetId(id),
    currentUser,
    setCurrentUserId: (id: number) => setCurrentUserId(id),
    users,
    memberships,
    fleetRoles,
    role,
    permission,
    canEdit: permission === "editor" || permission === "admin",
    canAdmin: permission === "admin",
    isLoaded: fleetsQ.isSuccess && usersQ.isSuccess,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppContext must be used inside AppProvider");
  return ctx;
}
