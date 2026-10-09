# Accepted Work Settlement Agent — submission readiness

## October 9 sandbox checkpoint

Event registration and developer setup are complete. A live local AI selection,
USD 80.00 sandbox buyer approval and capture passed; direct PayPal Orders v2
readback confirmed COMPLETED. Fictitious funds only. MIT license and isolated public source release are approved.
The public video and final submission remain in preparation. Earlier checklists below are
historical preparation and do not negate this verified checkpoint.

This checklist documents the submission requirements and status. Running the
no-network preflight does not create accounts, move money or submit an entry.

## Official submission contract checked 2026-10-06

The PayPal AI Hackathon requires a working project that makes PayPal central to the product and uses an AI tool/model/platform. The submission must include:

- a text description of features and functionality;
- a functional demo that judges can run or interact with;
- a public code repository containing the source, assets, setup/run instructions, and a visible open-source license;
- a public YouTube demonstration video shorter than three minutes;
- enough access/setup information for judges to test the project during judging.

Stage-two judging weights five criteria equally: technological implementation, design, potential impact, innovation/idea, and presentation.

## Implementation status

Implemented and validated:

- public AWX COMPLETE envelope -> fail-closed accepted-work receipt, with exact artifact id/digest/version, matching result deliverable, cleared blockers/unknowns, and one passing independent review;
- natural-language request -> bounded local AI routing -> accepted-work receipt;
- strict allowlist enforcement: the model can select only a server-enumerated
  settlement id that is currently READY_FOR_ORDER and cannot invent amount,
  acceptance, artifact identity, or payment state;
- READY_FOR_ORDER is rechecked immediately before PayPal order creation, so
  captured/already-open settlements are neither re-offered nor reopened;
- accepted-work -> PayPal sandbox order -> buyer approval -> capture flow;
- fail-closed acceptance gate;
- idempotent order/capture behavior and cancel/retry rotation;
- sandbox-only REST transport with networking disabled by default;
- synthetic no-network demo;
- localhost buyer-approval integration test;
- source-isolation verifier for a future public export.

Completed:

1. Event registration and developer sandbox setup.
2. Live USD80 sandbox AI selection, buyer approval and completed capture.
3. MIT license and approval of the isolated public source release.

Remaining:

1. Record and publish a public YouTube video under three minutes.
2. Provide public source/video links and judge setup instructions in Devpost.
3. Final entry review and submission.

## Three-minute demo spine

Target 2:20-2:40 so judges never need the final 20 seconds.

1. 0:00-0:25 — Problem: autonomous work should not trigger payment until independent acceptance exists.
2. 0:25-0:55 — Show the AWX COMPLETE envelope becoming an immutable accepted-work receipt and explain the fail-closed evidence gate.
3. 0:55-1:20 — Ask the local AI to route a natural-language request to one of two accepted work receipts; show the chosen immutable receipt/amount.
4. 1:20-1:55 — Open the PayPal sandbox order, show buyer approval, return, and capture receipt.
5. 1:55-2:15 — Show hallucinated settlement-id rejection plus replay/cancel safety.
6. 2:15-2:35 — Explain the user: AI-native services that need auditable routing plus pay-on-acceptance.
7. 2:35-2:45 — Close: AI chooses from authorized work; deterministic gates authorize; PayPal settles.

Do not record or publish the final video until the real PayPal sandbox round-trip has been verified.
