import { AtlasLogo } from "@/components/shared/logo";
import { SidebarNav } from "@/components/navigation/sidebar-nav";

function Sidebar() {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-surface md:flex">
      <div className="flex h-14 items-center border-b border-border px-4">
        <AtlasLogo />
      </div>
      <SidebarNav />
      <div className="border-t border-border px-4 py-3">
        <p className="text-xs text-subtle-foreground">Atlas V1 &middot; Automotive</p>
      </div>
    </aside>
  );
}

export { Sidebar };
