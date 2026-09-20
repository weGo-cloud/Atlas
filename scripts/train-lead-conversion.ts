import "dotenv/config";

import path from "node:path";

import { db } from "../src/lib/db/client";
import { businesses } from "../src/lib/db/schema";
import { DatabaseActivityRepository } from "../src/features/activities/repository/database-activity-repository";
import { DatabaseLeadRepository } from "../src/features/leads/repository/database-lead-repository";
import { buildLeadConversionDataset } from "../src/features/intelligence/predictive/lead-conversion/dataset-builder";
import { trainLeadConversionModel } from "../src/features/intelligence/predictive/lead-conversion/trainer";
import { FilesystemModelArtifactStore } from "../src/features/intelligence/predictive/lead-conversion/model-artifact";
import type { LeadConversionExample } from "../src/features/intelligence/predictive/lead-conversion/dataset-builder";

/**
 * Mission 023 — Section 23/30: training is an explicit, human-run
 * process, never triggered by the application. Run with:
 *
 *   npx tsx scripts/train-lead-conversion.ts
 *
 * Pooled across every business rather than trained per-business
 * (Section 22/26): a single dealership's own lead volume is very
 * unlikely to ever clear the quality gates alone, and every feature
 * this model uses is an engagement-pattern count/boolean (see
 * feature-builder.ts) — never a customer name, contact detail, or
 * anything else business-identifying — so pooling is a reasonable,
 * privacy-conscious way to reach a workable sample size. Each
 * business's own leads are still read through that business's own
 * scoped repository; nothing here queries across businesses in a way
 * a live request handler couldn't also do per-business.
 *
 * This script only ever WRITES an artifact when the trained model
 * clears every quality gate (Section 16) — a NOT_READY result is
 * logged clearly and nothing is written, so a stale or fabricated
 * artifact can never silently linger on disk.
 */
async function main() {
  const now = new Date().toISOString();

  const businessRows = await db.select({ id: businesses.id }).from(businesses);
  console.log(`Building lead-conversion dataset across ${businessRows.length} business(es)...`);

  const allExamples: LeadConversionExample[] = [];
  for (const { id: businessId } of businessRows) {
    const leadRepository = new DatabaseLeadRepository(businessId);
    const activityRepository = new DatabaseActivityRepository(businessId);
    const examples = await buildLeadConversionDataset(leadRepository, activityRepository, now);
    allExamples.push(...examples);
  }

  // Merge-sort by observedAt — buildLeadConversionDataset returns each business's
  // own examples already sorted, but the *combined* set across businesses needs
  // re-sorting for splitTemporal's chronological-order requirement.
  allExamples.sort((a, b) => (a.observedAt < b.observedAt ? -1 : a.observedAt > b.observedAt ? 1 : 0));

  const positives = allExamples.filter((ex) => ex.label === 1).length;
  console.log(
    `Dataset: ${allExamples.length} examples (${positives} positive, ${allExamples.length - positives} negative).`
  );

  const result = trainLeadConversionModel(allExamples, now);

  if (result.status === "NOT_READY") {
    console.log(`Training run did NOT clear quality gates — no artifact written.`);
    console.log(`Failed gate: ${result.gate.failedGate}`);
    console.log(`Detail: ${result.gate.detail}`);
    process.exit(0);
  }

  console.log(`Quality gates passed. Model: ${result.artifact.modelVersion} / features: ${result.artifact.featureVersion}`);
  console.log(`Test-set metrics:`, result.artifact.metrics);
  console.log(`Baseline test-set metrics:`, result.artifact.baselineMetrics);
  console.log(`Dataset summary:`, result.artifact.datasetSummary);

  const artifactPath = path.join(process.cwd(), "data", "models", "lead-conversion-v1.json");
  const store = new FilesystemModelArtifactStore(artifactPath);
  await store.save(result.artifact);
  console.log(`Artifact written to ${artifactPath}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Training run failed:", error);
    process.exit(1);
  });
