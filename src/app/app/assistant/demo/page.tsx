import { AlertTriangle, Info } from "lucide-react";

import { requireCurrentSession } from "@/features/auth/lib/current-session";
import { DemoSimulator } from "@/features/assistant/components/demo-simulator";
import { getAssistantService } from "@/features/assistant/service/assistant-service";

export const metadata = { title: "Assistant demo" };

export default async function AssistantDemoPage() {
  const { business } = await requireCurrentSession();
  const service = getAssistantService(business.id);
  const availability = await service.getAvailability();

  return (
    <div className="flex flex-col gap-6">
      <div role="note" className="flex items-start gap-3 rounded-lg border border-border bg-surface-2 p-4 text-sm text-muted-foreground">
        <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p>
          This is a <strong className="font-semibold text-foreground">demo simulation</strong>, not a live WhatsApp number. It is the real assistant
          — the same engine, the same AI and your real inventory — and enquiries it takes create real leads (source: assistant demo). Write like a
          customer: &ldquo;I need a grey sofa for a small living room, around 80k&rdquo;.
        </p>
      </div>

      {availability.available ? (
        <DemoSimulator greeting={await service.getGreeting()} businessName={business.name} />
      ) : (
        <div role="status" className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-foreground">
          <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <p>
            {availability.reason === "not_configured"
              ? "The AI isn't configured: set ANTHROPIC_API_KEY on the server to use the demo."
              : availability.reason === "disabled"
                ? "The assistant is switched off. Turn it on in Settings."
                : "Atlas Assistant currently supports furniture businesses."}
          </p>
        </div>
      )}
    </div>
  );
}
