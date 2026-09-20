import Link from "next/link";

import type { User } from "@/features/auth/domain/user";
import { ActivityTypeBadge } from "./activity-type-badge";
import type { Activity } from "../domain/activity";

type ActivityTimelineProps = {
  activities: Activity[];
  usersById: Map<string, User>;
  /** Show which lead each entry belongs to — useful on the customer page (a mixed, multi-lead timeline), not on a lead's own page. */
  showLeadContext?: boolean;
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-KE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Mission 017 — the one activity timeline implementation, reused by
 * both the customer and lead detail pages rather than duplicated.
 * Purely presentational: it renders whatever page of activities it's
 * given (already business-scoped, already paginated, already ordered
 * newest-first by the service) and resolves actor names from a
 * pre-fetched `usersById` map — no data fetching happens in here.
 */
function ActivityTimeline({ activities, usersById, showLeadContext }: ActivityTimelineProps) {
  if (activities.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        No activity recorded yet.
      </p>
    );
  }

  return (
    <ol className="flex flex-col gap-3">
      {activities.map((activity) => {
        const actor = usersById.get(activity.userId);
        return (
          <li key={activity.id} className="rounded-md border border-border px-3 py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <ActivityTypeBadge type={activity.type} />
              <span className="text-xs text-muted-foreground">{formatDateTime(activity.createdAt)}</span>
            </div>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm text-foreground">{activity.content}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>{actor ? actor.name : "Unknown user"}</span>
              {showLeadContext && activity.leadId && (
                <Link
                  href={`/app/leads/${activity.leadId}`}
                  className="text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  View lead
                </Link>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export { ActivityTimeline };
