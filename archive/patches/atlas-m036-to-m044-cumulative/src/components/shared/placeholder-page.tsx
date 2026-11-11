import type { LucideIcon } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";

function PlaceholderPage({
  title,
  description,
  icon: Icon,
  note,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  note: string;
}) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-md bg-surface-2">
            <Icon className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground">
            {title} isn&apos;t connected yet
          </p>
          <p className="max-w-sm text-sm text-muted-foreground">{note}</p>
        </CardContent>
      </Card>
    </>
  );
}

export { PlaceholderPage };
