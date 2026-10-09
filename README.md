# Accepted Work Settlement Agent

A self-contained contest slice for the PayPal AI Hackathon.

## Outcome

Prove one narrow agentic-commerce loop:

```text
natural-language settlement request
  -> local AI selects one server-authorized accepted receipt
  -> deterministic settlement receipt
  -> PayPal sandbox order
  -> buyer approval
  -> capture
  -> settlement result
```

The important product behavior is the **acceptance gate**: payment cannot begin
until a bounded work packet has an independently accepted artifact. A local
OpenAI-compatible model can route a natural-language request to one of the
server-enumerated accepted receipts, but it cannot invent or modify a receipt,
amount, acceptance result, settlement identity, or capture state. Deterministic
code remains the payment authority.

This demo copies only that public semantic contract. It does **not** import
any private orchestration/runtime implementation.

## Why this is isolated

The hackathon requires a functional public open-source repository at submission
time. Any eventual public contest repository should contain only the disposable
demo implementation and its setup instructions, not reusable private
control-plane or orchestration IP.

This directory is not published or submitted by creating it.

## Current slice

`agent.ts` contains:

- a bounded natural-language settlement router over an explicit allowlist of
  already-accepted receipts;
- a dependency-free OpenAI-compatible chat adapter restricted to loopback
  endpoints such as `http://127.0.0.1:11434/v1`;
- network-off-by-default behavior;
- strict JSON action parsing and fail-closed rejection of malformed output,
  unsupported actions, or hallucinated settlement ids.

`awx-receipt.ts` composes the public Agent Work Exchange COMPLETE-envelope semantics into the standalone settlement receipt. It requires one accepted artifact, matching id/digest/version in the result deliverable, cleared unresolved unknowns, PASS/WAIVED acceptance, no blocking input, and exactly one passing independent review bound to that artifact. Settlement amount remains explicit and is never inferred.

`settlement.ts` contains:

- deterministic settlement identity bound to job, work packet, artifact digest,
  reviewer evidence, and exact amount;
- fail-closed acceptance and unresolved-unknown gates;
- idempotent PayPal order creation and capture, with a fresh order attempt after buyer cancellation;
- a deterministic synthetic PayPal transport for zero-effect testing;
- an env-gated **sandbox-only** REST transport;
- PayPal Orders v2 request shaping with `CAPTURE` intent and
  `PayPal-Request-Id` idempotency keys.

The REST transport has no production endpoint. Network calls are disabled unless
the caller explicitly passes `allowNetwork: true`. The CLI demo is synthetic-only and never contacts PayPal. The real sandbox path
is exclusively `server.ts`, which requires `PAYPAL_ALLOW_NETWORK=1` plus
sandbox credentials and sends the buyer through PayPal approval before capture.

## Run without any external effect

Requires Node 22.16+.

```bash
npm test
npm run demo
```

The default demo starts from a synthetic public AWX COMPLETE status envelope, converts it through `awx-receipt.ts`, and then uses only `SyntheticPayPalTransport`.

The test suite also exercises the AI router with a scripted local model, so no
model server or external account is required for deterministic CI/local tests.

## Local AI + PayPal sandbox mode

The AI adapter itself is designed for a local OpenAI-compatible endpoint. To
enable it in the interactive server, set a local model name and explicitly
allow loopback model calls:

```bash
AI_MODEL=your-local-model \
AI_BASE_URL=http://127.0.0.1:11434/v1 \
AI_ALLOW_NETWORK=1 \
PAYPAL_SANDBOX_CLIENT_ID=... \
PAYPAL_SANDBOX_CLIENT_SECRET=... \
PAYPAL_ALLOW_NETWORK=1 \
npm run serve
```

The model sees only the user's request plus server-generated candidate summaries for settlements that are currently `READY_FOR_ORDER`. Its output must select one exact candidate settlement id. The server rechecks `READY_FOR_ORDER` immediately before PayPal order creation; captured or already-open orders are not re-offered. PayPal order creation still comes from the corresponding deterministic accepted receipt, and capture still requires the PayPal buyer-return token.

## PayPal sandbox mode

Use only your own authorized PayPal developer sandbox credentials.

```bash
PAYPAL_SANDBOX_CLIENT_ID=... \
PAYPAL_SANDBOX_CLIENT_SECRET=... \
PAYPAL_ALLOW_NETWORK=1 \
npm run serve
```

The implementation is pinned to:

```text
https://api-m.sandbox.paypal.com
```

There is deliberately no production fallback.

## Test contract

`settlement-test.ts` checks:

1. accepted work can create and capture a synthetic PayPal order;
2. replayed open/create/capture operations remain idempotent;
3. failed acceptance, unresolved unknowns, and bad artifact digests fail closed;
4. the PayPal Orders payload is bound to the accepted job and settlement id;
5. disabled sandbox networking cannot call `fetch`;
6. capture cannot happen before order creation;
7. the sandbox REST adapter requests a full capture representation and extracts
   the actual captured-payment ID from `purchase_units[].payments.captures[]`,
   not the top-level order ID;
8. buyer cancellation resets the settlement to a new PayPal order attempt with
   a new idempotency key rather than trapping retries on the canceled order.

## Verified sandbox demonstration

On October 9, 2026, a local `llama3.2:latest` model selected the authorized
USD 80.00 receipt. PayPal Sandbox buyer approval and capture completed, and an
independent Orders v2 API readback confirmed both the order and capture as
`COMPLETED`. These were fictitious sandbox funds, not revenue.

## License and submission status

This isolated demo is released under the MIT license; see `LICENSE`.
Registration and a live sandbox round-trip are complete. The public video and
final hackathon submission are in preparation. No production payment is part
of this demo.

## Local buyer-approval loop

`server.ts` adds a dependency-free local redirect flow:

```text
POST /start
  -> create sandbox order with return/cancel URLs
  -> 303 to PayPal payer-action URL
  -> buyer approves in PayPal sandbox
  -> GET /paypal/return?token=<order>
  -> verify token matches the bound settlement
  -> capture
```

Run it only after sandbox credential/network use is authorized:

```bash
PAYPAL_SANDBOX_CLIENT_ID=... \
PAYPAL_SANDBOX_CLIENT_SECRET=... \
PAYPAL_ALLOW_NETWORK=1 \
npm run serve
```

Then open `http://127.0.0.1:8787`.

`server-test.ts` uses an in-process fake transport and local HTTP only. It
checks the redirect payload, exact return/cancel URLs, mismatched/old
order-token rejection, cancel-and-retry order rotation, idempotent capture
replay, successful capture rendering, and state-aware cancel behavior after
capture. The current demo is intentionally in-memory; restart persistence is
not claimed by this isolated publicable slice.

## Public-export preflight

Before any future publication, run:

```bash
npm run verify:public
```

The verifier checks that this slice has no parent-directory imports, no absolute
imports, no local/workspace package dependencies, and no confidential internal
system name in export member paths or readable file bytes (including metadata).
The check scans the standalone directory, not compressed archive contents; inspect
any later packaged export separately. A missing `LICENSE` is reported as an explicit
publication gate rather than silently choosing a license.

`SUBMISSION_READINESS.md` records the current Devpost requirements, human
approval gates, and a sub-three-minute demo spine. It is preparation only and
does not publish or submit anything.

The live local-AI -> PayPal sandbox buyer-approval -> capture round-trip has
been verified. The public source is MIT licensed. A short video demonstration is in preparation.
