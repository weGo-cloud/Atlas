import { DatabaseBusinessRepository } from "../repository/database-business-repository";
import { DatabaseSessionRepository } from "../repository/database-session-repository";
import { DatabaseUserRepository } from "../repository/database-user-repository";
import { AuthService } from "./auth-service";

export const authService = new AuthService(
  new DatabaseUserRepository(),
  new DatabaseSessionRepository(),
  new DatabaseBusinessRepository()
);

/** Mission 017 — batched actor-name resolution for activity timelines. Business-scoped even though activity.userId is always same-business by construction, as defense in depth. */
export async function getBusinessUsersByIds(businessId: string, ids: string[]) {
  return new DatabaseUserRepository().getByIdsForBusiness(ids, businessId);
}

export { AuthService };
