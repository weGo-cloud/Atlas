import { describe, expect, it } from "vitest";

import {
  ForbiddenError,
  PERMISSIONS,
  hasPermission,
  requirePermission,
} from "../permissions";
import type { CurrentSession } from "../../lib/current-session";
import type { User } from "../user";
import type { Business } from "../business";

function makeSession(role: User["role"]): CurrentSession {
  const business: Business = {
    id: "biz_1",
    name: "Test Dealership",
    vertical: "auto",
    websiteMode: "none",
    publicApiKey: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  const user: User = {
    id: "user_1",
    businessId: business.id,
    name: "Test User",
    email: "test@example.com",
    role,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  return { user, business };
}

describe("hasPermission", () => {
  it("grants owner every defined permission", () => {
    for (const permission of PERMISSIONS) {
      expect(hasPermission("owner", permission)).toBe(true);
    }
  });

  it("denies staff every currently-defined (destructive/admin) permission", () => {
    for (const permission of PERMISSIONS) {
      expect(hasPermission("staff", permission)).toBe(false);
    }
  });

  it("denies vehicle.delete to staff specifically", () => {
    expect(hasPermission("staff", "vehicle.delete")).toBe(false);
  });

  it("grants vehicle.delete to owner specifically", () => {
    expect(hasPermission("owner", "vehicle.delete")).toBe(true);
  });

  it("denies business.manage to staff specifically (Mission 027 correction)", () => {
    expect(hasPermission("staff", "business.manage")).toBe(false);
  });

  it("grants business.manage to owner specifically (Mission 027 correction)", () => {
    expect(hasPermission("owner", "business.manage")).toBe(true);
  });
});

describe("requirePermission", () => {
  it("does not throw when the session's role has the permission", () => {
    const session = makeSession("owner");
    expect(() => requirePermission(session, "vehicle.delete")).not.toThrow();
  });

  it("throws ForbiddenError when the session's role lacks the permission", () => {
    const session = makeSession("staff");
    expect(() => requirePermission(session, "vehicle.delete")).toThrow(
      ForbiddenError
    );
  });

  it("throws with a user-facing message that reveals no implementation detail", () => {
    const session = makeSession("staff");
    try {
      requirePermission(session, "vehicle.delete");
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenError);
      expect((error as ForbiddenError).message).toBe(
        "You do not have permission to perform this action."
      );
    }
  });

  it("checks the role on the session object, never a client-suppliable value", () => {
    // Two sessions differing only by role produce different outcomes —
    // proving the decision is driven by session.user.role and nothing
    // else the caller could have passed in instead.
    const ownerSession = makeSession("owner");
    const staffSession = makeSession("staff");
    expect(() => requirePermission(ownerSession, "vehicle.delete")).not.toThrow();
    expect(() => requirePermission(staffSession, "vehicle.delete")).toThrow();
  });
});
