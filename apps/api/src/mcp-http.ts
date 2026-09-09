import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  canAccessEnvelope,
  findEnvelopeOptions,
  getEnvelope,
  listEnvelopes,
  proposePurchase,
  redeemQuote,
  redemptionStatus,
} from "./envelopes.js";
import type { Identity } from "./auth.js";
import { recordUsage } from "./usage.js";

const envelopeId = z.object({ envelope_id: z.string().uuid() });

function asText(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
  };
}

function asError(error: unknown) {
  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: error instanceof Error ? error.message : "Request failed",
      },
    ],
  };
}

function envelopeFor(user: Identity, id: string) {
  const envelope = getEnvelope(id);
  if (!canAccessEnvelope(envelope, user))
    throw Object.assign(Error("Envelope not found"), { statusCode: 404 });
  return envelope;
}

export function createAgentMcp(user: Identity, tokenHash?: string) {
  const server = new McpServer({ name: "melt", version: "0.5.0" });
  const note = (tool: string) => {
    if (tokenHash)
      recordUsage({
        userId: user.id,
        tokenHash,
        method: "TOOL",
        path: `/mcp/${tool}`,
        status: 200,
      });
  };
  const run = async (tool: string, fn: () => Promise<unknown>) => {
    try {
      const data = await fn();
      note(tool);
      return asText(data);
    } catch (error) {
      if (tokenHash)
        recordUsage({
          userId: user.id,
          tokenHash,
          method: "TOOL",
          path: `/mcp/${tool}`,
          status: 400,
        });
      return asError(error);
    }
  };

  server.registerTool(
    "list_envelopes",
    {
      description:
        "List Melt envelopes this account sent or received. An envelope is purpose-bound purchasing power, not cash. This tool cannot create envelopes or send unrestricted transfers.",
      inputSchema: z.object({}),
    },
    () => run("list_envelopes", async () => listEnvelopes(user.id, user.owner)),
  );
  server.registerTool(
    "get_envelope",
    {
      description:
        "Read one envelope: purpose, remaining amount, expiry, and policy hash. Conditions cannot be rewritten after funding.",
      inputSchema: envelopeId,
    },
    ({ envelope_id }) =>
      run("get_envelope", async () => envelopeFor(user, envelope_id)),
  );
  server.registerTool(
    "find_options",
    {
      description:
        "Find purchases that satisfy an existing envelope. Pass what the recipient wants. Unrestricted cash-out requests return no options.",
      inputSchema: envelopeId.extend({
        request: z.string().max(500).optional().default(""),
      }),
    },
    ({ envelope_id, request }) =>
      run("find_options", async () =>
        findEnvelopeOptions(envelopeFor(user, envelope_id), request || ""),
      ),
  );
  server.registerTool(
    "propose_purchase",
    {
      description:
        "Propose a catalog option against an envelope. Use a sku from find_options. This does not move funds until redeem.",
      inputSchema: envelopeId.extend({
        sku: z.string().min(1).max(80),
        request: z.string().max(500).optional().default(""),
      }),
    },
    ({ envelope_id, sku, request }) =>
      run("propose_purchase", async () =>
        proposePurchase(envelopeFor(user, envelope_id), sku, request || ""),
      ),
  );
  server.registerTool(
    "redeem",
    {
      description:
        "Settle a proposed quote. Melt checks the purchase against the envelope and releases only the required amount. There is no generic transfer tool.",
      inputSchema: envelopeId.extend({ quote_id: z.string().uuid() }),
    },
    ({ envelope_id, quote_id }) =>
      run("redeem", async () =>
        redeemQuote(envelopeFor(user, envelope_id), quote_id),
      ),
  );
  server.registerTool(
    "get_redemption_status",
    {
      description:
        "Read settlement and delivery status for an envelope, including remaining funds.",
      inputSchema: envelopeId,
    },
    ({ envelope_id }) =>
      run("get_redemption_status", async () =>
        redemptionStatus(envelopeFor(user, envelope_id)),
      ),
  );
  return server;
}

export async function handleMcpHttp(
  req: FastifyRequest,
  reply: FastifyReply,
  user: Identity,
  tokenHash?: string,
) {
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  const server = createAgentMcp(user, tokenHash);
  await server.connect(transport);
  const protocol = req.headers["x-forwarded-proto"] || req.protocol || "http";
  const host = req.headers.host || "127.0.0.1";
  const url = `${protocol}://${host}${req.url}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === "string") headers.set(key, value);
    else if (Array.isArray(value)) headers.set(key, value.join(","));
  }
  const hasBody = !["GET", "HEAD"].includes(req.method);
  const request = new Request(url, {
    method: req.method,
    headers,
    body: hasBody ? JSON.stringify(req.body ?? {}) : undefined,
  });
  const response = await transport.handleRequest(request, {
    parsedBody: hasBody ? req.body : undefined,
  });
  reply.code(response.status);
  reply.header("Access-Control-Allow-Origin", "*");
  response.headers.forEach((value, key) => {
    reply.header(key, value);
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  await server.close();
  await transport.close();
  return reply.send(buffer);
}
