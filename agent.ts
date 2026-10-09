import {
  settlementId,
  type AcceptedWorkReceipt,
} from "./settlement.ts";

export type SettlementCandidate = {
  settlementId: string;
  jobId: string;
  workPacketId: string;
  currency: string;
  amount: string;
};

export type ModelRequest = {
  system: string;
  user: string;
};

export interface ChatModel {
  complete(request: ModelRequest): Promise<string>;
}

type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}>;

function loopbackBaseUrl(raw: string): URL {
  const url = new URL(raw);
  const host = url.hostname.toLowerCase();
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(host)) {
    throw new Error("AI model endpoint must be loopback-only");
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("AI model endpoint must use http or https");
  }
  url.pathname = url.pathname.replace(/\/$/, "");
  return url;
}

export class OpenAICompatibleChatModel implements ChatModel {
  private readonly baseUrl: URL;
  private readonly model: string;
  private readonly allowNetwork: boolean;
  private readonly fetchImpl: FetchLike;

  constructor(input: {
    baseUrl?: string;
    model: string;
    allowNetwork?: boolean;
    fetchImpl?: FetchLike;
  }) {
    this.baseUrl = loopbackBaseUrl(input.baseUrl ?? "http://127.0.0.1:11434/v1");
    this.model = input.model.trim();
    this.allowNetwork = input.allowNetwork === true;
    this.fetchImpl = input.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
    if (!this.model) throw new Error("AI model name is required");
  }

  async complete(request: ModelRequest): Promise<string> {
    if (!this.allowNetwork) {
      throw new Error("local AI model network calls are disabled");
    }
    const url = new URL(this.baseUrl.toString());
    url.pathname = `${url.pathname.replace(/\/$/, "")}/chat/completions`;
    const response = await this.fetchImpl(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        temperature: 0,
        messages: [
          { role: "system", content: request.system },
          { role: "user", content: request.user },
        ],
      }),
    });
    if (!response.ok) {
      throw new Error(
        `local AI model request failed: ${response.status} ${await response.text()}`,
      );
    }
    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = body.choices?.[0]?.message?.content;
    if (!content?.trim()) {
      throw new Error("local AI model response had no message content");
    }
    return content;
  }
}

export type AgentDecision = {
  action: "start_settlement";
  settlementId: string;
  receipt: AcceptedWorkReceipt;
};

function parseDecision(raw: string): {
  action: string;
  settlement_id: string;
} {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("AI model response must be strict JSON");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("AI model response must be a JSON object");
  }
  const record = value as Record<string, unknown>;
  if (record.action !== "start_settlement") {
    throw new Error("AI model may only request start_settlement");
  }
  if (typeof record.settlement_id !== "string" || !record.settlement_id.trim()) {
    throw new Error("AI model must select a settlement_id");
  }
  return {
    action: record.action,
    settlement_id: record.settlement_id,
  };
}

export class SettlementRequestAgent {
  private readonly model: ChatModel;

  constructor(model: ChatModel) {
    this.model = model;
  }

  async choose(
    userRequest: string,
    receipts: AcceptedWorkReceipt[],
  ): Promise<AgentDecision> {
    if (!userRequest.trim()) throw new Error("settlement request cannot be empty");
    if (receipts.length === 0) throw new Error("no accepted settlements are available");

    const candidates = receipts.map((receipt) => ({
      settlementId: settlementId(receipt),
      jobId: receipt.jobId,
      workPacketId: receipt.workPacketId,
      currency: receipt.amount.currency,
      amount: receipt.amount.value,
    }));

    const byId = new Map(
      candidates.map((candidate, index) => [
        candidate.settlementId,
        receipts[index],
      ]),
    );

    const system = [
      "You route a natural-language settlement request to one authorized settlement.",
      "You do not create, edit, approve, price, or capture payments.",
      "Choose only a settlement_id from the provided candidate list.",
      "Return strict JSON only: {\"action\":\"start_settlement\",\"settlement_id\":\"...\"}.",
      "If the user request is ambiguous, do not invent an id.",
    ].join(" ");

    const raw = await this.model.complete({
      system,
      user: JSON.stringify({
        request: userRequest,
        candidates,
      }),
    });
    const parsed = parseDecision(raw);
    const receipt = byId.get(parsed.settlement_id);
    if (!receipt) {
      throw new Error("AI model selected an unauthorized settlement_id");
    }

    return {
      action: "start_settlement",
      settlementId: parsed.settlement_id,
      receipt: structuredClone(receipt),
    };
  }
}
