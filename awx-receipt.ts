import type { AcceptedWorkReceipt, Money } from "./settlement.ts";

type UnknownRecord = Record<string, unknown>;

export type AwxAcceptedStatusEnvelope = {
  job_id: string;
  state: string;
  blocking_input_requests: unknown[];
  acceptance_summary: Record<string, string>;
  artifacts: Array<{
    id: string;
    jobId: string;
    digest: string;
    version: number;
  }>;
  evidence_receipts: Array<{
    id: string;
    jobId: string;
    checkType: string;
    result: string;
    target: string;
    artifactId?: string;
  }>;
  result: {
    work_packet_id: string;
    unresolved_unknowns: string[];
    deliverables: Array<{
      id: string;
      jobId: string;
      digest: string;
      version: number;
    }>;
  } | null;
};

function object(value: unknown, name: string): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
  return value as UnknownRecord;
}

function nonEmptyString(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} must be a non-empty string`);
  }
  return value;
}

function stringArray(value: unknown, name: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${name} must be a string array`);
  }
  return value as string[];
}

export function acceptedWorkReceiptFromAwx(
  value: unknown,
  amount: Money,
): AcceptedWorkReceipt {
  const envelope = object(value, "AWX status envelope");
  const jobId = nonEmptyString(envelope.job_id, "job_id");
  if (envelope.state !== "COMPLETE") {
    throw new Error("AWX job must be COMPLETE before settlement");
  }

  if (
    !Array.isArray(envelope.blocking_input_requests) ||
    envelope.blocking_input_requests.length !== 0
  ) {
    throw new Error("AWX job must have no blocking input requests");
  }

  const acceptance = object(envelope.acceptance_summary, "acceptance_summary");
  const acceptanceStates = Object.values(acceptance);
  if (
    acceptanceStates.length === 0 ||
    acceptanceStates.some(
      (status) => status !== "PASS" && status !== "WAIVED",
    )
  ) {
    throw new Error("AWX required acceptance must be PASS or WAIVED");
  }

  if (!Array.isArray(envelope.artifacts) || envelope.artifacts.length !== 1) {
    throw new Error("AWX settlement slice requires exactly one accepted artifact");
  }
  const artifact = object(envelope.artifacts[0], "artifact");
  const artifactId = nonEmptyString(artifact.id, "artifact.id");
  if (nonEmptyString(artifact.jobId, "artifact.jobId") !== jobId) {
    throw new Error("AWX artifact belongs to a different job");
  }
  const artifactDigest = nonEmptyString(artifact.digest, "artifact.digest");
  if (!/^[a-f0-9]{64}$/.test(artifactDigest)) {
    throw new Error("AWX artifact digest must be sha256 hex");
  }
  if (
    typeof artifact.version !== "number" ||
    !Number.isInteger(artifact.version) ||
    artifact.version <= 0
  ) {
    throw new Error("AWX artifact version must be a positive integer");
  }
  const artifactVersion = artifact.version;

  const result = object(envelope.result, "result");
  const workPacketId = nonEmptyString(result.work_packet_id, "result.work_packet_id");
  const unresolvedUnknowns = stringArray(
    result.unresolved_unknowns,
    "result.unresolved_unknowns",
  );
  if (unresolvedUnknowns.length !== 0) {
    throw new Error("AWX unresolved unknowns must be cleared before settlement");
  }

  if (!Array.isArray(result.deliverables) || result.deliverables.length !== 1) {
    throw new Error("AWX result must bind exactly one deliverable");
  }
  const deliverable = object(result.deliverables[0], "result.deliverable");
  if (
    nonEmptyString(deliverable.id, "result.deliverable.id") !== artifactId ||
    nonEmptyString(deliverable.jobId, "result.deliverable.jobId") !== jobId ||
    nonEmptyString(deliverable.digest, "result.deliverable.digest") !==
      artifactDigest ||
    deliverable.version !== artifactVersion
  ) {
    throw new Error("AWX result deliverable does not match the accepted artifact");
  }

  if (!Array.isArray(envelope.evidence_receipts)) {
    throw new Error("AWX evidence_receipts must be an array");
  }
  const passingReviews = envelope.evidence_receipts
    .map((receipt) => object(receipt, "evidence receipt"))
    .filter(
      (receipt) =>
        receipt.checkType === "INDEPENDENT_REVIEW" &&
        receipt.result === "PASS" &&
        receipt.target === artifactId &&
        (receipt.artifactId === undefined || receipt.artifactId === artifactId) &&
        receipt.jobId === jobId,
    );
  if (passingReviews.length !== 1) {
    throw new Error(
      "AWX settlement slice requires one passing independent review bound to the artifact",
    );
  }
  const reviewerEvidenceId = nonEmptyString(
    passingReviews[0].id,
    "independent review evidence id",
  );

  return {
    jobId,
    workPacketId,
    artifactDigest,
    reviewerEvidenceId,
    acceptance: "PASS",
    unresolvedUnknowns: [],
    amount,
  };
}
