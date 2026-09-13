// No SDK, dependencies or build step. Node.js 24+.
// node --env-file=.env examples/http-session.mjs SESSION_ID
const sessionId = process.argv[2];
if (
  !sessionId ||
  !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(sessionId)
)
  throw new Error("Pass the session ID shown in Melt");
if (!process.env.MELT_API_KEY) throw new Error("Set MELT_API_KEY");
const origin = new URL(
  process.env.MELT_API_URL || "https://trymeltapp.vercel.app",
);
if (
  !["http:", "https:"].includes(origin.protocol) ||
  origin.username ||
  origin.password ||
  origin.search ||
  origin.hash
)
  throw new Error(
    "MELT_API_URL must be an HTTP(S) base URL without credentials or a query",
  );
const base = origin.href.replace(/\/$/, "").replace(/\/api$/, "");
const response = await fetch(`${base}/api/sessions/${sessionId}`, {
  headers: {
    Authorization: `Bearer ${process.env.MELT_API_KEY}`,
    Accept: "application/json",
  },
  signal: AbortSignal.timeout(30_000),
  redirect: "error",
});
const data = await response.json().catch(() => null);
if (!response.ok)
  throw new Error(
    typeof data?.error === "string"
      ? data.error
      : `Melt returned HTTP ${response.status}`,
  );
if (!data || data.id !== sessionId || typeof data.status !== "string")
  throw new Error("Melt returned an unexpected response");
console.log(JSON.stringify(data, null, 2));
