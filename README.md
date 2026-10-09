# Accepted Work Settlement Agent

**Pay independently accepted work through PayPal, with AI routing and an exact payment boundary.**

Built for small agencies and teams commissioning AI-assisted deliverables: a conversational request selects which accepted work to pay, while deterministic evidence fixes whether payment is allowed and how much is owed.

This is a working, sandbox-only prototype for the PayPal AI Hackathon. It uses a local AI model and PayPal Orders v2. No paid model API, cloud deployment, or real payment is required.

## Try the credential-free checks

Requires **Node.js 22.16 or newer** and npm. There are no package dependencies to install.

Download the public source, open a terminal in its directory, and run:

```bash
npm run preflight:judge
```

Expected results: 9 accepted-receipt checks, 8 settlement checks, 7 AI-routing checks, a passing HTTP redirect/capture test, a synthetic CAPTURED result, and a passing public-export check. The preflight uses scripted AI and a synthetic payment transport; it does not call PayPal or a model server.

## Run the interactive AI + PayPal Sandbox flow

1. Have Ollama running locally with `llama3.2` available. The verified run used `llama3.2:latest`. An equivalent local OpenAI-compatible chat endpoint also works.
2. In the [PayPal Developer dashboard](https://developer.paypal.com/dashboard/), use a **Sandbox** app's client ID and secret. Use a separate sandbox personal buyer account for approval.
3. Copy `.env.example` to `.env`, fill in only your own sandbox credentials, and set both network flags to `1` for this test.
4. Start the server:

```bash
node --env-file=.env --experimental-strip-types server.ts --serve
```

5. Open [http://127.0.0.1:8787](http://127.0.0.1:8787). Enter `Settle the accepted work for job_demo_002`, then choose **Ask AI, then open PayPal**.
6. Review and approve the **USD 80.00 fictitious sandbox payment** in PayPal. The app returns a completed receipt with the work, settlement, order, and capture identifiers.

Keep the same process running through approval and capture. The prototype stores state in memory. Restarting starts a fresh demo session.

Never use live PayPal credentials. Keep `.env` private. The transport is pinned to `https://api-m.sandbox.paypal.com` and has no production fallback. To view the interface without external calls, leave both network flags at `0`; attempting checkout then fails closed.

## What the AI does

The local model maps the user's request to one exact settlement identifier from a server-generated allowlist of receipts that are ready for an order. It cannot create acceptance evidence, change an amount, invent a settlement, or authorize capture.

Deterministic code checks readiness again before creating the PayPal order. PayPal handles buyer approval. The app validates the returned order token against the settlement before capture.

## Why acceptance comes first

The receipt adapter requires an accepted artifact with matching identity, digest, and version; cleared blocking inputs and unresolved unknowns; and exactly one passing independent review bound to the artifact. The payment amount is explicit.

The demonstration uses synthetic accepted-work evidence to make the boundary reproducible. It does not claim that an actual customer commissioned these sample packages.

```text
natural-language request
  → AI selects an eligible receipt
  → deterministic acceptance and amount checks
  → PayPal Sandbox order
  → buyer approval
  → bound return-token validation
  → capture and receipt
```

## Verified behavior

On October 9, 2026, local `llama3.2:latest` selected the USD 80.00 receipt, buyer approval completed, and a separate PayPal Orders v2 readback confirmed both the order and capture as `COMPLETED`. These were fictitious funds, not revenue.

Tests reject hallucinated settlement identifiers without creating an order, reject mismatched return tokens, preserve capture idempotency within the process, rotate the order attempt after cancellation, and exclude captured receipts from later AI choices. HTML output escapes dynamic values.

## Implementation

| File | Role |
| --- | --- |
| `agent.ts` | Bounded AI routing and loopback-only model adapter |
| `awx-receipt.ts` | Accepted-work evidence adapter |
| `settlement.ts` | Receipt identity, state machine, PayPal Sandbox REST transport |
| `server.ts` | Responsive UI, approval redirect, return validation, capture |
| `*-test.ts` | Deterministic tests |
| `demo.ts` | No-network synthetic walkthrough |
| `verify-public-export.mjs` | Standalone source and export check |

## Scope and limits

This prototype demonstrates one settlement boundary. It does not provide durable storage, concurrent transaction locking, live payments, production authentication, or autonomous buyer approval. The buyer remains in control of the PayPal approval step. Production use would require durable state, reconciliation, and further validation.

## License

MIT. See [LICENSE](LICENSE).
