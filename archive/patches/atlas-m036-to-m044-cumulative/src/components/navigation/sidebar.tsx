import { AtlasLogo } from "@/components/shared/logo";
import { SidebarNav } from "@/components/navigation/sidebar-nav";

function Sidebar() {
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-surface md:flex">
      <div className="flex h-14 shrink-0 items-center border-b border-border px-5">
        <AtlasLogo />
      </div>
      <SidebarNav />
      <div className="shrink-0 border-t border-border px-5 py-3">
        <p className="text-xs text-subtle-foreground">Atlas V1 &middot; Automotive</p>
      </div>
    </aside>
  );
}

export { Sidebar };
