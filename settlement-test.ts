import assert from "node:assert/strict";
import {
  PayPalSandboxRestTransport,
  SettlementCoordinator,
  SyntheticPayPalTransport,
  buildPayPalOrder,
  type AcceptedWorkReceipt,
} from "./settlement.ts";

function receipt(overrides: Partial<AcceptedWorkReceipt> = {}): AcceptedWorkReceipt {
  return {
    jobId: "job_demo_001",
    workPacketId: "wp_demo_001",
    artifactDigest: "a".repeat(64),
    reviewerEvidenceId: "review_demo_001",
    acceptance: "PASS",
    unresolvedUnknowns: [],
    amount: { currency: "USD", value: "125.00" },
    ...overrides,
  };
}

async function run(): Promise<void> {
  {
    const transport = new SyntheticPayPalTransport();
    const coordinator = new SettlementCoordinator(transport);
    const opened = coordinator.open(receipt());
    assert.equal(opened.state, "READY_FOR_ORDER");

    const ordered = await coordinator.createOrder(opened.settlementId);
    assert.equal(ordered.state, "ORDER_CREATED");
    assert.match(ordered.order?.id ?? "", /^SANDBOX-ORDER-/);

    const captured = await coordinator.capture(opened.settlementId);
    assert.equal(captured.state, "CAPTURED");
    assert.equal(captured.capture?.status, "COMPLETED");
    assert.match(captured.capture?.captureId ?? "", /^SANDBOX-CAPTURE-/);
    assert.equal(captured.capture?.orderId, ordered.order?.id);
  }

  {
    const transport = new SyntheticPayPalTransport();
    const coordinator = new SettlementCoordinator(transport);
    const first = coordinator.open(receipt());
    const replay = coordinator.open(receipt());
    assert.equal(first.settlementId, replay.settlementId);

    await coordinator.createOrder(first.settlementId);
    await coordinator.createOrder(first.settlementId);
    await coordinator.capture(first.settlementId);
    await coordinator.capture(first.settlementId);
    assert.equal(transport.createCalls, 1);
    assert.equal(transport.captureCalls, 1);
  }

  {
    const transport = new SyntheticPayPalTransport();
    const coordinator = new SettlementCoordinator(transport);
    let current = coordinator.open(receipt());
    current = await coordinator.createOrder(current.settlementId);
    const firstOrder = current.order?.id;
    current = coordinator.cancelOrder(current.settlementId);
    assert.equal(current.state, "READY_FOR_ORDER");
    assert.equal(current.order, null);
    assert.equal(current.orderAttempt, 2);
    current = await coordinator.createOrder(current.settlementId);
    assert.notEqual(current.order?.id, firstOrder);
    assert.equal(transport.createCalls, 2);
  }

  {
    const coordinator = new SettlementCoordinator(new SyntheticPayPalTransport());
    assert.throws(
      () =>
        coordinator.open({
          ...receipt(),
          acceptance: "FAIL" as AcceptedWorkReceipt["acceptance"],
        }),
      /independently accepted work/,
    );
    assert.throws(
      () =>
        coordinator.open(
          receipt({ unresolvedUnknowns: ["buyer identity unresolved"] }),
        ),
      /unresolved unknowns/,
    );
    assert.throws(
      () => coordinator.open(receipt({ artifactDigest: "bad" })),
      /sha256/,
    );
  }

  {
    const opened = new SettlementCoordinator(new SyntheticPayPalTransport()).open(
      receipt(),
    );
    const payload = buildPayPalOrder(opened.receipt, opened.settlementId);
    assert.deepEqual(payload, {
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: "job_demo_001",
          custom_id: opened.settlementId,
          description: "Accepted agent work wp_demo_001",
          amount: { currency_code: "USD", value: "125.00" },
        },
      ],
    });
  }

  {
    let fetchCalls = 0;
    const transport = new PayPalSandboxRestTransport({
      clientId: "not-used",
      clientSecret: "not-used",
      allowNetwork: false,
      fetchImpl: async () => {
        fetchCalls += 1;
        throw new Error("fetch should never run");
      },
    });
    await assert.rejects(
      transport.createOrder(buildPayPalOrder(receipt(), "stl_test"), "idempotency"),
      /network calls are disabled/,
    );
    assert.equal(fetchCalls, 0);
  }

  {
    const coordinator = new SettlementCoordinator(new SyntheticPayPalTransport());
    const opened = coordinator.open(receipt());
    await assert.rejects(
      coordinator.capture(opened.settlementId),
      /cannot capture before a PayPal order exists/,
    );
  }

  {
    const calls: Array<{ url: string; method?: string }> = [];
    const transport = new PayPalSandboxRestTransport({
      clientId: "client",
      clientSecret: "secret",
      allowNetwork: true,
      fetchImpl: async (url, init) => {
        calls.push({ url, method: init?.method });
        if (url.endsWith("/v1/oauth2/token")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ access_token: "token" }),
            text: async () => "",
          };
        }
        assert.equal(
          url,
          "https://api-m.sandbox.paypal.com/v2/checkout/orders/ORDER-123/capture",
        );
        assert.equal(init?.headers?.Prefer, "return=representation");
        return {
          ok: true,
          status: 201,
          json: async () => ({
            id: "ORDER-123",
            status: "COMPLETED",
            purchase_units: [
              {
                payments: {
                  captures: [{ id: "CAPTURE-456", status: "COMPLETED" }],
                },
              },
            ],
          }),
          text: async () => "",
        };
      },
    });
    const captured = await transport.captureOrder("ORDER-123", "capture-key");
    assert.deepEqual(captured, {
      captureId: "CAPTURE-456",
      status: "COMPLETED",
      orderId: "ORDER-123",
    });
    assert.equal(calls.length, 2);
  }

  console.log("PASS: 8 PayPal agentic-settlement checks");
}

await run();
