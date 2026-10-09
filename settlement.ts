import { createHash } from "node:crypto";

export type Money = {
  currency: string;
  value: string;
};

export type AcceptedWorkReceipt = {
  jobId: string;
  workPacketId: string;
  artifactDigest: string;
  reviewerEvidenceId: string;
  acceptance: "PASS";
  unresolvedUnknowns: string[];
  amount: Money;
};

export type PayPalApprovalContext = {
  returnUrl: string;
  cancelUrl: string;
};

export type PayPalCreateOrderRequest = {
  intent: "CAPTURE";
  purchase_units: Array<{
    reference_id: string;
    custom_id: string;
    description: string;
    amount: {
      currency_code: string;
      value: string;
    };
  }>;
  payment_source?: {
    paypal: {
      experience_context: {
        payment_method_preference: "IMMEDIATE_PAYMENT_REQUIRED";
        shipping_preference: "NO_SHIPPING";
        user_action: "PAY_NOW";
        return_url: string;
        cancel_url: string;
      };
    };
  };
};

export type PayPalOrderResult = {
  id: string;
  status: string;
  approvalUrl?: string;
};

export type PayPalCaptureResult = {
  captureId: string;
  status: string;
  orderId: string;
};

export interface PayPalTransport {
  createOrder(
    request: PayPalCreateOrderRequest,
    idempotencyKey: string,
  ): Promise<PayPalOrderResult>;
  captureOrder(
    orderId: string,
    idempotencyKey: string,
  ): Promise<PayPalCaptureResult>;
}

export type SettlementState =
  | "READY_FOR_ORDER"
  | "ORDER_CREATED"
  | "CAPTURED";

export type SettlementRecord = {
  settlementId: string;
  receipt: AcceptedWorkReceipt;
  state: SettlementState;
  orderAttempt: number;
  order: PayPalOrderResult | null;
  capture: PayPalCaptureResult | null;
};

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, canonical(child)]),
    );
  }
  return value;
}

function stableDigest(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}

function validateMoney(amount: Money): void {
  if (!/^[A-Z]{3}$/.test(amount.currency)) {
    throw new Error("currency must be a three-letter uppercase code");
  }
  if (!/^(0|[1-9]\d*)\.\d{2}$/.test(amount.value)) {
    throw new Error("amount value must use fixed two-decimal notation");
  }
  const [whole, cents] = amount.value.split(".");
  const totalCents = BigInt(whole) * 100n + BigInt(cents);
  if (totalCents <= 0n) {
    throw new Error("settlement amount must be positive");
  }
}

function validateReceipt(receipt: AcceptedWorkReceipt): void {
  if (receipt.acceptance !== "PASS") {
    throw new Error("only independently accepted work can be settled");
  }
  if (receipt.unresolvedUnknowns.length > 0) {
    throw new Error("unresolved unknowns must be cleared before settlement");
  }
  if (!/^[a-f0-9]{64}$/.test(receipt.artifactDigest)) {
    throw new Error("artifactDigest must be a sha256 hex digest");
  }
  if (!receipt.reviewerEvidenceId.trim()) {
    throw new Error("reviewer evidence is required");
  }
  validateMoney(receipt.amount);
}

export function settlementId(receipt: AcceptedWorkReceipt): string {
  validateReceipt(receipt);
  return `stl_${stableDigest({
    jobId: receipt.jobId,
    workPacketId: receipt.workPacketId,
    artifactDigest: receipt.artifactDigest,
    reviewerEvidenceId: receipt.reviewerEvidenceId,
    amount: receipt.amount,
  }).slice(0, 24)}`;
}

function validateApprovalContext(context: PayPalApprovalContext): void {
  for (const [name, raw] of [
    ["returnUrl", context.returnUrl],
    ["cancelUrl", context.cancelUrl],
  ] as const) {
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      throw new Error(`${name} must be an absolute URL`);
    }
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error(`${name} must use http or https`);
    }
    if (parsed.hash) {
      throw new Error(`${name} must not contain a fragment`);
    }
  }
}

