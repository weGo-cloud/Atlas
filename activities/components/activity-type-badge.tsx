import { Calendar, CalendarCheck, FileText, Flag, Handshake, Mail, Phone, Trophy, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { ACTIVITY_TYPE_LABEL, type ActivityType } from "../domain/activity";

const TYPE_VARIANT: Record<ActivityType, "primary" | "warning" | "success" | "default" | "destructive"> = {
  note: "default",
  call: "primary",
  meeting: "primary",
  email: "primary",
  lead_created: "success",
  status_change: "warning",
  follow_up_scheduled: "warning",
  follow_up_completed: "success",
  // Mission 018
  deal_created: "success",
  deal_status_changed: "warning",
  // Mission 019
  sale_created: "success",
};

const TYPE_ICON: Record<ActivityType, typeof FileText> = {
  note: FileText,
  call: Phone,
  meeting: Users,
  email: Mail,
  lead_created: Flag,
  status_change: Flag,
  follow_up_scheduled: Calendar,
  follow_up_completed: CalendarCheck,
  // Mission 018
  deal_created: Handshake,
  deal_status_changed: Handshake,
  // Mission 019
  sale_created: Trophy,
};

function ActivityTypeBadge({ type }: { type: ActivityType }) {
  const Icon = TYPE_ICON[type];
  return (
    <Badge variant={TYPE_VARIANT[type]}>
      <Icon className="h-3 w-3" />
      {ACTIVITY_TYPE_LABEL[type]}
    </Badge>
  );
}

export { ActivityTypeBadge };
