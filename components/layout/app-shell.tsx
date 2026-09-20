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

function AppShell({ children, user, business }: AppShellProps) {
  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar user={user} business={business} />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

export { AppShell };
