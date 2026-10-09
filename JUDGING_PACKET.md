# Accepted Work Settlement Agent — judging notes

## Audience and problem

Small agencies and teams commissioning AI-assisted deliverables need a clear boundary between work acceptance and payment. A conversational agent can route a request, but acceptance evidence and exact amounts should remain inspectable.

## Demonstrated solution

A local llama3.2 model selects one server-authorized receipt. Deterministic code rechecks acceptance and readiness, creates the PayPal Sandbox Orders v2 order, validates the buyer's returned order token, and captures after buyer approval.

The sample work evidence is synthetic. A real PayPal Sandbox USD 80.00 approval and capture was verified on October 9, 2026, with independent provider readback. No real funds were used.

## Run and inspect

Follow the README. `npm run preflight:judge` needs only Node.js 22.16+ and npm; no credentials, paid API, or package installation. The interactive UI requires the judge's own free PayPal Sandbox app and buyer account plus a local model.

The AI cannot invent a settlement or change an amount. Tests cover malformed and hallucinated model choices, acceptance failures, unresolved unknowns, incorrect return tokens, cancel/retry, idempotent capture replay, and escaped HTML output.

## Judging fit

- **Technology:** Working local AI routing and PayPal Orders v2 approval/capture, with deterministic payment authority.
- **Design:** A responsive accepted-work workspace, visible evidence checks, and an exact completed-payment receipt.
- **Impact:** A concrete acceptance-before-payment workflow for teams commissioning AI-assisted deliverables. Customer validation and revenue are not claimed.
- **Idea:** An evidence-gated settlement boundary in which conversational selection remains separate from payment authority.
- **Presentation:** Demonstrate the user request, model selection, buyer approval, and completed capture; identify all sandbox and synthetic evidence honestly.

Best thematic fit: **Best Use of Agentic Commerce**. This is a bounded prototype, not a production payment service.
