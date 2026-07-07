import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronDown, Info, KeyRound, LogOut, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuSeparator, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Logo } from "./Logo";
import { useAppContext } from "@/lib/app-context";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { APP_VERSION, BUILD_NUMBER, BUILD_TIME } from "@/lib/version";

function ChangePasswordDialog() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const passwordLongEnough = newPassword.length >= 8;
  const passwordsMatch = newPassword === confirmPassword;
  const canSubmit = currentPassword.length > 0 && passwordLongEnough && passwordsMatch && confirmPassword.length > 0;

  const reset = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  };

  const changePassword = useMutation({
    mutationFn: async () => apiRequest("PATCH", "/api/auth/me/password", { currentPassword, newPassword, confirmPassword }),
    onSuccess: () => {
      toast({ title: "Password updated" });
      reset();
      setOpen(false);
    },
    onError: (e: any) => {
      const message = e?.status === 401
        ? "Current password is incorrect."
        : e?.status === 403
          ? "SSO accounts can't set a local password."
          : "Please try again.";
      toast({ title: "Update failed", description: message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={next => { setOpen(next); if (!next) reset(); }}>
      <DialogTrigger asChild>
        <DropdownMenuItem onSelect={e => e.preventDefault()} data-testid="menuitem-change-password">
          <KeyRound className="size-4 mr-1.5" /> Change Password
        </DropdownMenuItem>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Change Password</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Current Password</Label>
            <Input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} data-testid="input-current-password" />
          </div>
          <div>
            <Label>New Password</Label>
            <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} data-testid="input-new-password-self" />
          </div>
          <div>
            <Label>Confirm New Password</Label>
            <Input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} data-testid="input-confirm-password-self" />
          </div>
          {newPassword.length > 0 && !passwordLongEnough && (
            <p className="text-sm text-[hsl(var(--status-overdue))]" data-testid="text-password-too-short-self">
              Password must be at least 8 characters.
            </p>
          )}
          {confirmPassword.length > 0 && !passwordsMatch && (
            <p className="text-sm text-[hsl(var(--status-overdue))]" data-testid="text-password-mismatch-self">
              Passwords do not match.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button disabled={!canSubmit || changePassword.isPending} onClick={() => changePassword.mutate()} data-testid="button-save-password-self">
            <KeyRound className="size-4 mr-1.5" /> {changePassword.isPending ? "Saving…" : "Save Password"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function UserSwitcher() {
  const { currentUser, role, logout } = useAppContext();
  const display = currentUser.displayName;
  const orgInfoQ = useQuery<{ orgName: string | null; orgLogoUrl: string | null }>({ queryKey: ["/api/org-info"] });
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="w-9 px-0 md:w-auto md:px-3" data-testid="button-user-menu" aria-label="User menu">
          <UserIcon className="size-4 md:mr-1.5" />
          <span className="hidden md:inline">{display}</span>
          <ChevronDown className="hidden md:block size-3.5 ml-1 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuItem disabled className="text-xs uppercase tracking-wider text-muted-foreground">
          Role: {role}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {currentUser.authProvider === "local" && (
          <>
            <ChangePasswordDialog />
            <DropdownMenuSeparator />
          </>
        )}
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
            <div className="flex flex-col items-center text-center py-2">
              <Logo size={40} trademark />
              <div className="mt-2 text-xs text-muted-foreground">© 2026 Sessanna Consulting</div>

              {orgInfoQ.data?.orgName && (
                <div className="mt-4">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Organization</div>
                  <div className="mt-0.5 text-sm font-medium" data-testid="text-about-org-name">{orgInfoQ.data.orgName}</div>
                </div>
              )}

              <div className="mt-4 w-full grid gap-0.5 pt-3 border-t border-border text-xs text-muted-foreground">
                <div>Version {APP_VERSION} · Build {BUILD_NUMBER}</div>
                <div>Built {new Date(BUILD_TIME).toLocaleString()}</div>
              </div>

              <div className="mt-2 text-[10px] leading-relaxed text-muted-foreground/60" data-testid="text-about-license">
                Open-source software, licensed under the GNU Affero General Public License v3.0 (AGPL-3.0).
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
