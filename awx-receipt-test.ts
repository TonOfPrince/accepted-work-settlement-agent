import assert from "node:assert/strict";
import { acceptedWorkReceiptFromAwx } from "./awx-receipt.ts";

const jobId = "job_awx_fixture_001";
const artifactId = "artifact_awx_fixture_001";
const digest = "b".repeat(64);

function fixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    job_id: jobId,
    state: "COMPLETE",
    blocking_input_requests: [],
    acceptance_summary: { criterion_1: "PASS" },
    artifacts: [
      {
        id: artifactId,
        jobId,
        digest,
        version: 1,
      },
    ],
    evidence_receipts: [
      {
        id: "evidence_awx_fixture_review",
        jobId,
        checkType: "INDEPENDENT_REVIEW",
        result: "PASS",
        target: artifactId,
        artifactId,
      },
    ],
    result: {
      work_packet_id: "wp_awx_fixture_001",
      unresolved_unknowns: [],
      deliverables: [
        {
          id: artifactId,
          jobId,
          digest,
          version: 1,
        },
      ],
    },
    ...overrides,
  };
}

const amount = { currency: "USD", value: "125.00" };

{
  const receipt = acceptedWorkReceiptFromAwx(fixture(), amount);
  assert.deepEqual(receipt, {
    jobId,
    workPacketId: "wp_awx_fixture_001",
    artifactDigest: digest,
    reviewerEvidenceId: "evidence_awx_fixture_review",
    acceptance: "PASS",
    unresolvedUnknowns: [],
    amount,
  });
}


{
  const withoutOptionalArtifactId = fixture({
    evidence_receipts: [
      {
        id: "evidence-target-only",
        jobId,
        checkType: "INDEPENDENT_REVIEW",
        result: "PASS",
        target: artifactId,
      },
    ],
  });
  const receipt = acceptedWorkReceiptFromAwx(withoutOptionalArtifactId, amount);
  assert.equal(receipt.reviewerEvidenceId, "evidence-target-only");
}

assert.throws(
  () =>
    acceptedWorkReceiptFromAwx(
      fixture({
        evidence_receipts: [
          {
            id: "review-target-mismatch",
            jobId,
            checkType: "INDEPENDENT_REVIEW",
            result: "PASS",
            target: "different-artifact",
            artifactId,
          },
        ],
      }),
      amount,
    ),
  /independent review/,
);

assert.throws(
  () => acceptedWorkReceiptFromAwx(fixture({ state: "REVIEWING" }), amount),
  /must be COMPLETE/,
);

assert.throws(
  () =>
    acceptedWorkReceiptFromAwx(
      fixture({ acceptance_summary: { criterion_1: "FAIL" } }),
      amount,
    ),
  /acceptance/,
);

assert.throws(
  () =>
    acceptedWorkReceiptFromAwx(
      fixture({
        result: {
          work_packet_id: "wp_awx_fixture_001",
          unresolved_unknowns: ["buyer scope unresolved"],
          deliverables: [{ id: artifactId, jobId, digest, version: 1 }],
        },
      }),
      amount,
    ),
  /unresolved unknowns/,
);

assert.throws(
  () =>
    acceptedWorkReceiptFromAwx(
      fixture({
        evidence_receipts: [
          {
            id: "review-wrong-artifact",
            jobId,
            checkType: "INDEPENDENT_REVIEW",
            result: "PASS",
            target: "different-artifact",
            artifactId: "different-artifact",
          },
        ],
      }),
      amount,
    ),
  /independent review/,
);

assert.throws(
  () =>
    acceptedWorkReceiptFromAwx(
      fixture({
        result: {
          work_packet_id: "wp_awx_fixture_001",
          unresolved_unknowns: [],
          deliverables: [
            {
              id: artifactId,
              jobId,
              digest: "c".repeat(64),
              version: 1,
            },
          ],
        },
      }),
      amount,
    ),
  /does not match/,
);

assert.throws(
  () =>
    acceptedWorkReceiptFromAwx(
      fixture({
        result: {
          work_packet_id: "wp_awx_fixture_001",
          unresolved_unknowns: [],
          deliverables: [
            {
              id: artifactId,
              jobId,
              digest,
              version: 2,
            },
          ],
        },
      }),
      amount,
    ),
  /does not match/,
);

console.log("PASS: 9 AWX accepted-receipt adapter checks");
