import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import type { Task } from "../../../packages/shared/src/index.js";
mkdirSync(process.env.DATA_DIR || "data/task-wallet", {
  recursive: true,
  mode: 0o700,
});
export const db = new DatabaseSync(
  `${process.env.DATA_DIR || "data/task-wallet"}/melt.sqlite`,
);
db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,body TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS tokens(hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,name TEXT NOT NULL,created TEXT NOT NULL,revoked INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS auth_sessions(hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,owner TEXT NOT NULL,expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS idempotency(key TEXT PRIMARY KEY,task_id TEXT NOT NULL);
`);
export const digest = (s: string) =>
  createHash("sha256").update(s).digest("hex");
export const setting = (key: string) =>
  (
    db.prepare("SELECT value FROM settings WHERE key=?").get(key) as
      { value: string } | undefined
  )?.value;
export const setSetting = (key: string, value: string) =>
  db.prepare("INSERT OR REPLACE INTO settings VALUES(?,?)").run(key, value);
const cache = new Map<string, Task>();
export function save(task: Task) {
  cache.set(task.id, task);
  db.prepare("INSERT OR REPLACE INTO tasks VALUES(?,?,?)").run(
    task.id,
    task.userId,
    JSON.stringify(task),
  );
  return task;
}
export function get(id: string): Task {
  if (cache.has(id)) return cache.get(id)!;
  const row = db.prepare("SELECT body FROM tasks WHERE id=?").get(id) as
    { body: string } | undefined;
  if (!row)
    throw Object.assign(Error("Session not found"), { statusCode: 404 });
  const task = JSON.parse(row.body);
  cache.set(id, task);
  return task;
}
export function list(userId?: string): Task[] {
  const rows = userId
    ? db
        .prepare("SELECT body FROM tasks WHERE user_id=? ORDER BY rowid DESC")
        .all(userId)
    : db.prepare("SELECT body FROM tasks ORDER BY rowid DESC").all();
  return rows.map((r) => get(JSON.parse(r.body as string).id));
}
export function event(
  task: Task,
  kind: Task["events"][number]["kind"],
  text: string,
  hash?: string,
) {
  task.events.push({
    id: randomUUID(),
    at: new Date().toISOString(),
    kind,
    text,
    hash,
  });
  save(task);
}
const locks = new Map<string, Promise<unknown>>();
export function serial<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const next = (locks.get(id) || Promise.resolve()).then(fn, fn);
  locks.set(id, next);
  void next
    .finally(() => {
      if (locks.get(id) === next) locks.delete(id);
    })
    .catch(() => {});
  return next;
}
