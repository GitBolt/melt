import { DatabaseSync } from "node:sqlite";
import { db as defaultDb } from "./store.js";

export function installUsageSchema(database: DatabaseSync) {
  const columns = database.prepare("PRAGMA table_info(tokens)").all() as {
    name: string;
  }[];
  const names = new Set(columns.map((column) => column.name));
  if (!names.has("last_used"))
    database.exec("ALTER TABLE tokens ADD COLUMN last_used TEXT");
  if (!names.has("requests"))
    database.exec(
      "ALTER TABLE tokens ADD COLUMN requests INTEGER NOT NULL DEFAULT 0",
    );
  database.exec(`
CREATE TABLE IF NOT EXISTS api_usage(
  id INTEGER PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  status INTEGER NOT NULL,
  created TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS api_usage_user_created ON api_usage(user_id, created);
CREATE INDEX IF NOT EXISTS api_usage_token_created ON api_usage(token_hash, created);
`);
}

installUsageSchema(defaultDb);

export function normalizeRoute(url: string) {
  const path = (url.split("?")[0] || "/").replace(/\/+$/, "") || "/";
  return path
    .replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      ":id",
    )
    .replace(/0x[0-9a-fA-F]{40}/g, ":address")
    .replace(/\/[0-9a-f]{48}(?=\/|$)/gi, "/:token")
    .replace(/\/\d+(?=\/|$)/g, "/:id");
}

export function recordUsage(
  input: {
    userId?: string;
    tokenHash?: string;
    method: string;
    path: string;
    status: number;
    created?: string;
  },
  database = defaultDb,
) {
  const path = normalizeRoute(input.path).slice(0, 180);
  const method = input.method.toUpperCase().slice(0, 12);
  const created = input.created || new Date().toISOString();
  let userId = input.userId;
  if (!userId && input.tokenHash) {
    const row = database
      .prepare("SELECT user_id FROM tokens WHERE hash=? AND revoked=0")
      .get(input.tokenHash) as { user_id?: string } | undefined;
    userId = row?.user_id;
  }
  if (!userId) return;
  database
    .prepare(
      "INSERT INTO api_usage(user_id,token_hash,method,path,status,created) VALUES(?,?,?,?,?,?)",
    )
    .run(userId, input.tokenHash || null, method, path, input.status, created);
  if (input.tokenHash) {
    database
      .prepare(
        "UPDATE tokens SET last_used=?, requests=COALESCE(requests,0)+1 WHERE hash=?",
      )
      .run(created, input.tokenHash);
  }
  const count = (
    database.prepare("SELECT COUNT(*) AS n FROM api_usage").get() as {
      n: number;
    }
  ).n;
  if (count > 20000) {
    database
      .prepare(
        "DELETE FROM api_usage WHERE created < datetime('now','-90 days')",
      )
      .run();
  }
}

export function listKeys(userId: string, database = defaultDb) {
  return database
    .prepare(
      "SELECT rowid AS id,name,created,revoked,last_used AS lastUsed,COALESCE(requests,0) AS requests FROM tokens WHERE user_id=? ORDER BY rowid DESC",
    )
    .all(userId);
}

export function usageSummary(userId: string, days = 30, database = defaultDb) {
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const total =
    (
      database
        .prepare(
          "SELECT COUNT(*) AS n FROM api_usage WHERE user_id=? AND created>=?",
        )
        .get(userId, since) as { n: number }
    ).n || 0;
  const errors =
    (
      database
        .prepare(
          "SELECT COUNT(*) AS n FROM api_usage WHERE user_id=? AND created>=? AND status>=400",
        )
        .get(userId, since) as { n: number }
    ).n || 0;
  const byPath = database
    .prepare(
      `SELECT path, method, COUNT(*) AS count,
              SUM(CASE WHEN status>=400 THEN 1 ELSE 0 END) AS errors,
              MAX(created) AS lastAt
       FROM api_usage WHERE user_id=? AND created>=?
       GROUP BY path, method
       ORDER BY count DESC
       LIMIT 24`,
    )
    .all(userId, since);
  const byKey = database
    .prepare(
      `SELECT t.rowid AS id, t.name, t.revoked,
              COALESCE(t.requests,0) AS requests,
              t.last_used AS lastUsed,
              COUNT(u.id) AS windowCount
       FROM tokens t
       LEFT JOIN api_usage u
         ON u.token_hash=t.hash AND u.user_id=t.user_id AND u.created>=?
       WHERE t.user_id=?
       GROUP BY t.hash
       ORDER BY windowCount DESC, t.rowid DESC`,
    )
    .all(since, userId);
  const recent = database
    .prepare(
      `SELECT u.method, u.path, u.status, u.created,
              t.name AS keyName
       FROM api_usage u
       LEFT JOIN tokens t ON t.hash=u.token_hash
       WHERE u.user_id=?
       ORDER BY u.rowid DESC
       LIMIT 40`,
    )
    .all(userId);
  return {
    windowDays: days,
    total,
    errors,
    byPath,
    byKey,
    recent,
    keys: listKeys(userId, database),
  };
}
