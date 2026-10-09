import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import {
  OpenAICompatibleChatModel,
  SettlementRequestAgent,
} from "./agent.ts";
import {
  PayPalSandboxRestTransport,
  SettlementCoordinator,
  type AcceptedWorkReceipt,
  type PayPalTransport,
} from "./settlement.ts";

export function demoReceipt(): AcceptedWorkReceipt {
  return {
    jobId: "job_demo_001",
    workPacketId: "wp_demo_001",
    artifactDigest: "a".repeat(64),
    reviewerEvidenceId: "review_demo_001",
    acceptance: "PASS",
    unresolvedUnknowns: [],
    amount: { currency: "USD", value: "125.00" },
  };
}

export function demoReceipts(): AcceptedWorkReceipt[] {
  return [
    demoReceipt(),
    {
      jobId: "job_demo_002",
      workPacketId: "wp_demo_002",
      artifactDigest: "b".repeat(64),
      reviewerEvidenceId: "review_demo_002",
      acceptance: "PASS",
      unresolvedUnknowns: [],
      amount: { currency: "USD", value: "80.00" },
    },
  ];
}

export function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function sendHtml(response: ServerResponse, status: number, body: string): void {
  response.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(body);
}

function page(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escapeHtml(title)} · Accepted Work</title>
<style>
:root{--ink:#172338;--muted:#64748b;--blue:#2258db;--line:#e3e8f0;--green:#177b53;--surface:#fff}*{box-sizing:border-box}body{margin:0;background:#f5f7fb;color:var(--ink);font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}a{color:var(--blue);text-decoration:none}button,input{font:inherit}button{cursor:pointer;border:0}button:focus-visible,a:focus-visible,input:focus-visible{outline:3px solid #94b7ff;outline-offset:3px}.topbar{height:70px;background:#fff;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;padding:0 max(28px,calc((100vw - 1180px)/2));gap:20px}.brand{display:flex;align-items:center;gap:12px;color:var(--ink);font-size:18px;font-weight:750;letter-spacing:-.4px}.mark{display:grid;place-items:center;width:38px;height:38px;border-radius:12px;background:var(--blue);color:white;font-size:20px}.top-meta{display:flex;align-items:center;gap:18px;font-size:12px;color:var(--muted)}.environment{border:1px solid #d5e4fd;border-radius:100px;padding:5px 11px;background:#eff5ff;color:#2055b6;font-weight:650}.dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:#36926a;margin-right:6px}main{max-width:1180px;padding:28px 28px 38px;margin:auto}.eyebrow{font-size:11px;font-weight:750;color:var(--muted);text-transform:uppercase;letter-spacing:1.6px}h1{font-size:32px;line-height:1.18;letter-spacing:-1.1px;margin:10px 0 8px;font-weight:750}.lead{color:var(--muted);margin:0 0 22px;font-size:15px}.workspace{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(280px,1fr);gap:24px;align-items:start}.panel,.work-card{background:white;border:1px solid var(--line);border-radius:16px;box-shadow:0 4px 14px #192a4204}.panel{padding:22px}.panel-title{margin:0;font-size:17px;letter-spacing:-.3px}.muted{color:var(--muted)}.small{font-size:12px}.section-head{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:17px}.count{color:var(--muted);font-size:12px}.work-list{display:grid;gap:12px}.work-card{padding:14px;display:grid;grid-template-columns:1fr auto;gap:12px}.work-title{font-size:15px;font-weight:680;margin:0 0 4px}.reference{font-size:11px;color:var(--muted);overflow-wrap:anywhere}.amount{font-size:23px;letter-spacing:-.7px;font-weight:720;text-align:right}.currency{font-size:10px;color:var(--muted);text-align:right;letter-spacing:1px}.badge{display:inline-flex;align-items:center;gap:5px;font-size:10px;font-weight:700;border-radius:100px;padding:4px 8px;width:max-content;letter-spacing:.2px}.ready{color:#166a4c;background:#eaf7ef}.inactive{color:#61718c;background:#eef1f6}.card-bottom{grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;gap:12px;border-top:1px solid #edf0f5;padding-top:8px;margin-top:0}.composer{margin-top:18px;border-top:1px solid var(--line);padding-top:18px}.composer label{font-weight:650;font-size:14px;display:block;margin-bottom:10px}.composer input{width:100%;background:#f8faff;border:1px solid #d6dfec;border-radius:10px;padding:13px 14px;font-size:13px;color:var(--ink)}.primary{display:inline-flex;align-items:center;justify-content:center;gap:9px;width:100%;padding:13px 18px;border-radius:10px;background:var(--blue);color:white;font-size:13px;font-weight:650;margin-top:12px;box-shadow:0 3px 6px #2258db18}.primary:hover{background:#184aca}.helper{font-size:11px;color:var(--muted);margin:10px 0 0}.steps{padding:0;margin:20px 0;list-style:none}.steps li{display:grid;grid-template-columns:28px 1fr;gap:12px;margin-bottom:20px}.step-icon{width:25px;height:25px;border-radius:50%;display:grid;place-items:center;background:#eaf7ef;color:var(--green);font-size:12px;font-weight:800}.step-title{font-size:13px;font-weight:650}.step-detail{font-size:11px;color:var(--muted);margin:2px 0 0}.evidence-note{padding:14px;border-radius:10px;background:#f7f9fc;font-size:12px;color:#52637c;line-height:1.6}.secondary{background:white;border:1px solid #d6dfec;border-radius:9px;padding:10px 13px;font-size:12px;color:#33445e;margin-top:9px;width:100%}.manual{margin-top:20px;padding-top:18px;border-top:1px solid var(--line)}.flow{display:flex;gap:6px;align-items:center;margin-top:25px;font-size:11px;color:var(--muted)}.flow span{padding:6px 10px;border-radius:6px;background:#edf1f7}.footer{font-size:11px;color:var(--muted);padding-top:24px;display:flex;justify-content:space-between;gap:20px}.result{max-width:760px;margin:12px auto}.success-icon{width:50px;height:50px;border-radius:50%;background:#e8f7ef;color:#177b53;font-size:24px;display:grid;place-items:center;margin:0 auto 10px}.result-header{text-align:center;padding:8px 0 15px}.result-header h2{font-size:24px;letter-spacing:-.8px;margin:5px}.result-header p{margin:5px;color:var(--muted)}.result-money{font-size:38px;font-weight:750;letter-spacing:-1.5px;margin:12px 0 6px}.receipt-grid{display:grid;grid-template-columns:160px 1fr;gap:10px 20px;padding:16px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line);font-size:12px}.receipt-grid dt{color:var(--muted)}.receipt-grid dd{margin:0;overflow-wrap:anywhere;font-family:ui-monospace,SFMono-Regular,monospace;font-size:11px}.result-links{display:flex;justify-content:center;margin-top:18px}.result-links a{font-size:13px;font-weight:650}code{overflow-wrap:anywhere;font-size:.87em}details{margin-top:12px}summary{cursor:pointer;font-size:12px;font-weight:650}details dl{display:grid;grid-template-columns:90px 1fr;gap:8px;font-size:11px}details dd{margin:0;overflow-wrap:anywhere}details dt{color:var(--muted)}@media(max-width:800px){.workspace{grid-template-columns:1fr}.topbar{padding:0 20px}.top-meta .small{display:none}main{padding:28px 20px}h1{font-size:27px}.receipt-grid{grid-template-columns:1fr;gap:6px}.receipt-grid dd{margin-bottom:10px}.footer{flex-direction:column;gap:6px}}
</style></head><body>
<header class="topbar"><a class="brand" href="/"><span class="mark" aria-hidden="true">✓</span>Accepted Work</a><div class="top-meta"><span class="small">Pay on acceptance</span><span class="environment"><span class="dot"></span>PayPal Sandbox</span></div></header>
<main><div class="eyebrow">Settlement workspace</div><h1>${escapeHtml(title)}</h1>${body}<footer class="footer"><span>Local demo · Fictitious funds only</span><span>Independent evidence → Buyer approval → Payment</span></footer></main></body></html>`;
}

async function readForm(request: IncomingMessage): Promise<URLSearchParams> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += part.length;
    if (size > 8192) throw new Error("request body exceeds 8 KiB");
    chunks.push(part);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
}

export function createApprovalServer(input: {
  transport: PayPalTransport;
  baseUrl: () => string;
  receipt?: () => AcceptedWorkReceipt;
  receipts?: () => AcceptedWorkReceipt[];
  agent?: SettlementRequestAgent;
}): Server {
  const coordinator = new SettlementCoordinator(input.transport);
  const receiptFactory = input.receipt ?? demoReceipt;
  const receiptsFactory = input.receipts ?? (() => [receiptFactory()]);

  async function startSettlement(
    receipt: AcceptedWorkReceipt,
    baseUrl: string,
  ) {
    const settlement = coordinator.open(receipt);
    if (settlement.state !== "READY_FOR_ORDER") {
      throw new Error("settlement must be READY_FOR_ORDER before PayPal order creation");
    }
    const returnUrl = new URL("/paypal/return", baseUrl);
    returnUrl.searchParams.set("settlement_id", settlement.settlementId);
    const cancelUrl = new URL("/paypal/cancel", baseUrl);
    cancelUrl.searchParams.set("settlement_id", settlement.settlementId);

    const ordered = await coordinator.createOrder(settlement.settlementId, {
      returnUrl: returnUrl.toString(),
      cancelUrl: cancelUrl.toString(),
    });
    if (!ordered.order?.approvalUrl) {
      throw new Error("PayPal order did not provide a buyer approval URL");
    }
    return ordered.order.approvalUrl;
  }

  return createServer(async (request, response) => {
    try {
      const baseUrl = input.baseUrl();
      const url = new URL(request.url ?? "/", baseUrl);

      if (request.method === "GET" && url.pathname === "/") {
        const manualReceipt = receiptFactory();
        const items = receiptsFactory().map((receipt, index) => ({
          receipt, index, state: coordinator.open(receipt).state,
        }));
        const workCards = items.map(({ receipt, index, state }) => `<article class="work-card">
  <div><h2 class="work-title">Work package ${index + 1}</h2><div class="reference">${escapeHtml(receipt.jobId)}</div></div>
  <div><div class="amount">${receipt.amount.currency === "USD" ? "$" : escapeHtml(receipt.amount.currency) + " "}${escapeHtml(receipt.amount.value)}</div><div class="currency">${escapeHtml(receipt.amount.currency)}</div></div>
  <div class="card-bottom"><span class="badge ${state === "READY_FOR_ORDER" ? "ready" : "inactive"}">${state === "READY_FOR_ORDER" ? "✓ Accepted · Ready" : escapeHtml(state)}</span><span class="small muted">Independent review passed</span></div>
</article>`).join("");
        const aiForm = input.agent
          ? `<form class="composer" method="post" action="/agent/start">
  <label for="settlement-request">AI routing · Which work should we settle?</label>
  <input id="settlement-request" name="request" required maxlength="500" value="Settle the accepted work for job_demo_002" />
  <button class="primary" type="submit">Ask AI, then open PayPal <span aria-hidden="true">↗</span></button>
  <p class="helper">Choose accepted work in plain English. Review and approve payment in PayPal.</p>
</form>`
          : `<p class="evidence-note">Use the direct payment option below to settle the accepted work.</p>`;
        sendHtml(response, 200, page("Settle accepted work",
          `<p class="lead">Your work is reviewed. Make the next payment with confidence.</p>
<div class="workspace"><section class="panel"><div class="section-head"><h2 class="panel-title">Accepted work</h2><span class="count">${items.length} work package${items.length === 1 ? "" : "s"}</span></div>
  <div class="work-list">${workCards}</div>${aiForm}
  <div class="flow" aria-label="Payment process"><span>Accepted work</span>→<span>AI selection</span>→<span>PayPal approval</span></div>
</section><aside class="panel"><div class="section-head"><h2 class="panel-title">Evidence before payment</h2><span class="badge ready">Verified</span></div>
<ol class="steps"><li><span class="step-icon">✓</span><div><div class="step-title">Artifact accepted</div><p class="step-detail">Identity, digest and version match the deliverable.</p></div></li>
<li><span class="step-icon">✓</span><div><div class="step-title">Independent review passed</div><p class="step-detail">Review is bound to the accepted artifact.</p></div></li>
<li><span class="step-icon">✓</span><div><div class="step-title">Blockers cleared</div><p class="step-detail">No unresolved unknowns or blocking inputs.</p></div></li>
<li><span class="step-icon">✓</span><div><div class="step-title">Amount fixed</div><p class="step-detail">The receipt determines the exact payment.</p></div></li></ol>
<div class="evidence-note">AI selects from accepted receipts. PayPal asks for buyer approval before capture.</div>
<div class="manual"><div class="small muted">Direct payment · ${escapeHtml(manualReceipt.jobId)}</div>
<form method="post" action="/start"><button class="secondary" type="submit">Pay with PayPal Sandbox</button></form></div>
</aside></div>`));
        return;
      }

      if (request.method === "POST" && url.pathname === "/start") {
        const approvalUrl = await startSettlement(receiptFactory(), baseUrl);
        response.writeHead(303, {
          Location: approvalUrl,
          "Cache-Control": "no-store",
        });
        response.end();
        return;
      }

      if (request.method === "POST" && url.pathname === "/agent/start") {
        if (!input.agent) {
          sendHtml(response, 404, page("AI routing disabled", "<p>No local AI model is configured.</p>"));
          return;
        }
        const form = await readForm(request);
        const userRequest = form.get("request") ?? "";
        const readyReceipts = receiptsFactory().filter(
          (receipt) => coordinator.open(receipt).state === "READY_FOR_ORDER",
        );
        const decision = await input.agent.choose(userRequest, readyReceipts);
        const approvalUrl = await startSettlement(decision.receipt, baseUrl);
        response.writeHead(303, {
          Location: approvalUrl,
          "Cache-Control": "no-store",
        });
        response.end();
        return;
      }

      if (request.method === "GET" && url.pathname === "/paypal/return") {
        const settlementId = url.searchParams.get("settlement_id");
        const token = url.searchParams.get("token");
        if (!settlementId || !token) {
          sendHtml(response, 400, page("Invalid return", "<p>Missing settlement or order token.</p>"));
          return;
        }

        const before = coordinator.get(settlementId);
        if (!before.order || before.order.id !== token) {
          sendHtml(response, 400, page("Invalid return", "<p>Returned PayPal order does not match this settlement.</p>"));
          return;
        }

        const captured = await coordinator.capture(settlementId);
        sendHtml(
          response,
          200,
          page(
            "Settlement captured",
            `<div class="result panel"><div class="result-header"><div class="success-icon" aria-hidden="true">✓</div>
<span class="badge ready">${escapeHtml(captured.state)}</span><h2>Payment complete</h2>
<p>The accepted work has been settled.</p><div class="result-money">${captured.receipt.amount.currency === "USD" ? "$" : escapeHtml(captured.receipt.amount.currency) + " "}${escapeHtml(captured.receipt.amount.value)}</div>
<span class="small muted">${escapeHtml(captured.receipt.amount.currency)} · Fictitious sandbox funds</span></div>
<dl class="receipt-grid"><dt>Work package</dt><dd>${escapeHtml(captured.receipt.jobId)}</dd>
<dt>Settlement</dt><dd>${escapeHtml(captured.settlementId)}</dd>
<dt>PayPal order</dt><dd>${escapeHtml(captured.capture?.orderId ?? "")}</dd>
<dt>Payment capture</dt><dd>${escapeHtml(captured.capture?.captureId ?? "")}</dd></dl>
<div class="evidence-note" style="margin-top:20px">✓ Independent acceptance verified · Buyer approved · Capture completed</div>
<div class="result-links"><a href="/">Return to accepted work →</a></div></div>`,
          ),
        );
        return;
      }

      if (request.method === "GET" && url.pathname === "/paypal/cancel") {
        const settlementId = url.searchParams.get("settlement_id");
        if (!settlementId) {
          sendHtml(response, 400, page("Invalid cancel", "<p>Missing settlement id.</p>"));
          return;
        }
        const current = coordinator.get(settlementId);
        if (current.state === "CAPTURED") {
          sendHtml(
            response,
            409,
            page("Already captured", "<p>This settlement was already captured; cancellation cannot undo it.</p>"),
          );
          return;
        }
        coordinator.cancelOrder(settlementId);
        sendHtml(
          response,
          200,
          page("Payment canceled", "<p>No capture was attempted. The accepted work remains unsettled and can start a fresh PayPal order.</p>"),
        );
        return;
      }

      sendHtml(response, 404, page("Not found", "<p>Unknown route.</p>"));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sendHtml(
        response,
        500,
        page("Demo error", `<p><code>${escapeHtml(message)}</code></p>`),
      );
    }
  });
}

if (process.argv.includes("--serve")) {
  const host = "127.0.0.1";
  const port = Number(process.env.PORT ?? "8787");
  const baseUrl = () => `http://${host}:${port}`;
  const transport = new PayPalSandboxRestTransport({
    clientId: process.env.PAYPAL_SANDBOX_CLIENT_ID,
    clientSecret: process.env.PAYPAL_SANDBOX_CLIENT_SECRET,
    allowNetwork: process.env.PAYPAL_ALLOW_NETWORK === "1",
  });
  const aiModel = process.env.AI_MODEL?.trim();
  const agent = aiModel
    ? new SettlementRequestAgent(
        new OpenAICompatibleChatModel({
          baseUrl: process.env.AI_BASE_URL ?? "http://127.0.0.1:11434/v1",
          model: aiModel,
          allowNetwork: process.env.AI_ALLOW_NETWORK === "1",
        }),
      )
    : undefined;
  const server = createApprovalServer({
    transport,
    baseUrl,
    receipts: demoReceipts,
    agent,
  });
  server.listen(port, host, () => {
    console.log(`PayPal agentic-commerce sandbox demo: ${baseUrl()}`);
    console.log(
      agent
        ? "Local AI settlement routing enabled."
        : "Local AI settlement routing disabled; set AI_MODEL to enable it.",
    );
  });
}
