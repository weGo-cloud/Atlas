import { vi } from "vitest";

/**
 * Global test setup (Mission 014).
 *
 * Mission 013's report identified a real testability problem: no
 * server action had ever been unit-tested directly, because every
 * action calls `cookies()` from `next/headers`, which throws outside
 * a real Next.js request context. Mission 013 worked around this by
 * reimplementing each action's body inline in the test file — proving
 * the same logic, but not literally the exported function the app
 * calls.
 *
 * `cookies()` in this codebase is used for exactly one thing: reading/
 * writing a single opaque session-token string (see
 * `features/auth/lib/session-cookie.ts`). That's a thin enough surface
 * to fake safely — this in-memory mock reproduces just the
 * get/set/delete behavior real code depends on, nothing about Next's
 * actual request machinery. `next/cache`'s `revalidatePath` is
 * similarly mocked to a no-op, since it has no effect outside a real
 * render/action lifecycle and every action calls it after its
 * mutation, not before.
 *
 * With both mocked, the *actual exported* "use server" action
 * functions (signInAction, deleteVehicleAction, createCustomerAction,
 * etc.) can be imported and called directly against a real SQLite
 * test database — proving the production authorization boundary
 * itself, not a reimplementation of it. See
 * `src/test-support/action-test-harness.ts` for the helpers built on
 * top of this.
 *
 * `next/navigation`'s `redirect()` is intentionally left unmocked: it
 * throws a real `NEXT_REDIRECT` digest error when called outside a
 * Next.js context, and that throw is itself useful — it's exactly the
 * signal `requireCurrentSession()` produces for "no session", so
 * unauthenticated-access tests assert on that throw rather than
 * needing a fake redirect implementation.
 */

const cookieStore = new Map<string, string>();

export function __setTestCookie(name: string, value: string): void {
  cookieStore.set(name, value);
}

export function __clearTestCookies(): void {
  cookieStore.clear();
}

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieStore.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set: (name: string, value: string) => {
      cookieStore.set(name, value);
    },
    delete: (name: string) => {
      cookieStore.delete(name);
    },
  }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
}));