export function buildPayPalOrder(
  receipt: AcceptedWorkReceipt,
  id: string,
  approval?: PayPalApprovalContext,
): PayPalCreateOrderRequest {
  validateReceipt(receipt);
  if (approval) validateApprovalContext(approval);
  return {
    intent: "CAPTURE",
    purchase_units: [
      {
        reference_id: receipt.jobId,
        custom_id: id,
        description: `Accepted agent work ${receipt.workPacketId}`,
        amount: {
          currency_code: receipt.amount.currency,
          value: receipt.amount.value,
        },
      },
    ],
    ...(approval
      ? {
          payment_source: {
            paypal: {
              experience_context: {
                payment_method_preference: "IMMEDIATE_PAYMENT_REQUIRED" as const,
                shipping_preference: "NO_SHIPPING" as const,
                user_action: "PAY_NOW" as const,
                return_url: approval.returnUrl,
                cancel_url: approval.cancelUrl,
              },
            },
          },
        }
      : {}),
  };
}

export class SettlementCoordinator {
  private readonly records = new Map<string, SettlementRecord>();
  private readonly transport: PayPalTransport;

  constructor(transport: PayPalTransport) {
    this.transport = transport;
  }

  open(receipt: AcceptedWorkReceipt): SettlementRecord {
    const id = settlementId(receipt);
    const existing = this.records.get(id);
    if (existing) return structuredClone(existing);

    const record: SettlementRecord = {
      settlementId: id,
      receipt: structuredClone(receipt),
      state: "READY_FOR_ORDER",
      orderAttempt: 1,
      order: null,
      capture: null,
    };
    this.records.set(id, record);
    return structuredClone(record);
  }

  get(id: string): SettlementRecord {
    const record = this.records.get(id);
    if (!record) throw new Error(`unknown settlement: ${id}`);
    return structuredClone(record);
  }

  async createOrder(
    id: string,
    approval?: PayPalApprovalContext,
  ): Promise<SettlementRecord> {
    const record = this.records.get(id);
    if (!record) throw new Error(`unknown settlement: ${id}`);
    if (record.order) return structuredClone(record);

    const request = buildPayPalOrder(record.receipt, id, approval);
    record.order = await this.transport.createOrder(
      request,
      `${id}:order:${record.orderAttempt}`,
    );
    record.state = "ORDER_CREATED";
    return structuredClone(record);
  }

  async capture(id: string): Promise<SettlementRecord> {
    const record = this.records.get(id);
    if (!record) throw new Error(`unknown settlement: ${id}`);
    if (!record.order) {
      throw new Error("cannot capture before a PayPal order exists");
    }
    if (record.capture) return structuredClone(record);

    record.capture = await this.transport.captureOrder(
      record.order.id,
      `${id}:capture:${record.orderAttempt}`,
    );
    record.state = "CAPTURED";
    return structuredClone(record);
  }

  cancelOrder(id: string): SettlementRecord {
    const record = this.records.get(id);
    if (!record) throw new Error(`unknown settlement: ${id}`);
    if (record.state === "CAPTURED") {
      throw new Error("cannot cancel a captured settlement");
    }
    if (!record.order) return structuredClone(record);

    record.orderAttempt += 1;
    record.order = null;
    record.capture = null;
    record.state = "READY_FOR_ORDER";
    return structuredClone(record);
  }
}

export class SyntheticPayPalTransport implements PayPalTransport {
  createCalls = 0;
  captureCalls = 0;

  async createOrder(
    request: PayPalCreateOrderRequest,
    idempotencyKey: string,
  ): Promise<PayPalOrderResult> {
    this.createCalls += 1;
    const digest = stableDigest({ request, idempotencyKey }).slice(0, 12);
    return {
      id: `SANDBOX-ORDER-${digest}`,
      status: "CREATED",
      approvalUrl: request.payment_source
        ? `https://www.sandbox.paypal.com/checkoutnow?token=SANDBOX-ORDER-${digest}`
        : undefined,
    };
  }

