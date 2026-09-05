export const agentTools = [
  {
    name: "melt_inventory",
    description:
      "Read live expiring offers, resale listings, and your prepaid rights.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "melt_transaction",
    description:
      "Buy, list, take, cancel, or withdraw. Returns a confirmed transaction in local mode, otherwise unsigned calldata for your wallet. Prices are ETH per job.",
    inputSchema: {
      type: "object",
      properties: {
        action: { enum: ["buy", "list", "take", "cancel", "withdraw"] },
        id: { type: "integer", minimum: 1 },
        units: { type: "integer", minimum: 1, maximum: 1000 },
        price: { type: "string" },
      },
      required: ["action"],
      additionalProperties: false,
    },
  },
  {
    name: "melt_job_status",
    description: "Read your submitted jobs and protected result URLs.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
];
