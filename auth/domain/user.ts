export const USER_ROLES = ["owner", "staff"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_ROLE_LABEL: Record<UserRole, string> = {
  owner: "Owner",
  staff: "Staff",
};

/**
 * Public-facing user shape — deliberately excludes passwordHash. This
 * is what every layer above the repository ever sees; the hash only
 * exists inside DatabaseUserRepository/AuthService, which are the
 * only two places that need it (to create it and to verify against
 * it).
 */
export type User = {
  id: string;
  businessId: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
};
