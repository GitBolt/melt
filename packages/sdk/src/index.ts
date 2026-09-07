import type { Task } from "../../shared/src/index.js";
/** Scoped client: this key operates existing owner-authorized sessions only. */
export class Melt {
  constructor(private config: { baseUrl: string; apiKey: string }) {}
  private async request<T>(path: string, body?: unknown): Promise<T> {
    const r = await fetch(
      `${this.config.baseUrl.replace(/\/$/, "")}/api${path}`,
      {
        method: body ? "POST" : "GET",
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(90000),
      },
    );
    const data = (await r.json()) as any;
    if (!r.ok) throw Error(data.error || `Melt returned ${r.status}`);
    return data;
  }
  sessions() {
    return this.request<Task[]>("/sessions");
  }
  session(id: string) {
    return this.request<Task>(`/sessions/${encodeURIComponent(id)}`);
  }
  start(id: string, options: { manual?: boolean } = {}) {
    return this.request<Task>(
      `/sessions/${encodeURIComponent(id)}/start`,
      options,
    );
  }
  pause(id: string) {
    return this.request<Task>(`/sessions/${encodeURIComponent(id)}/pause`, {});
  }
  close(id: string) {
    return this.request<Task>(`/sessions/${encodeURIComponent(id)}/close`, {});
  }
  observe(id: string) {
    return this.request<{
      url: string;
      title: string;
      text: string;
      controls: { index: number; tag: string; label: string }[];
    }>(`/sessions/${encodeURIComponent(id)}/browser`);
  }
  action(
    id: string,
    action:
      | { type: "click"; index: number }
      | { type: "fill"; index: number; value: string }
      | { type: "wait" }
      | { type: "finish" },
  ) {
    return this.request<Task>(
      `/sessions/${encodeURIComponent(id)}/action`,
      action,
    );
  }
  receipt(id: string) {
    return this.request<Task & { chainId: number; schemaVersion: 1 }>(
      `/sessions/${encodeURIComponent(id)}/receipt`,
    );
  }
  async wait(
    id: string,
    {
      timeoutMs = 180000,
      signal,
    }: { timeoutMs?: number; signal?: AbortSignal } = {},
  ) {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
      signal?.throwIfAborted();
      const task = await this.session(id);
      if (["closed", "attention", "paused"].includes(task.status)) return task;
      await new Promise((r) => setTimeout(r, 1500));
    }
    throw Error(
      "Session is still running; query its status before issuing more actions",
    );
  }
}
