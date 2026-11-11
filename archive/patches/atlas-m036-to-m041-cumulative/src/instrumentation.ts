/** Mission 037 — runs once when the Node server starts (not during `next build`). */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV !== "production") return;

  const { validateProductionEnv } = await import("@/lib/config/env");
  const issues = validateProductionEnv(process.env);
  if (issues.length === 0) return;

  const lines = issues.map((issue) => `  - ${issue.name}: ${issue.problem}`).join("\n");
  throw new Error(`Atlas cannot start: invalid production configuration.\n${lines}`);
}
