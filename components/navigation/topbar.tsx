"use client";

import { usePathname } from "next/navigation";
import { Search, Bell, LogOut, Settings, User as UserIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { findNavItem } from "@/components/navigation/nav-items";
import { MobileNav } from "@/components/navigation/mobile-nav";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOutAction } from "@/features/auth/actions/auth-actions";
import type { Business } from "@/features/auth/domain/business";
import type { User } from "@/features/auth/domain/user";
import { USER_ROLE_LABEL } from "@/features/auth/domain/user";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

type TopbarProps = {
  user: User;
  business: Business;
};

function Topbar({ user, business }: TopbarProps) {
  const pathname = usePathname();
  const activeItem = findNavItem(pathname);
  const pageLabel = activeItem?.label ?? "Overview";

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background px-4">
      <MobileNav />

      <div className="flex min-w-0 items-center gap-1.5 text-sm">
        <span className="text-subtle-foreground">{business.name}</span>
        <span className="text-subtle-foreground">/</span>
        <span className="truncate font-medium text-foreground">{pageLabel}</span>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          className={cn(
            "hidden items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-subtle-foreground transition-colors sm:flex",
            "hover:bg-surface-2 hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          )}
        >
          <Search className="h-4 w-4" />
          <span>Search Atlas&hellip;</span>
          <kbd className="ml-6 rounded-sm border border-border-strong bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-subtle-foreground">
            &#8984;K
          </kbd>
        </button>

        <button
          type="button"
          aria-label="Notifications"
          className="relative flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Bell className="h-4.5 w-4.5" />
          <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-primary" />
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Account menu"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold text-foreground transition-colors hover:bg-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {initials(user.name)}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>
              {user.name}
              <span className="block text-xs font-normal text-muted-foreground">
                {USER_ROLE_LABEL[user.role]} · {business.name}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <UserIcon className="h-4 w-4" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Settings className="h-4 w-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={(event) => {
                event.preventDefault();
                void signOutAction();
              }}
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

export { Topbar };
