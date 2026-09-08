// After downloading: node --env-file=.env session.mjs SESSION_ID
// In this repository: node --env-file=.env examples/session.mjs SESSION_ID
import { Melt, MeltError } from "./melt-client.mjs";

const sessionId = process.argv[2];
if (!sessionId || !process.env.MELT_API_KEY)
  throw new Error(
    "Set MELT_API_KEY and pass a session ID created and funded in Melt",
  );
const melt = new Melt({
  baseUrl: process.env.MELT_API_URL || "https://melt-woad.vercel.app",
  apiKey: process.env.MELT_API_KEY,
});
try {
  // Read-only by default. This example never starts a task or sends a transaction.
  const session = await melt.session(sessionId);
  console.log(
    JSON.stringify(
      {
        id: session.id,
        status: session.status,
        outcome: session.outcome,
        balance: session.balance,
        transactions: session.transactions,
      },
      null,
      2,
    ),
  );
  if (session.status === "closed") {
    const receipt = await melt.receipt(sessionId);
    console.log(JSON.stringify(receipt, null, 2));
  }
} catch (error) {
  if (!(error instanceof MeltError)) throw error;
  console.error(
    `${error.code}${error.status ? ` (${error.status})` : ""}: ${error.message}`,
  );
  process.exitCode = 1;
}
