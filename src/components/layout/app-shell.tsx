import type { ReactNode } from "react";

import { Sidebar } from "@/components/navigation/sidebar";
import { Topbar } from "@/components/navigation/topbar";
import type { Business } from "@/features/auth/domain/business";
import type { User } from "@/features/auth/domain/user";

type AppShellProps = {
  children: ReactNode;
  user: User;
  business: Business;
};

/**
 * The application frame. The shell is exactly one viewport tall and never
 * scrolls itself: the sidebar stays put and <main> is the single scroll
 * container. `min-w-0` on the column and `overflow-x-hidden` on <main>
 * are the containment backstop — individual wide components (tables,
 * code, long strings) still scroll or wrap inside their own cards.
 */
function AppShell({ children, user, business }: AppShellProps) {
  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background">
      <a
        href="#main-content"
        className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:absolute focus:left-3 focus:top-3"
      >
        Skip to content
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar user={user} business={business} />
        <main
          id="main-content"
          tabIndex={-1}
          className="scroll-thin min-w-0 flex-1 overflow-y-auto overflow-x-hidden focus-visible:outline-none"
        >
          <div className="mx-auto w-full min-w-0 max-w-[88rem] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

export { AppShell };
