import type { User, UserRole } from "../domain/user";

export interface UserRepository {
  getById(id: string): Promise<User | null>;
  getByEmail(email: string): Promise<User | null>;
  /**
   * The only method that ever returns a password hash — used
   * exclusively by AuthService.signIn to verify credentials. Every
   * other read in the app goes through getById/getByEmail, which
   * never include it.
   */
  getCredentialsByEmail(
    email: string
  ): Promise<{ user: User; passwordHash: string } | null>;
  create(input: {
    businessId: string;
    name: string;
    email: string;
    passwordHash: string;
    role: UserRole;
  }): Promise<User>;
  /** Mission 017 — batched, business-scoped lookup for resolving activity actors in a timeline without one query per row. */
  getByIdsForBusiness(ids: string[], businessId: string): Promise<User[]>;
}
