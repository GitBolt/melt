import { Melt } from "../packages/sdk/src/index.js";
if (!process.env.MELT_API_KEY || !process.env.MELT_SESSION_ID)
  throw Error(
    "Create a session and agent key in Melt, then set MELT_API_KEY and MELT_SESSION_ID.",
  );
const melt = new Melt({
  baseUrl: process.env.MELT_API_URL || "http://127.0.0.1:8787",
  apiKey: process.env.MELT_API_KEY,
});
const id = process.env.MELT_SESSION_ID;
console.log(await melt.session(id));
await melt.start(id);
console.log(await melt.wait(id));
