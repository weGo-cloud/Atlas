import type { ReactNode } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { AssistantTabs } from "@/features/assistant/components/assistant-tabs";

export default function AssistantLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <PageHeader
        className="mb-4"
        title="Atlas Assistant"
        description="An AI sales assistant that answers customers from your live inventory — on your website and WhatsApp."
      />
      <AssistantTabs />
      {children}
    </>
  );
}
