import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  installUsageSchema,
  normalizeRoute,
  recordUsage,
  usageSummary,
} from "./usage.js";

test("normalizes envelope ids and numeric ids in API paths", () => {
  assert.equal(
    normalizeRoute(
      "/api/envelopes/11111111-1111-4111-8111-111111111111/options?q=1",
    ),
    "/api/envelopes/:id/options",
  );
  assert.equal(normalizeRoute("/api/keys/12"), "/api/keys/:id");
  assert.equal(normalizeRoute("/mcp/find_options"), "/mcp/find_options");
});

test("records API usage against a key and returns a summary", () => {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE tokens(
      hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      created TEXT NOT NULL,
      revoked INTEGER DEFAULT 0
    );
  `);
  installUsageSchema(database);
  database
    .prepare("INSERT INTO tokens(hash,user_id,name,created) VALUES(?,?,?,?)")
    .run("abc", "user-1", "Agent 1", "2026-01-01T00:00:00.000Z");
  recordUsage(
    {
      tokenHash: "abc",
      method: "GET",
      path: "/api/envelopes/11111111-1111-4111-8111-111111111111/options",
      status: 200,
    },
    database,
  );
  recordUsage(
    {
      tokenHash: "abc",
      method: "POST",
      path: "/api/envelopes/11111111-1111-4111-8111-111111111111/redeem",
      status: 409,
    },
    database,
  );
  const summary = usageSummary("user-1", 30, database);
  assert.equal(summary.total, 2);
  assert.equal(summary.errors, 1);
  assert.equal(summary.byPath[0].path, "/api/envelopes/:id/options");
  assert.equal(summary.keys[0].requests, 2);
  assert.ok(summary.keys[0].lastUsed);
  assert.equal(summary.byKey[0].name, "Agent 1");
});
