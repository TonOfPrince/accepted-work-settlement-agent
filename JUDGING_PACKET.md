# Accepted Work Settlement Agent — judge packet

Submission description and judge instructions for the MIT-licensed isolated demo.
The public video and final Devpost submission are still in preparation.

## Project name

**Accepted Work Settlement Agent**

## One-line pitch

An AI routes a natural-language payment request to independently accepted work,
deterministic evidence gates authorize the exact settlement, and PayPal handles
buyer approval and capture.

## Submission description

Autonomous services can create useful work, but payment should not begin merely
because an agent says the work is finished. Accepted Work Settlement Agent adds
an auditable boundary between AI routing and money movement.

The demo starts from a public Agent Work Exchange COMPLETE envelope. Deterministic
code verifies that the artifact identity, digest and version match the accepted
deliverable; blockers and unresolved unknowns are cleared; and exactly one
independent review passed. That evidence becomes an immutable settlement receipt
with an explicit amount.

A bounded AI router can then interpret a natural-language request and choose only
from server-enumerated settlements that are currently READY_FOR_ORDER. The model
cannot invent the amount, artifact, acceptance status, settlement identity or
payment state. The server rechecks readiness before creating a PayPal sandbox
order. The buyer completes PayPal approval, the returned order token is verified,
and the order is captured. Replay, cancellation and hallucinated identifiers fail
closed.

The result is a practical pattern for AI-native work platforms: AI can help choose
what should happen next, while deterministic evidence and PayPal remain the
authority for what is allowed to move money.

## What PayPal does

- PayPal Orders v2 creates the sandbox order with `CAPTURE` intent.
- `PayPal-Request-Id` keys make each order/capture attempt idempotent.
- The buyer is redirected through PayPal approval.
- The return token must match the settlement-bound PayPal order.
- Capture extracts the completed payment capture id, rather than treating the
  order id as a payment receipt.
- The transport is sandbox-only; there is no production endpoint fallback.

## What AI does

- Accepts the user's natural-language settlement request.
- Receives only server-generated summaries of already accepted,
  READY_FOR_ORDER receipts.
- Returns one bounded action: `start_settlement` with one exact enumerated id.
- Cannot create or alter acceptance evidence, amount, artifact identity,
  settlement identity, PayPal order state or capture state.
- Malformed output, unsupported actions and hallucinated ids fail closed.

## Why it matters

AI agents increasingly perform economically valuable work, but a model response
is not sufficient authority to release payment. This project demonstrates a
separation-of-authority architecture:

1. independent evidence says the work is accepted;
2. AI routes intent within a server-controlled allowlist;
3. deterministic state gates authorize the exact settlement;
4. PayPal performs buyer approval and capture.

That makes the AI useful without making it the payment authority.

## Judge quickstart — zero external effect

Requires Node.js 22.16 or newer.

```bash
npm run preflight:judge
```

This executes the complete deterministic test suite, the synthetic accepted-work
to capture demo, and the public-export isolation scan. It does not contact PayPal
or a model provider.

The repository includes an MIT `LICENSE`; the public-export verifier checks
source isolation and license presence.

## Interactive local-AI + PayPal sandbox run

With your own PayPal developer sandbox credentials, start an OpenAI-compatible
model on loopback and run:

```bash
AI_MODEL=<local-model> \
AI_BASE_URL=http://127.0.0.1:11434/v1 \
AI_ALLOW_NETWORK=1 \
PAYPAL_SANDBOX_CLIENT_ID=<sandbox-client-id> \
PAYPAL_SANDBOX_CLIENT_SECRET=<sandbox-client-secret> \
PAYPAL_ALLOW_NETWORK=1 \
npm run serve
```

Then open `http://127.0.0.1:8787`.

Do not commit model or PayPal credentials. Use sandbox credentials only.

## Tools used

- **PayPal Developer Platform / Orders v2** — sandbox order creation, buyer
  approval and capture.
- **OpenAI-compatible local model interface** — bounded natural-language routing
  to one server-authorized settlement.
- **Node.js standard library** — HTTP server, deterministic tests, hashing and
  public-export verification.

No sponsor AI tool is required.

## Evidence already available

Internal exact-source/runtime evidence currently covers:

- public AWX COMPLETE envelope -> accepted-work receipt;
- 9 accepted-receipt checks;
- 8 PayPal settlement checks;
- 7 bounded AI-agent checks;
- localhost buyer-approval/capture integration;
- captured-settlement READY-state exclusion;
- hallucinated-id rejection with zero PayPal create/capture calls;
- synthetic end-to-end accepted-work -> order -> capture demo;
- source-isolation/public-export scan.

A live local-AI and PayPal sandbox round-trip passed on October 9, 2026:
`llama3.2:latest` selected the authorized USD 80.00 receipt, the sandbox buyer
approved, and Orders v2 readback confirmed a completed capture. The funds were
fictitious. No production payment is part of the demo.

## Video spine

Keep the final video under three minutes:

1. **0:00–0:25** — the problem: autonomous work should not trigger payment until
   independent acceptance exists.
2. **0:25–0:55** — show the accepted-work evidence becoming an immutable
   settlement receipt.
3. **0:55–1:20** — ask the AI to route a natural-language settlement request and
   show the exact authorized receipt it selects.
4. **1:20–1:55** — create the PayPal sandbox order, approve it as the buyer and
   show the completed capture receipt.
5. **1:55–2:15** — show a hallucinated id or replay being rejected.
6. **2:15–2:40** — explain the architecture: AI chooses; evidence authorizes;
   PayPal settles.

## Final submission gates

Before anything public or submitted:

- join the PayPal AI Hackathon and accept its rules;
- verify one real PayPal sandbox buyer-approval/capture round-trip;
- use the MIT-licensed public source and verify the latest setup instructions;
- record and authorize the public YouTube video;
- provide the final public repository/video/demo links in Devpost.
