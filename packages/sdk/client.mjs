/** Melt's dependency-free client. Download this file and import it locally. */
const states = new Set([
  "funding",
  "ready",
  "running",
  "paused",
  "closing",
  "closed",
  "attention",
]);

function apiRoot(baseUrl) {
  const url = new URL(baseUrl);
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new TypeError(
      "baseUrl must be an HTTP(S) origin or API base URL without credentials, query or fragment",
    );
  const path = url.pathname.replace(/\/+$/, "");
  url.pathname = path.endsWith("/api") ? path : `${path}/api`;
  return url.href.replace(/\/$/, "");
}

function timingSafeEqualHex(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length)
    return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export async function constructEvent(
  payload,
  header,
  secret,
  { toleranceSec = 300 } = {},
) {
  if (
    typeof payload !== "string" ||
    typeof header !== "string" ||
    typeof secret !== "string"
  )
    throw new TypeError(
      "constructEvent needs the raw body, Melt-Signature header, and signing secret",
    );
  const parts = Object.fromEntries(
    header.split(",").map((piece) => {
      const i = piece.indexOf("=");
      return [piece.slice(0, i), piece.slice(i + 1)];
    }),
  );
  const timestamp = Number(parts.t);
  if (!Number.isFinite(timestamp) || !parts.v1)
    throw new MeltError("Invalid Melt-Signature header", {
      code: "INVALID_SIGNATURE",
    });
  if (Math.abs(Date.now() / 1000 - timestamp) > toleranceSec)
    throw new MeltError(
      "Melt-Signature timestamp is outside the allowed tolerance",
      { code: "INVALID_SIGNATURE" },
    );
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${timestamp}.${payload}`),
  );
  const expected = [...new Uint8Array(mac)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  if (!timingSafeEqualHex(expected, parts.v1))
    throw new MeltError("Melt-Signature does not match the payload", {
      code: "INVALID_SIGNATURE",
    });
  try {
    return JSON.parse(payload);
  } catch {
    throw new MeltError("Webhook payload is not valid JSON", {
      code: "INVALID_RESPONSE",
    });
  }
}

export async function publicReceipt(
  token,
  {
    baseUrl = "https://melt-woad.vercel.app",
    fetch: transport = globalThis.fetch,
  } = {},
) {
  if (typeof token !== "string" || !/^[0-9a-f]{48}$/i.test(token))
    throw new TypeError("Use the 48-character public receipt token");
  const response = await transport(
    `${apiRoot(baseUrl)}/public/receipts/${token}`,
    { headers: { Accept: "application/json" }, redirect: "error" },
  );
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    /* Report a protocol error below. */
  }
  if (!response.ok) {
    const message =
      data && typeof data.error === "string" && data.error.trim()
        ? data.error.slice(0, 2000)
        : `Melt returned HTTP ${response.status}`;
    throw new MeltError(message, {
      status: response.status,
      code: "API_ERROR",
    });
  }
  if (!record(data) || data.object !== "receipt")
    throw new MeltError("Melt returned an unexpected receipt", {
      code: "INVALID_RESPONSE",
      status: response.status,
    });
  return data;
}

export class MeltError extends Error {
  constructor(
    message,
    { code = "API_ERROR", status, retryAfterMs, uncertain = false, cause } = {},
  ) {
    super(message, { cause });
    this.name = "MeltError";
    this.code = code;
    this.status = status;
    this.retryAfterMs = retryAfterMs;
    // A failed response does not establish whether a submitted action executed.
    this.uncertain = uncertain;
  }
}

function positive(value, name) {
  if (!Number.isSafeInteger(value) || value <= 0 || value > 2_147_483_647)
    throw new TypeError(`${name} must be a positive integer below 2147483648`);
  return value;
}
function sessionPath(id) {
  if (
    typeof id !== "string" ||
    !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)
  )
    throw new TypeError("Use the session ID returned by Melt");
  return `/sessions/${id}`;
}
const record = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
function isSession(value) {
  return (
    record(value) &&
    typeof value.id === "string" &&
    states.has(value.status) &&
    [
      "title",
      "instruction",
      "url",
      "budget",
      "target",
      "selector",
      "recovery",
      "vault",
      "createdAt",
      "spent",
      "returned",
      "balance",
    ].every((key) => typeof value[key] === "string") &&
    Number.isSafeInteger(value.expiresAt) &&
    Number.isInteger(value.durationMinutes) &&
    ["events", "transactions", "assets"].every((key) =>
      Array.isArray(value[key]),
    )
  );
}
function isObservation(value) {
  return (
    record(value) &&
    ["url", "title", "text"].every((key) => typeof value[key] === "string") &&
    Array.isArray(value.controls) &&
    value.controls.every(
      (control) =>
        record(control) &&
        Number.isInteger(control.index) &&
        control.index >= 0 &&
        typeof control.tag === "string" &&
        typeof control.label === "string",
    )
  );
}
function retryDelay(header) {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0)
    return Math.ceil(seconds * 1000);
  const date = Date.parse(header);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}
async function sleep(ms, signal) {
  signal?.throwIfAborted();
  await new Promise((resolve, reject) => {
    const done = () => {
      signal?.removeEventListener("abort", abort);
      resolve();
    };
    const timer = setTimeout(done, ms);
    const abort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      reject(signal.reason);
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}

/** Operates existing owner-authorized sessions. Never creates or funds a wallet. */
export class Melt {
  #url;
  #key;
  #timeout;
  #fetch;
  constructor({
    baseUrl = "https://melt-woad.vercel.app",
    apiKey,
    timeoutMs = 90_000,
    fetch: transport = globalThis.fetch,
  } = {}) {
    if (typeof apiKey !== "string" || !apiKey.trim() || /\s/.test(apiKey))
      throw new TypeError("Provide an API key created in Melt → Developers");
    if (typeof transport !== "function")
      throw new TypeError("This client requires native fetch (Node.js 24+)");
    this.#url = apiRoot(baseUrl);
    this.#key = apiKey;
    this.#timeout = positive(timeoutMs, "timeoutMs");
    this.#fetch = transport;
  }

  async #request(
    path,
    { body, signal, timeoutMs = this.#timeout, validate, binary = false } = {},
  ) {
    const mutation = body !== undefined;
    const timeout = AbortSignal.timeout(positive(timeoutMs, "timeoutMs"));
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    let response;
    try {
      combined.throwIfAborted();
      response = await this.#fetch(`${this.#url}${path}`, {
        method: mutation ? "POST" : "GET",
        headers: {
          Authorization: `Bearer ${this.#key}`,
          Accept: binary ? "image/jpeg" : "application/json",
          ...(mutation ? { "Content-Type": "application/json" } : {}),
        },
        body: mutation ? JSON.stringify(body) : undefined,
        signal: combined,
        redirect: "error",
      });
      const type = response.headers.get("content-type") || "";
      if (response.ok && binary) {
        if (!type.toLowerCase().startsWith("image/jpeg"))
          throw new MeltError("Melt returned an unexpected screenshot format", {
            code: "INVALID_RESPONSE",
            status: response.status,
          });
        return new Uint8Array(await response.arrayBuffer());
      }
      const text = await response.text();
      let data;
      if (/^application\/(?:json|[\w.-]+\+json)(?:\s*;|$)/i.test(type)) {
        try {
          data = JSON.parse(text);
        } catch {
          /* Report a protocol error below. */
        }
      }
      if (!response.ok) {
        const message =
          record(data) && typeof data.error === "string" && data.error.trim()
            ? data.error.slice(0, 2000)
            : `Melt returned HTTP ${response.status}. Check the API URL and service status.`;
        throw new MeltError(message, {
          status: response.status,
          code: response.status === 429 ? "RATE_LIMITED" : "API_ERROR",
          retryAfterMs: retryDelay(response.headers.get("retry-after")),
          uncertain: mutation,
        });
      }
      if (data === undefined || (validate && !validate(data)))
        throw new MeltError(
          "Melt returned an unexpected response. Check the API URL and client version.",
          {
            code: "INVALID_RESPONSE",
            status: response.status,
            uncertain: mutation,
          },
        );
      return data;
    } catch (error) {
      if (error instanceof MeltError) throw error;
      const aborted = combined.aborted;
      const timedOut = timeout.aborted && !signal?.aborted;
      throw new MeltError(
        timedOut
          ? "Melt request timed out. Read the session before retrying an action."
          : aborted
            ? "Melt request was cancelled. A submitted action may still complete."
            : "Could not reach Melt. Read the session before retrying an action.",
        {
          code: timedOut ? "TIMEOUT" : aborted ? "ABORTED" : "NETWORK_ERROR",
          status: response?.status,
          uncertain: mutation,
          cause: error,
        },
      );
    }
  }
  sessions(options = {}) {
    return this.#request("/sessions", {
      ...options,
      validate: (value) => Array.isArray(value) && value.every(isSession),
    });
  }
  // Read-only Uniswap price discovery so an agent can size a swap before an
  // owner-authorized swap session is run. Never moves funds.
  tokens(options = {}) {
    return this.#request("/swap/tokens", {
      ...options,
      validate: (value) => record(value) && Array.isArray(value.tokens),
    });
  }
  quote(params, options = {}) {
    if (
      !record(params) ||
      typeof params.tokenOut !== "string" ||
      typeof params.amountIn !== "string"
    )
      throw new TypeError("quote needs { tokenOut, amountIn, slippageBps? }");
    const body = { tokenOut: params.tokenOut, amountIn: params.amountIn };
    if (params.slippageBps !== undefined) {
      if (!Number.isInteger(params.slippageBps))
        throw new TypeError("slippageBps must be an integer (basis points)");
      body.slippageBps = params.slippageBps;
    }
    return this.#request("/swap/quote", {
      ...options,
      body,
      validate: (value) =>
        record(value) &&
        typeof value.amountOut === "string" &&
        typeof value.minOut === "string",
    });
  }
  session(id, options = {}) {
    return this.#request(sessionPath(id), { ...options, validate: isSession });
  }
  start(id, { manual = false, ...options } = {}) {
    if (typeof manual !== "boolean")
      throw new TypeError("manual must be a boolean");
    return this.#request(`${sessionPath(id)}/start`, {
      ...options,
      body: { manual },
      validate: isSession,
    });
  }
  pause(id, options = {}) {
    return this.#request(`${sessionPath(id)}/pause`, {
      ...options,
      body: {},
      validate: isSession,
    });
  }
  refresh(id, options = {}) {
    return this.#request(`${sessionPath(id)}/refresh`, {
      ...options,
      body: {},
      validate: isSession,
    });
  }
  close(id, options = {}) {
    return this.#request(`${sessionPath(id)}/close`, {
      ...options,
      body: {},
      validate: isSession,
    });
  }
  observe(id, options = {}) {
    return this.#request(`${sessionPath(id)}/browser`, {
      ...options,
      validate: isObservation,
    });
  }
  screenshot(id, options = {}) {
    return this.#request(`${sessionPath(id)}/screenshot`, {
      ...options,
      binary: true,
    });
  }
  action(id, action, options = {}) {
    if (
      !record(action) ||
      ![
        "click",
        "fill",
        "select",
        "press",
        "scroll",
        "open",
        "wait",
        "finish",
      ].includes(action.type)
    )
      throw new TypeError(
        "Use a click, fill, select, press, scroll, open, wait or finish action",
      );
    if (
      ["click", "fill", "select", "press"].includes(action.type) &&
      (!Number.isInteger(action.index) ||
        action.index < 0 ||
        action.index > 199)
    )
      throw new TypeError(
        "Use a control index from the latest observation (0–199)",
      );
    if (
      ["fill", "select"].includes(action.type) &&
      (typeof action.value !== "string" || action.value.length > 2000)
    )
      throw new TypeError(
        "A field value must be a string of at most 2000 characters",
      );
    if (action.type === "scroll" && !["up", "down"].includes(action.direction))
      throw new TypeError("Scroll direction must be up or down");
    if (
      action.type === "press" &&
      !["Enter", "Tab", "Escape", "ArrowUp", "ArrowDown"].includes(action.key)
    )
      throw new TypeError("Use Enter, Tab, Escape, ArrowUp or ArrowDown");
    if (
      action.reason !== undefined &&
      (typeof action.reason !== "string" || action.reason.length > 160)
    )
      throw new TypeError(
        "An action reason must be a string of at most 160 characters",
      );
    const body = { type: action.type };
    if (["click", "fill", "select", "press"].includes(action.type))
      body.index = action.index;
    if (["fill", "select"].includes(action.type)) body.value = action.value;
    if (action.type === "scroll") body.direction = action.direction;
    if (action.type === "press") body.key = action.key;
    if (action.type === "open") {
      let parsed;
      try {
        parsed = new URL(action.url);
      } catch {
        throw new TypeError("Enter a website URL");
      }
      if (
        typeof action.url !== "string" ||
        action.url.length > 2048 ||
        !["http:", "https:"].includes(parsed.protocol) ||
        parsed.username ||
        parsed.password
      )
        throw new TypeError("Enter a website URL");
      body.url = action.url;
    }
    if (action.reason !== undefined) body.reason = action.reason;
    return this.#request(`${sessionPath(id)}/action`, {
      ...options,
      body,
      validate: isSession,
    });
  }
  receipt(id, options = {}) {
    return this.#request(`${sessionPath(id)}/receipt`, {
      ...options,
      validate: (value) =>
        isSession(value) &&
        value.schemaVersion === 1 &&
        Number.isSafeInteger(value.chainId) &&
        value.chainId > 0 &&
        typeof value.network === "string",
    });
  }
  async wait(
    id,
    {
      timeoutMs = 180_000,
      intervalMs = 2000,
      signal,
      until = ["closed", "attention", "paused"],
    } = {},
  ) {
    sessionPath(id);
    positive(timeoutMs, "timeoutMs");
    positive(intervalMs, "intervalMs");
    if (intervalMs < 250)
      throw new TypeError(
        "intervalMs must be at least 250 to avoid excessive polling",
      );
    if (
      !Array.isArray(until) ||
      !until.length ||
      until.some((state) => !states.has(state))
    )
      throw new TypeError(
        "until must contain one or more valid session states",
      );
    const deadline = AbortSignal.timeout(timeoutMs);
    const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
    try {
      while (true) {
        combined.throwIfAborted();
        let delay = intervalMs;
        try {
          const task = await this.session(id, { signal: combined });
          if (until.includes(task.status)) return task;
        } catch (error) {
          if (!(error instanceof MeltError) || error.status !== 429)
            throw error;
          delay = Math.max(delay, error.retryAfterMs ?? intervalMs);
        }
        await sleep(Math.min(delay, 2_147_483_647), combined);
      }
    } catch (error) {
      if (combined.aborted)
        throw new MeltError(
          signal?.aborted
            ? "Waiting was cancelled. The session is unchanged."
            : "Stopped waiting. The session may still be running; read its status before issuing more actions.",
          { code: signal?.aborted ? "ABORTED" : "WAIT_TIMEOUT", cause: error },
        );
      throw error;
    }
  }
  publicReceipt(token, options = {}) {
    return publicReceipt(token, {
      baseUrl: this.#url,
      fetch: options.fetch || this.#fetch,
    });
  }
}
Melt.constructEvent = constructEvent;
Melt.publicReceipt = publicReceipt;
