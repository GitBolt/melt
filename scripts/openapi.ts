import { writeFileSync } from "node:fs";
import { z } from "zod";
import { createTask } from "../packages/shared/src/index.js";
import { actionSchema } from "../apps/api/src/agent.js";
const str = { type: "string" },
  obj = { type: "object", additionalProperties: true },
  hash = { type: "string", pattern: "^0x[0-9a-fA-F]{64}$" },
  address = { type: "string", pattern: "^0x[0-9a-fA-F]{40}$" };
const ref = (name: string) => ({ $ref: "#/components/schemas/" + name });
const schemas: Record<string, any> = {
  CreateSession: z.toJSONSchema(createTask),
  Action: z.toJSONSchema(actionSchema),
  Error: { type: "object", required: ["error"], properties: { error: str } },
  Transaction: {
    type: "object",
    required: ["hash", "kind", "status"],
    properties: {
      hash,
      kind: str,
      status: { enum: ["pending", "success", "reverted"] },
      gasWei: str,
    },
  },
  Asset: {
    type: "object",
    required: ["token", "kind", "recovered"],
    properties: {
      token: address,
      kind: { enum: ["erc20", "erc721"] },
      tokenId: str,
      recovered: { type: "boolean" },
    },
  },
  Event: {
    type: "object",
    required: ["id", "at", "kind", "text"],
    properties: {
      id: str,
      at: { type: "string", format: "date-time" },
      kind: { enum: ["info", "success", "blocked", "error", "transaction"] },
      text: str,
      hash,
    },
  },
  Identity: {
    type: "object",
    properties: {
      id: str,
      owner: {
        type: "string",
        description: "Recovery address, empty for scoped agent API keys",
      },
      apiKey: { type: "boolean" },
    },
  },
  Browser: {
    type: "object",
    properties: {
      url: str,
      title: str,
      text: str,
      scroll: {
        type: "object",
        properties: {
          y: { type: "number" },
          viewportHeight: { type: "number" },
          pageHeight: { type: "number" },
        },
      },
      controls: {
        type: "array",
        items: {
          type: "object",
          properties: {
            index: { type: "integer", minimum: 0, maximum: 199 },
            tag: str,
            label: str,
            type: { type: ["string", "null"] },
            disabled: { type: "boolean" },
            href: str,
            value: str,
            options: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  value: str,
                  label: str,
                  selected: { type: "boolean" },
                  disabled: { type: "boolean" },
                },
              },
            },
          },
        },
      },
    },
  },
  Recover: {
    type: "object",
    required: ["kind", "token"],
    properties: {
      kind: { enum: ["erc20", "erc721"] },
      token: address,
      tokenId: {
        type: "string",
        pattern: "^\\d+$",
        description: "Required for ERC-721",
      },
    },
  },
  Approval: {
    type: "object",
    required: ["token", "amount"],
    properties: {
      token: address,
      amount: { type: "string", pattern: "^[1-9][0-9]*$" },
    },
  },
  Quote: {
    type: "object",
    required: ["tokenIn", "tokenOut", "amount"],
    properties: {
      tokenIn: address,
      tokenOut: address,
      amount: { type: "string", pattern: "^[1-9][0-9]*$" },
      slippageTolerance: {
        type: "number",
        minimum: 0.1,
        maximum: 1,
        default: 0.5,
      },
    },
  },
  Swap: {
    type: "object",
    required: ["id"],
    properties: {
      id: { type: "string", format: "uuid" },
      signature: { type: "string", pattern: "^0x[0-9a-fA-F]+$" },
    },
  },
};
schemas.CreateSession.required = (schemas.CreateSession.required || []).filter(
  (field: string) =>
    !["url", "target", "selector", "durationMinutes"].includes(field),
);
schemas.Session = {
  type: "object",
  required: [
    ...schemas.CreateSession.required,
    "id",
    "userId",
    "vault",
    "status",
    "createdAt",
    "expiresAt",
    "spent",
    "returned",
    "balance",
    "agentMode",
    "events",
    "assets",
    "transactions",
  ],
  properties: {
    ...schemas.CreateSession.properties,
    id: { type: "string", format: "uuid" },
    userId: str,
    vault: {
      type: "string",
      description: "Empty until deployment is confirmed",
    },
    status: {
      enum: [
        "funding",
        "ready",
        "running",
        "paused",
        "closing",
        "closed",
        "attention",
      ],
    },
    createdAt: { type: "string", format: "date-time" },
    expiresAt: { type: "integer", description: "Unix timestamp, seconds" },
    spent: str,
    returned: str,
    balance: str,
    agentMode: { enum: ["manual", "model"] },
    outcome: {
      enum: ["pending", "succeeded", "failed", "cancelled"],
      description:
        "Task result, independent of wallet status. Older sessions may omit this field.",
    },
    outcomeReason: str,
    error: str,
    browserUrl: str,
    browserTitle: str,
    events: { type: "array", items: ref("Event") },
    assets: { type: "array", items: ref("Asset") },
    transactions: { type: "array", items: ref("Transaction") },
  },
};
schemas.Receipt = {
  allOf: [
    ref("Session"),
    {
      type: "object",
      required: ["schemaVersion", "chainId", "network"],
      properties: {
        schemaVersion: { const: 1 },
        chainId: { type: "integer" },
        network: str,
      },
    },
  ],
};
const paths: Record<string, any> = {};
function route(
  method: string,
  path: string,
  summary: string,
  response: any = obj,
  body?: any,
  options: { public?: boolean; owner?: boolean; created?: boolean } = {},
) {
  const operation: any = {
    summary,
    description: options.owner
      ? "Requires signed-in owner authentication. Scoped agent API keys are rejected."
      : undefined,
    operationId: method + "_" + path.replace(/[^a-zA-Z0-9]+/g, "_"),
    responses: {
      [options.created ? "201" : "200"]: {
        description:
          "Successful response. Inspect status, outcome and transaction hashes; closed does not imply task success.",
        content: { "application/json": { schema: response } },
      },
      ...Object.fromEntries(
        [400, 401, 403, 404, 409, 429, 500].map((code) => [
          code,
          {
            description:
              code === 429
                ? "Rate limit exceeded; respect Retry-After."
                : "Error",
            content: { "application/json": { schema: ref("Error") } },
          },
        ]),
      ),
    },
  };
  if (options.public) operation.security = [];
  if (body)
    operation.requestBody = {
      required: true,
      content: { "application/json": { schema: body } },
    };
  if (path.includes("{id}"))
    operation.parameters = [
      { name: "id", in: "path", required: true, schema: { type: "string" } },
    ];
  (paths[path] ||= {})[method] = operation;
  return operation;
}
route("get", "/health", "Read health and chain connectivity", obj, undefined, {
  public: true,
});
route("get", "/config", "Read public configuration", obj, undefined, {
  public: true,
});
route("get", "/me", "Read authenticated identity", ref("Identity"));
route(
  "post",
  "/auth/local",
  "Create local development cookie session",
  ref("Identity"),
  obj,
  { public: true },
);
route("post", "/auth/logout", "Clear local cookie session", obj, obj);
route("get", "/sessions", "List your sessions", {
  type: "array",
  items: ref("Session"),
});
const create = route(
  "post",
  "/sessions",
  "Create an owner-authorized allowance",
  ref("Session"),
  ref("CreateSession"),
  { owner: true, created: true },
);
create.parameters = [
  {
    name: "Idempotency-Key",
    in: "header",
    required: true,
    schema: { type: "string", minLength: 8, maxLength: 128 },
    description: "Reuse for the same body only. A changed body returns 409.",
  },
];
route("get", "/sessions/{id}", "Read session state", ref("Session"));
route(
  "post",
  "/sessions/{id}/start",
  "Start task or open manual browser",
  ref("Session"),
  {
    type: "object",
    properties: { manual: { type: "boolean", default: false } },
  },
);
for (const [name, summary] of [
  ["pause", "Take control from the built-in agent"],
  ["close", "Close spending and return supported assets"],
  ["refresh", "Refresh chain funding and spend state"],
])
  route("post", `/sessions/{id}/${name}`, summary, ref("Session"), obj);
