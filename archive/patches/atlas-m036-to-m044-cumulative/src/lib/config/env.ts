/**
 * Mission 037 — production environment validation.
 *
 * `validateProductionEnv()` is pure (takes an env object) so it is unit-testable.
 * `src/instrumentation.ts` calls it once when the server starts: in production a
 * missing/invalid required setting stops the boot with a clear message, instead of
 * surfacing later as confusing failures (every Server Action rejected, tokens
 * unstorable, links pointing nowhere). It never runs during `next build`.
 *
 * Only booleans/names are ever reported, never values.
 */
export type EnvIssue = { name: string; problem: string };

type Env = Record<string, string | undefined>;

export function validateProductionEnv(env: Env): EnvIssue[] {
  const issues: EnvIssue[] = [];
  const need = (name: string, problem: string) => {
    if (!env[name] || env[name]!.trim() === "") issues.push({ name, problem });
  };

  need("DATABASE_URL", "required: where the SQLite database lives (e.g. file:/data/atlas.db)");
  need("ALLOWED_ORIGINS", "required: your domain (no scheme), or every Server Action is rejected behind the proxy");
  need("PUBLIC_BASE_URL", "required: absolute https URL used in links and WhatsApp media");

  const base = env.PUBLIC_BASE_URL;
  if (base && !/^https:\/\/[^/\s]+/.test(base)) {
    issues.push({ name: "PUBLIC_BASE_URL", problem: "must be an absolute https:// URL" });
  }

  const key = env.ATLAS_ENCRYPTION_KEY;
  if (!key) {
    issues.push({ name: "ATLAS_ENCRYPTION_KEY", problem: "required: 32 random bytes, base64 (openssl rand -base64 32)" });
  } else if (Buffer.from(key, "base64").length !== 32) {
    issues.push({ name: "ATLAS_ENCRYPTION_KEY", problem: "must decode to exactly 32 bytes (openssl rand -base64 32)" });
  }

  // Mission 041 — plan billing is all-or-nothing: setting any of these means the operator intends to bill, so a partial
  // configuration must stop the boot instead of silently running with half the protections (e.g. no callback token).
  const billingKeys = ["MPESA_PLATFORM_ENV", "MPESA_PLATFORM_SHORTCODE", "MPESA_PLATFORM_CONSUMER_KEY", "MPESA_PLATFORM_CONSUMER_SECRET", "MPESA_PLATFORM_PASSKEY", "BILLING_CALLBACK_TOKEN", "BILLING_CRON_SECRET"];
  if (billingKeys.some((name) => env[name] && env[name]!.trim() !== "")) {
    for (const name of billingKeys) if (!env[name] || env[name]!.trim() === "") issues.push({ name, problem: "required once any plan-billing setting is present (billing is all-or-nothing)" });
    if (env.MPESA_PLATFORM_ENV && env.MPESA_PLATFORM_ENV !== "sandbox" && env.MPESA_PLATFORM_ENV !== "production") issues.push({ name: "MPESA_PLATFORM_ENV", problem: "must be sandbox or production" });
    if (env.BILLING_CALLBACK_TOKEN && !/^[a-f0-9]{48}$/.test(env.BILLING_CALLBACK_TOKEN)) issues.push({ name: "BILLING_CALLBACK_TOKEN", problem: "must be 48 hex characters (openssl rand -hex 24)" });
    if (env.BILLING_CRON_SECRET && env.BILLING_CRON_SECRET.length < 32) issues.push({ name: "BILLING_CRON_SECRET", problem: "must be at least 32 characters (openssl rand -hex 32)" });
  }

  // Never allow a NEXT_PUBLIC_ variable to carry a secret: Next inlines those into browser JS.
  for (const name of Object.keys(env)) {
    if (name.startsWith("NEXT_PUBLIC_") && /KEY|SECRET|TOKEN|PASSWORD/i.test(name)) {
      issues.push({ name, problem: "NEXT_PUBLIC_ variables are shipped to browsers; never put secrets in them" });
    }
  }
  return issues;
}

/** Booleans only — safe to show to an owner or return from a health endpoint. */
export function configStatus(env: Env): Record<string, boolean> {
  return {
    ai: Boolean(env.ANTHROPIC_API_KEY),
    whatsapp: Boolean(env.WHATSAPP_PHONE_NUMBER_ID && env.META_APP_SECRET && env.WHATSAPP_VERIFY_TOKEN),
    encryption: Boolean(env.ATLAS_ENCRYPTION_KEY),
    billing: Boolean(env.MPESA_PLATFORM_CONSUMER_KEY && env.BILLING_CALLBACK_TOKEN && env.BILLING_CRON_SECRET),
  };
}
