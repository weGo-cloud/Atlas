import path from "node:path";

import { DatabaseActivityRepository } from "../../../activities/repository/database-activity-repository";
import { DatabaseLeadRepository } from "../../../leads/repository/database-lead-repository";
import { FilesystemModelArtifactStore } from "../lead-conversion/model-artifact";
import { PredictionService } from "./prediction-service";

/**
 * Mission 023 — the artifact store is intentionally a single
 * process-wide instance, not one per business: a trained model is a
 * cross-business statistical artifact (see prediction-service.ts's
 * own doc comment), so there is exactly one "active lead-conversion
 * model" for the whole deployment, the same way there's exactly one
 * deployed version of any other piece of Atlas code. What's
 * business-scoped is the *data fed into it* at inference time, via
 * the repositories below.
 *
 * Filesystem-backed (see model-artifact.ts) so a real artifact
 * produced by `scripts/train-lead-conversion.ts` is actually picked
 * up by the running app — today that file does not exist (see this
 * mission's report), so getActive() resolves to null and every
 * prediction request correctly returns MODEL_NOT_READY.
 */
const sharedArtifactStore = new FilesystemModelArtifactStore(
  path.join(process.cwd(), "data", "models", "lead-conversion-v1.json")
);

export function getPredictionService(businessId: string): PredictionService {
  return new PredictionService(
    new DatabaseLeadRepository(businessId),
    new DatabaseActivityRepository(businessId),
    sharedArtifactStore
  );
}

export { PredictionService };