route(
  "post",
  "/sessions/{id}/funding",
  "Register a confirmed owner funding transaction",
  ref("Session"),
  { type: "object", required: ["hash"], properties: { hash } },
  { owner: true },
);
route(
  "post",
  "/sessions/{id}/recover",
  "Register and return a late asset",
  ref("Session"),
  ref("Recover"),
  { owner: true },
);
route(
  "post",
  "/sessions/{id}/action",
  "Act on latest visible controls while paused",
  ref("Session"),
  ref("Action"),
);
route(
  "get",
  "/sessions/{id}/browser",
  "Observe untrusted webpage data",
  ref("Browser"),
);
const screenshot = route(
  "get",
  "/sessions/{id}/screenshot",
  "Read authenticated live browser preview",
);
screenshot.responses["200"] = {
  description: "JPEG screenshot",
  content: { "image/jpeg": { schema: { type: "string", format: "binary" } } },
};
route(
  "get",
  "/sessions/{id}/receipt",
  "Download session receipt",
  ref("Receipt"),
);
route(
  "get",
  "/keys",
  "List account API keys",
  { type: "array", items: obj },
  undefined,
  { owner: true },
);
route(
  "post",
  "/keys",
  "Create a scoped key, shown once",
  obj,
  {
    type: "object",
    required: ["name"],
    properties: { name: { type: "string", minLength: 1, maxLength: 80 } },
  },
  { owner: true },
);
route("delete", "/keys/{id}", "Revoke an account API key", obj, undefined, {
  owner: true,
});
for (const [path, schema] of [
  ["approval", "Approval"],
  ["quote", "Quote"],
  ["swap", "Swap"],
])
  route(
    "post",
    `/uniswap/${path}`,
    `Prepare owner-reviewed Uniswap ${path}`,
    obj,
    ref(schema),
    { owner: true },
  );
