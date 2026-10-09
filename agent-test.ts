import assert from "node:assert/strict";
import {
  OpenAICompatibleChatModel,
  SettlementRequestAgent,
  type ChatModel,
} from "./agent.ts";
import {
  SettlementCoordinator,
  SyntheticPayPalTransport,
  settlementId,
  type AcceptedWorkReceipt,
} from "./settlement.ts";

function receipt(
  jobId: string,
  amount: string,
): AcceptedWorkReceipt {
  return {
    jobId,
    workPacketId: `wp_${jobId}`,
    artifactDigest: "a".repeat(64),
    reviewerEvidenceId: `review_${jobId}`,
    acceptance: "PASS",
    unresolvedUnknowns: [],
    amount: { currency: "USD", value: amount },
  };
}

class ScriptedModel implements ChatModel {
  private readonly output: string;

  constructor(output: string) {
    this.output = output;
  }

  async complete(): Promise<string> {
    return this.output;
  }
}

async function run(): Promise<void> {
  const first = receipt("job_alpha", "125.00");
  const second = receipt("job_beta", "250.00");
  const secondId = settlementId(second);

  {
    const agent = new SettlementRequestAgent(
      new ScriptedModel(
        JSON.stringify({
          action: "start_settlement",
          settlement_id: secondId,
        }),
      ),
    );
    const decision = await agent.choose("Pay the beta job.", [first, second]);
    assert.equal(decision.settlementId, secondId);
    assert.deepEqual(decision.receipt, second);
  }

  {
    const agent = new SettlementRequestAgent(
      new ScriptedModel(
        JSON.stringify({
          action: "start_settlement",
          settlement_id: "stl_hallucinated",
        }),
      ),
    );
    await assert.rejects(
      agent.choose("Pay something.", [first]),
      /unauthorized settlement_id/,
    );
  }

  {
    const malformed = new SettlementRequestAgent(
      new ScriptedModel("not-json"),
    );
    await assert.rejects(
      malformed.choose("Pay alpha.", [first]),
      /strict JSON/,
    );

    const wrongAction = new SettlementRequestAgent(
      new ScriptedModel(
        JSON.stringify({
          action: "capture_payment",
          settlement_id: settlementId(first),
        }),
      ),
    );
    await assert.rejects(
      wrongAction.choose("Capture alpha.", [first]),
      /may only request start_settlement/,
    );
  }

  {
    const agent = new SettlementRequestAgent(
      new ScriptedModel(
        JSON.stringify({
          action: "start_settlement",
          settlement_id: settlementId(first),
        }),
      ),
    );
    await assert.rejects(agent.choose("", [first]), /cannot be empty/);
    await assert.rejects(agent.choose("Pay alpha.", []), /no accepted settlements/);
  }

  {
    let fetchCalls = 0;
    const model = new OpenAICompatibleChatModel({
      model: "local-test-model",
      allowNetwork: false,
      fetchImpl: async () => {
        fetchCalls += 1;
        throw new Error("fetch should not run");
      },
    });
    await assert.rejects(
      model.complete({ system: "s", user: "u" }),
      /network calls are disabled/,
    );
    assert.equal(fetchCalls, 0);

    assert.throws(
      () =>
        new OpenAICompatibleChatModel({
          baseUrl: "https://api.example.com/v1",
          model: "remote",
        }),
      /loopback-only/,
    );
  }

  {
    let capturedBody = "";
    const model = new OpenAICompatibleChatModel({
      baseUrl: "http://127.0.0.1:11434/v1/",
      model: "local-test-model",
      allowNetwork: true,
      fetchImpl: async (url, init) => {
        assert.equal(url, "http://127.0.0.1:11434/v1/chat/completions");
        assert.equal(init?.method, "POST");
        capturedBody = init?.body ?? "";
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    action: "start_settlement",
                    settlement_id: secondId,
                  }),
                },
              },
            ],
          }),
          text: async () => "",
        };
      },
    });
    const agent = new SettlementRequestAgent(model);
    const decision = await agent.choose("Pay beta.", [first, second]);
    const sent = JSON.parse(capturedBody);
    assert.equal(sent.model, "local-test-model");
    assert.equal(sent.temperature, 0);
    assert.equal(decision.settlementId, secondId);
  }

  {
    const transport = new SyntheticPayPalTransport();
    const coordinator = new SettlementCoordinator(transport);
    const agent = new SettlementRequestAgent(
      new ScriptedModel(
        JSON.stringify({
          action: "start_settlement",
          settlement_id: secondId,
        }),
      ),
    );

    const decision = await agent.choose(
      "Settle the accepted beta work.",
      [first, second],
    );
    let settlement = coordinator.open(decision.receipt);
    assert.equal(settlement.settlementId, decision.settlementId);
    settlement = await coordinator.createOrder(settlement.settlementId);
    assert.equal(settlement.state, "ORDER_CREATED");
    settlement = await coordinator.capture(settlement.settlementId);
    assert.equal(settlement.state, "CAPTURED");
    assert.equal(transport.createCalls, 1);
    assert.equal(transport.captureCalls, 1);
  }

  console.log("PASS: 7 bounded AI settlement-agent checks");
}

await run();
