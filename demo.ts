import { acceptedWorkReceiptFromAwx } from "./awx-receipt.ts";
import {
  SettlementCoordinator,
  SyntheticPayPalTransport,
} from "./settlement.ts";

const jobId = "job_demo_001";
const artifactId = "artifact_demo_001";
const artifactDigest = "a".repeat(64);

const awxAcceptedStatus = {
  job_id: jobId,
  state: "COMPLETE",
  blocking_input_requests: [],
  acceptance_summary: { demo_acceptance: "PASS" },
  artifacts: [
    {
      id: artifactId,
      jobId,
      digest: artifactDigest,
      version: 1,
    },
  ],
  evidence_receipts: [
    {
      id: "review_demo_001",
      jobId,
      checkType: "INDEPENDENT_REVIEW",
      result: "PASS",
      target: artifactId,
      artifactId,
    },
  ],
  result: {
    work_packet_id: "wp_demo_001",
    unresolved_unknowns: [],
    deliverables: [
      {
        id: artifactId,
        jobId,
        digest: artifactDigest,
        version: 1,
      },
    ],
  },
};

const receipt = acceptedWorkReceiptFromAwx(awxAcceptedStatus, {
  currency: "USD",
  value: "125.00",
});

const coordinator = new SettlementCoordinator(new SyntheticPayPalTransport());
let settlement = coordinator.open(receipt);
console.log(JSON.stringify({ step: "accepted_work", settlement }, null, 2));

settlement = await coordinator.createOrder(settlement.settlementId);
console.log(JSON.stringify({ step: "synthetic_paypal_order_created", settlement }, null, 2));

settlement = await coordinator.capture(settlement.settlementId);
console.log(JSON.stringify({ step: "synthetic_paypal_order_captured", settlement }, null, 2));
