import type { Session } from "../domain/session";
import type { User } from "../domain/user";

export interface SessionRepository {
  create(input: { userId: string; expiresAt: string }): Promise<Session>;
  /** Resolves a token to its session + the user it belongs to in one lookup — the core "is this cookie valid" check. */
  getWithUser(token: string): Promise<{ session: Session; user: User } | null>;
  delete(token: string): Promise<void>;
}
