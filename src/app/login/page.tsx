import { redirect } from "next/navigation";
import { Suspense } from "react";

import { AtlasLogo } from "@/components/shared/logo";
import { LoginForm } from "@/features/auth/components/login-form";
import { getCurrentSession } from "@/features/auth/lib/current-session";

export const metadata = { title: "Sign in · Atlas" };

export default async function LoginPage() {
  // An already-signed-in visitor landing on /login shouldn't see the
  // form again — send them straight into the app.
  const session = await getCurrentSession();
  if (session) redirect("/app/dashboard");

  return (
    <div className="flex min-h-dvh flex-1 items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <AtlasLogo className="scale-110" />
        </div>

        <div className="rounded-lg border border-border bg-surface p-6 shadow-sm sm:p-8">
          <div className="mb-6 text-center">
            <h1 className="text-lg font-semibold text-foreground">
              Sign in to Atlas
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Your business operating system, in one place.
            </p>
          </div>

          {/* useSearchParams (for the post-login redirect target) requires a Suspense boundary. */}
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
