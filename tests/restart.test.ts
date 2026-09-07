import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

test(
  "worker restart preserves authorization, confirmed receipts and owner recovery",
  { timeout: 60000 },
  async () => {
    await mkdir(".melt-test-run", { recursive: true });
    const dir = await mkdtemp(resolve(".melt-test-run/restart-"));
    const base = "http://127.0.0.1:8790";
    let child: ChildProcess | undefined,
      logs = "",
      cookie = "";
    const launch = async () => {
      child = spawn(
        process.execPath,
        ["--import", "tsx", "apps/api/src/index.ts"],
        {
          env: {
            ...process.env,
            RPC_URL: "",
            NODE_ENV: "test",
            CHAIN_ID: "31337",
            PORT: "8790",
            FIXTURE_PORT: "8791",
            FIXTURE_ORIGIN: "http://127.0.0.1:8791",
            APP_ORIGIN: base,
            DATA_DIR: dir,
            AI_API_KEY: "",
            AI_MODEL: "",
          },
          stdio: ["ignore", "ignore", "pipe"],
        },
      );
      child.stderr?.on("data", (d) => (logs += d));
      for (let i = 0; i < 100; i++) {
        if (child.exitCode !== null) throw Error(logs);
        try {
          if ((await fetch(base + "/api/health")).ok) return;
        } catch {}
        await new Promise((r) => setTimeout(r, 150));
      }
      throw Error("Worker startup timed out: " + logs);
    };
    const stop = async () => {
      if (child && child.exitCode === null) {
        const exited = new Promise<void>((r) => child!.once("exit", () => r()));
        child.kill("SIGTERM");
        await exited;
      }
    };
    const req = async (path: string, body?: unknown) => {
      const r = await fetch(base + "/api" + path, {
        method: body ? "POST" : "GET",
        headers: {
          Origin: base,
          Cookie: cookie,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (r.headers.get("set-cookie"))
        cookie = r.headers.get("set-cookie")!.split(";")[0];
      const result = (await r.json()) as any;
      assert.ok(r.ok, JSON.stringify(result));
      return result;
    };
    try {
      await launch();
      await req("/auth/local", {});
      const me = await req("/me"),
        cfg = await req("/config");
      const response = await fetch(base + "/api/sessions", {
        method: "POST",
        headers: {
          Origin: base,
          Cookie: cookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "restart-proof",
        },
        body: JSON.stringify({
          title: "Recovery after restart",
          instruction: "Mint one note",
          url: cfg.fixture.url,
          budget: "0.0003",
          target: cfg.fixture.target,
          selector: cfg.fixture.selector,
          recovery: me.owner,
        }),
      });
      const task = (await response.json()) as any;
      assert.equal(response.status, 201);
      await req(`/sessions/${task.id}/start`, { manual: true });
      for (const label of ["Connect wallet", "Mint field note"]) {
        const obs = await req(`/sessions/${task.id}/browser`);
        const control = obs.controls.find((c: any) => c.label === label);
        assert.ok(control);
        await req(`/sessions/${task.id}/action`, {
          type: "click",
          index: control.index,
        });
      }
      let before: any;
      for (let i = 0; i < 40; i++) {
        before = await req(`/sessions/${task.id}`);
        if (before.assets.length) break;
        await new Promise((r) => setTimeout(r, 200));
      }
      assert.equal(before.assets.length, 1);
      assert.equal(before.spent, "0.0001");
      await stop();
      await launch();
      const restored = await req(`/sessions/${task.id}`);
      assert.equal(restored.status, "attention");
      assert.equal(restored.transactions.length, before.transactions.length);
      const closed = await req(`/sessions/${task.id}/close`, {});
      assert.equal(closed.status, "closed");
      assert.equal(closed.returned, "0.0002");
      assert.equal(closed.assets[0].recovered, true);
    } finally {
      await stop();
      await rm(dir, { recursive: true, force: true });
    }
  },
);
