import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { requireCurrentSession } from "@/features/auth/lib/current-session";
import { EVEREST_NAME } from "@/features/everest/domain/brand";
import { EverestLauncher } from "@/features/everest/components/everest-launcher";

export default async function AppLayout({ children }: { children: ReactNode }) {
  // The authoritative auth check — middleware only confirmed a cookie
  // is present (it can't reach the DB from the Edge runtime); this is
  // the real, DB-backed validation (token exists, not expired) that
  // every protected route ultimately depends on.
  const { user, business } = await requireCurrentSession();

  return (
    <AppShell user={user} business={business}>
      {children}
      {/* Everest: the staff-facing assistant, a floating button on every page that opens a side panel. */}
      <EverestLauncher everestName={EVEREST_NAME} />
    </AppShell>
  );
}
