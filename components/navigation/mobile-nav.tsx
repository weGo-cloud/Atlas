"use client";

import { useState } from "react";
import { Menu } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet";
import { AtlasLogo } from "@/components/shared/logo";
import { SidebarNav } from "@/components/navigation/sidebar-nav";

function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetTitle>Atlas navigation</SheetTitle>
        <SheetDescription>Browse Atlas sections</SheetDescription>
        <div className="flex h-14 items-center border-b border-border px-4">
          <AtlasLogo />
        </div>
        <SidebarNav onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}

export { MobileNav };
