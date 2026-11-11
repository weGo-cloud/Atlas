import { requireCurrentSession } from "@/features/auth/lib/current-session";
import { EverestChat } from "@/features/everest/components/everest-chat";
import { EVEREST_NAME } from "@/features/everest/domain/brand";
import { getEverestService } from "@/features/everest/service";

export const metadata = { title: `${EVEREST_NAME} · Atlas` };

export default async function EverestPage() {
  const { user, business } = await requireCurrentSession();
  const overview = await getEverestService(business).getOverview({ userId: user.id, role: user.role }, null, new Date());

  return (
    <div className="mx-auto flex h-[calc(100dvh-8rem)] min-h-96 w-full max-w-3xl flex-col gap-3">
      <div>
        <h1 className="text-xl font-semibold">{EVEREST_NAME}</h1>
        <p className="text-sm text-muted-foreground">
          Ask about your stock, or tell {EVEREST_NAME} what to add, change or remove. Nothing changes until you confirm.
        </p>
      </div>
      <EverestChat everestName={EVEREST_NAME} overview={overview} />
    </div>
  );
}
