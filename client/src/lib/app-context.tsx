import { createContext, useContext, useMemo, useState, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Fleet, User, FleetMembership, FleetRole } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";

export type Role = string;
export type FleetRoleWithPermissions = FleetRole & { permissions: string[] };

export interface CurrentUser {
  id: number;
  username: string;
  displayName: string;
  email: string | null;
  systemAdmin: boolean;
  authProvider: string;
  fleetIds: number[];
}

const EDIT_PERMISSIONS = ["assets.edit", "meters.edit", "schedules.manage", "service.edit", "inventory.manage"];

interface AppContextValue {
  fleet: Fleet | null;
  fleets: Fleet[];
  setFleetId: (id: number) => void;
  currentUser: CurrentUser;
  users: User[];
  memberships: FleetMembership[];
  fleetRoles: FleetRoleWithPermissions[];
  role: Role;
  canEdit: boolean;
  canAdmin: boolean;
  systemAdmin: boolean;
  isLoaded: boolean;
  logout: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children, me }: { children: ReactNode; me: CurrentUser }) {
  const [fleetId, setFleetId] = useState<number | null>(null);

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
  const fleetRolesQ = useQuery<FleetRoleWithPermissions[]>({ queryKey: ["/api/fleet-roles", { fleetId: fleet?.id }], enabled: !!fleet?.id });
  const fleetRoles = fleetRolesQ.data ?? [];

  const currentRole = useMemo<FleetRoleWithPermissions | null>(() => {
    if (!fleet) return null;
    const m = memberships.find(m => m.fleetId === fleet.id && m.userId === me.id);
    if (!m) return null;
    return fleetRoles.find(r => r.id === m.roleId) ?? null;
  }, [fleet, memberships, fleetRoles, me.id]);

  const role: Role = me.systemAdmin && !currentRole ? "admin" : currentRole?.name ?? "viewer";
  const permissions = useMemo(() => new Set(currentRole?.permissions ?? []), [currentRole]);

  const logout = async () => {
    await apiRequest("POST", "/api/auth/logout");
    queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
  };

  const value: AppContextValue = {
    fleet,
    fleets,
    setFleetId: (id: number) => setFleetId(id),
    currentUser: me,
    users,
    memberships,
    fleetRoles,
    role,
    canEdit: me.systemAdmin || EDIT_PERMISSIONS.some(key => permissions.has(key)),
    canAdmin: me.systemAdmin || permissions.has("roles.manage"),
    systemAdmin: me.systemAdmin,
    isLoaded: fleetsQ.isSuccess && usersQ.isSuccess,
    logout,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppContext must be used inside AppProvider");
  return ctx;
}
