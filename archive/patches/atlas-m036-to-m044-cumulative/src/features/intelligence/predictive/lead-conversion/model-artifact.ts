import type { LogisticRegressionModel } from "../ml/logistic-regression";

/**
 * Mission 023 — Section 7/24. Everything needed to audit "what model
 * produced this prediction, when, trained on what" — Section 21's
 * full auditability list — lives in this one versioned object. An
 * artifact is immutable once trained: promoting a *new* version means
 * writing a new artifact with a new `modelVersion`, never mutating an
 * existing one in place (Section 30: model promotion is explicit,
 * never automatic).
 */
export type LeadConversionModelArtifact = {
  modelVersion: string;
  featureVersion: string;
  algorithm: "logistic-regression";
  trainedAt: string;
  /** The `now` the training run used — nothing in the training data is newer than this. */
  trainingDataCutoff: string;
  model: LogisticRegressionModel;
  metrics: {
    rocAuc: number;
    prAuc: number;
    precision: number;
    recall: number;
    f1: number;
    logLoss: number;
    brierScore: number;
  };
  baselineMetrics: {
    rocAuc: number;
    logLoss: number;
    brierScore: number;
  };
  datasetSummary: {
    totalObservations: number;
    positiveExamples: number;
    negativeExamples: number;
    trainSize: number;
    validationSize: number;
    testSize: number;
  };
};

/**
 * Section 21/24 — where a trained artifact would be read from at
 * inference time. Deliberately an interface, not a hard-coded file
 * path: a filesystem store is one valid implementation, but nothing
 * in the inference layer needs to know that. No implementation ships
 * with an artifact already in it — see trainer.ts's own doc comment
 * for why the current, real Atlas dataset does not yet produce one.
 */
export interface ModelArtifactStore {
  getActive(): Promise<LeadConversionModelArtifact | null>;
  save(artifact: LeadConversionModelArtifact): Promise<void>;
}

/** In-memory only — sufficient for this repo's current deployment shape (Section 22: no premature infrastructure) and for tests. A real multi-instance deployment would swap this for a filesystem or object-storage-backed store without changing anything above this interface. */
export class InMemoryModelArtifactStore implements ModelArtifactStore {
  private active: LeadConversionModelArtifact | null = null;

  async getActive(): Promise<LeadConversionModelArtifact | null> {
    return this.active;
  }

  async save(artifact: LeadConversionModelArtifact): Promise<void> {
    this.active = artifact;
  }
}

/**
 * Section 21/24/33 — a small JSON file is all this needs: the whole
 * artifact (9 logistic-regression coefficients + metrics + metadata)
 * is a few KB, nowhere near "large generated binary" territory, so a
 * plain file is the right-sized answer rather than a database table
 * or object store (Section 33: "do not add tables simply to make the
 * architecture appear more advanced"). The directory is gitignored
 * (see .gitignore) — an artifact is generated output from an explicit
 * training run against real data, not source code, and no artifact
 * is committed to this repository (see this mission's report for
 * why: the current dataset does not clear the quality gates).
 */
export class FilesystemModelArtifactStore implements ModelArtifactStore {
  constructor(private readonly filePath: string) {}

  async getActive(): Promise<LeadConversionModelArtifact | null> {
    const { readFile } = await import("node:fs/promises");
    try {
      const raw = await readFile(this.filePath, "utf-8");
      return JSON.parse(raw) as LeadConversionModelArtifact;
    } catch {
      return null;
    }
  }

  async save(artifact: LeadConversionModelArtifact): Promise<void> {
    const { writeFile, mkdir } = await import("node:fs/promises");
    const { dirname } = await import("node:path");
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(artifact, null, 2), "utf-8");
  }
}
