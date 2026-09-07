import { test } from "node:test";
import assert from "node:assert/strict";
import { uniswapQuote, prepareSwap, checkApproval } from "./uniswap.js";
const owner = "0x1111111111111111111111111111111111111111",
  token = "0x2222222222222222222222222222222222222222";
const body = {
  tokenIn: token,
  tokenOut: "0x0000000000000000000000000000000000000000",
  amount: "1000000",
};
const permit = {
  domain: { chainId: 31337 },
  types: { PermitSingle: [] },
  values: { details: { token, amount: "1000000" } },
};
test("conversion uses exact permission, owner binding and a single-use quote", async (t) => {
  process.env.UNISWAP_API_KEY = "test-only";
  const requests: any[] = [];
  t.mock.method(globalThis, "fetch", async (url: any, init: any) => {
    requests.push({ url, headers: init.headers, body: JSON.parse(init.body) });
    return Response.json(
      String(url).endsWith("/quote")
        ? {
            routing: "CLASSIC",
            quote: { output: { amount: "123" } },
            permitData: permit,
          }
        : {
            swap: {
              from: owner,
              to: token,
              data: "0x1234",
              value: "0",
              chainId: 31337,
            },
          },
    );
  });
  const quote = await uniswapQuote(body, owner);
  assert.equal(requests[0].body.permitAmount, "EXACT");
  assert.equal(requests[0].body.recipient, owner);
  await assert.rejects(
    prepareSwap({ id: quote.id, signature: "0x1234" }, token),
    /expired/,
  );
  await assert.rejects(prepareSwap({ id: quote.id }, owner), /permit/);
  await prepareSwap({ id: quote.id, signature: "0x1234" }, owner);
  assert.equal(requests[1].body.simulateTransaction, true);
  assert.equal(requests[1].body.safetyMode, "SAFE");
  assert.deepEqual(requests[1].body.permitData, permit);
  assert.equal(
    requests[1].headers["x-universal-router-version"],
    requests[0].headers["x-universal-router-version"],
  );
  await assert.rejects(
    prepareSwap({ id: quote.id, signature: "0x1234" }, owner),
    /expired/,
  );
});
test("conversion rejects expired quotes and unexpected unlimited permits", async (t) => {
  process.env.UNISWAP_API_KEY = "test-only";
  let bad = false;
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({
      routing: "CLASSIC",
      quote: {},
      permitData: bad
        ? { ...permit, values: { details: { token, amount: "999999999999" } } }
        : permit,
    }),
  );
  const quote = await uniswapQuote(body, owner);
  t.mock.method(Date, "now", () => quote.expiresAt + 1);
  await assert.rejects(
    prepareSwap({ id: quote.id, signature: "0x1234" }, owner),
    /expired/,
  );
  bad = true;
  await assert.rejects(uniswapQuote(body, owner), /Unexpected permit/);
});
test("missing service key fails without a request", async () => {
  delete process.env.UNISWAP_API_KEY;
  await assert.rejects(
    checkApproval({ token, amount: "1000000" }, owner),
    /UNISWAP_API_KEY/,
  );
});
