import { failAuth, okAuth, type AuthResult } from "../domain/errors";
import { SESSION_DURATION_MS } from "../domain/session";
import type { User } from "../domain/user";
import type { Business } from "../domain/business";
import { verifyPassword } from "../lib/password";
import type { BusinessRepository } from "../repository/business-repository";
import type { SessionRepository } from "../repository/session-repository";
import type { UserRepository } from "../repository/user-repository";

export type SignInResult = { token: string; user: User; business: Business };

export class AuthService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly sessionRepository: SessionRepository,
    private readonly businessRepository: BusinessRepository
  ) {}

  async signIn(email: string, password: string): Promise<AuthResult<SignInResult>> {
    const credentials = await this.userRepository.getCredentialsByEmail(email);

    // Deliberately identical error for "no such email" and "wrong
    // password" — distinguishing them lets an attacker enumerate
    // valid accounts by email address.
    const invalidCredentials = () =>
      failAuth({
        code: "INVALID_CREDENTIALS",
        message: "Invalid email or password.",
      });

    if (!credentials) return invalidCredentials();

    const passwordValid = await verifyPassword(password, credentials.passwordHash);
    if (!passwordValid) return invalidCredentials();

    const business = await this.businessRepository.getById(credentials.user.businessId);
    if (!business) return invalidCredentials();

    try {
      const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();
      const session = await this.sessionRepository.create({
        userId: credentials.user.id,
        expiresAt,
      });
      return okAuth({ token: session.id, user: credentials.user, business });
    } catch {
      return failAuth({
        code: "REPOSITORY_ERROR",
        message: "Could not sign in. Please try again.",
      });
    }
  }

  async signOut(token: string): Promise<void> {
    await this.sessionRepository.delete(token);
  }

  /**
   * Resolves a raw session token to {user, business} — the single
   * source of truth every protected page/action calls through
   * (see features/auth/lib/current-session.ts). Returns null for any
   * invalid, missing, or expired token; an expired session is also
   * deleted here so it doesn't linger in the table.
   */
  async getSessionUser(
    token: string
  ): Promise<{ user: User; business: Business } | null> {
    const result = await this.sessionRepository.getWithUser(token);
    if (!result) return null;

    if (new Date(result.session.expiresAt).getTime() < Date.now()) {
      await this.sessionRepository.delete(token);
      return null;
    }

    const business = await this.businessRepository.getById(result.user.businessId);
    if (!business) return null;

    return { user: result.user, business };
  }
}