  async captureOrder(
    orderId: string,
    idempotencyKey: string,
  ): Promise<PayPalCaptureResult> {
    this.captureCalls += 1;
    return {
      captureId: `SANDBOX-CAPTURE-${stableDigest({ orderId, idempotencyKey }).slice(0, 12)}`,
      status: "COMPLETED",
      orderId,
    };
  }
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

export class PayPalSandboxRestTransport implements PayPalTransport {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly allowNetwork: boolean;
  private readonly fetchImpl: FetchLike;
  private accessTokenValue: string | null = null;

  constructor(input: {
    clientId?: string;
    clientSecret?: string;
    allowNetwork?: boolean;
    fetchImpl?: FetchLike;
  } = {}) {
    this.clientId = input.clientId ?? "";
    this.clientSecret = input.clientSecret ?? "";
    this.allowNetwork = input.allowNetwork === true;
    this.fetchImpl = input.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  }

  private assertReady(): void {
    if (!this.allowNetwork) {
      throw new Error("PayPal sandbox network calls are disabled");
    }
    if (!this.clientId || !this.clientSecret) {
      throw new Error("PayPal sandbox credentials are required");
    }
  }

  private async accessToken(): Promise<string> {
    this.assertReady();
    if (this.accessTokenValue) return this.accessTokenValue;

    const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");
    const response = await this.fetchImpl(
      "https://api-m.sandbox.paypal.com/v1/oauth2/token",
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
      },
    );
    if (!response.ok) {
      throw new Error(`PayPal OAuth failed: ${response.status} ${await response.text()}`);
    }
    const body = (await response.json()) as { access_token?: string };
    if (!body.access_token) throw new Error("PayPal OAuth response had no access_token");
    this.accessTokenValue = body.access_token;
    return body.access_token;
  }

  async createOrder(
    request: PayPalCreateOrderRequest,
    idempotencyKey: string,
  ): Promise<PayPalOrderResult> {
    const token = await this.accessToken();
    const response = await this.fetchImpl(
      "https://api-m.sandbox.paypal.com/v2/checkout/orders",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "PayPal-Request-Id": idempotencyKey,
        },
        body: JSON.stringify(request),
      },
    );
    if (!response.ok) {
      throw new Error(`PayPal create order failed: ${response.status} ${await response.text()}`);
    }
    const body = (await response.json()) as {
      id?: string;
      status?: string;
      links?: Array<{ href?: string; rel?: string; method?: string }>;
    };
    if (!body.id || !body.status) throw new Error("PayPal order response incomplete");
    const approvalUrl = body.links?.find(
      (link) => link.rel === "payer-action" || link.rel === "approve",
    )?.href;
    if (request.payment_source && !approvalUrl) {
      throw new Error("PayPal order response has no buyer approval URL");
    }
    return {
      id: body.id,
      status: body.status,
      approvalUrl,
    };
  }

  async captureOrder(
    orderId: string,
    idempotencyKey: string,
  ): Promise<PayPalCaptureResult> {
    const token = await this.accessToken();
    const response = await this.fetchImpl(
      `https://api-m.sandbox.paypal.com/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "PayPal-Request-Id": idempotencyKey,
          Prefer: "return=representation",
        },
      },
    );
    if (!response.ok) {
      throw new Error(`PayPal capture failed: ${response.status} ${await response.text()}`);
    }
    const body = (await response.json()) as {
      id?: string;
      status?: string;
      purchase_units?: Array<{
        payments?: {
          captures?: Array<{ id?: string; status?: string }>;
        };
      }>;
    };
    if (!body.id || body.id !== orderId) {
      throw new Error("PayPal capture response order id mismatch");
    }
    const captures =
      body.purchase_units?.flatMap(
        (unit) => unit.payments?.captures ?? [],
      ) ?? [];
    const completed = captures.find(
      (capture) => capture.id && capture.status === "COMPLETED",
    );
    if (!completed?.id) {
      throw new Error("PayPal capture response has no completed capture");
    }
    return {
      captureId: completed.id,
      status: completed.status ?? "COMPLETED",
      orderId,
    };
  }
}