route("get", "/openapi.json", "Read this OpenAPI document", obj, undefined, {
  public: true,
});
for (const [path, mediaType, description] of [
  [
    "/client.mjs",
    "text/javascript",
    "Download the dependency-free native-fetch JavaScript client",
  ],
  [
    "/client.d.mts",
    "text/plain",
    "Download optional TypeScript declarations for the JavaScript client",
  ],
]) {
  const download = route("get", path, description, undefined, undefined, {
    public: true,
  });
  download.responses["200"] = {
    description,
    headers: {
      "Content-Disposition": {
        schema: { type: "string" },
        description: "Attachment filename",
      },
    },
    content: { [mediaType]: { schema: { type: "string" } } },
  };
}
writeFileSync(
  "docs/openapi.json",
  JSON.stringify(
    {
      openapi: "3.1.0",
      info: {
        title: "Melt task wallet API",
        version: "0.2.0",
        description:
          "Owner-authorized wallets for browser tasks. Agent keys operate existing sessions in their account and cannot create wallets or increase spending limits. Financial writes require status and outcome inspection; HTTP success alone is not proof of execution. Download the dependency-free client at /api/client.mjs; no npm package is required.",
      },
      servers: [
        { url: "https://melt-woad.vercel.app/api", description: "Hosted app" },
        {
          url: "https://melt-api-production-1b26.up.railway.app/api",
          description: "Direct backend",
        },
        { url: "http://127.0.0.1:8787/api", description: "Local development" },
      ],
      security: [{ bearerAuth: [] }, { localCookie: [] }],
      paths,
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            description: "Privy owner access token or scoped melt_ agent key",
          },
          localCookie: {
            type: "apiKey",
            in: "cookie",
            name: "melt_session",
            description:
              "Local mode only; writes also require the exact APP_ORIGIN header",
          },
        },
        schemas,
      },
    },
    null,
    2,
  ) + "\n",
);
