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
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${title}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 760px; margin: 48px auto; padding: 0 20px; line-height: 1.5; }
    .card { border: 1px solid #d5d5d5; border-radius: 12px; padding: 20px; }
    button, input { font: inherit; padding: 10px 12px; }
    input { width: min(560px, 90%); }
    code { overflow-wrap: anywhere; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <div class="card">${body}</div>
</body>
</html>`;
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
        const aiForm = input.agent
          ? `<hr />
<p><strong>AI routing:</strong> ask the local model which already-accepted settlement matches your request. The model cannot change amount, acceptance, or payment state.</p>
<form method="post" action="/agent/start">
  <input name="request" required maxlength="500" value="Settle the accepted work for job_demo_002" />
  <button type="submit">Ask AI, then open PayPal</button>
</form>`
          : "";
        sendHtml(
          response,
          200,
          page(
            "Accepted agent work",
            `<p>Job <code>${escapeHtml(manualReceipt.jobId)}</code> passed independent review.</p>
<form method="post" action="/start">
  <button type="submit">Pay with PayPal Sandbox</button>
</form>
${aiForm}`,
          ),
        );
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
            `<p>Settlement <code>${escapeHtml(captured.settlementId)}</code> is <strong>${escapeHtml(captured.state)}</strong>.</p>
<p>Order: <code>${escapeHtml(captured.capture?.orderId ?? "")}</code></p>
<p>Capture: <code>${escapeHtml(captured.capture?.captureId ?? "")}</code></p>`,
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
