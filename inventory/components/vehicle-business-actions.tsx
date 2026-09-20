import { Megaphone, Sparkles, TrendingUp, Wand2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ActionItem = {
  label: string;
  icon: typeof Megaphone;
};

const MARKETING_ACTIONS: ActionItem[] = [
  { label: "Generate listing", icon: Wand2 },
  { label: "Create social campaign", icon: Megaphone },
];

const INTELLIGENCE_ACTIONS: ActionItem[] = [
  { label: "Analyze vehicle performance", icon: TrendingUp },
  { label: "Suggest pricing", icon: Sparkles },
];

function ActionRow({ label, icon: Icon }: ActionItem) {
  return (
    <div
      className="flex cursor-not-allowed items-center justify-between gap-3 rounded-md px-1 py-2 opacity-60"
      title="Coming in a future Atlas mission"
    >
      <div className="flex items-center gap-2.5">
        <Icon className="h-4 w-4 text-subtle-foreground" />
        <span className="text-sm text-foreground">{label}</span>
      </div>
      <Badge variant="default">Soon</Badge>
    </div>
  );
}

function VehicleBusinessActions() {
  return (
    <Card className="border-intelligence/20">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-intelligence" />
          <CardTitle>Business Actions</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 pt-0">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Marketing
          </p>
          <div className="flex flex-col divide-y divide-border">
            {MARKETING_ACTIONS.map((action) => (
              <ActionRow key={action.label} {...action} />
            ))}
          </div>
        </div>

        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Atlas Intelligence
          </p>
          <div className="flex flex-col divide-y divide-border">
            {INTELLIGENCE_ACTIONS.map((action) => (
              <ActionRow key={action.label} {...action} />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export { VehicleBusinessActions };
