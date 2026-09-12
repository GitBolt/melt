import { useCallback, useEffect, useState } from "react";
import {
  ArrowUpRight,
  Check,
  Copy,
  Download,
  Plus,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import { MeltLoader, MeltWordmark } from "./components/MeltMotion";
import { PoweredByUniswap } from "./components/PoweredByUniswap";
import type { Auth } from "./App";
import type { Config } from "../../../packages/shared/src/index";
import "./developers.css";

const PAGES = [
  { id: "overview", label: "Overview", group: "Guide" },
  { id: "start", label: "Quickstart", group: "Guide" },
  { id: "http", label: "HTTP", group: "Guide" },
  { id: "mcp", label: "MCP", group: "Guide" },
  { id: "client", label: "JavaScript", group: "Guide" },
  { id: "keys", label: "API keys", group: "Account" },
  { id: "usage", label: "Usage", group: "Account" },
  { id: "webhooks", label: "Webhooks", group: "Account" },
] as const;
type Page = (typeof PAGES)[number]["id"];
const HOOK_EVENTS = [
  "envelope.created",
  "envelope.funded",
  "envelope.redeemed",
  "envelope.thanked",
  "swap.executed",
  "session.created",
  "session.funded",
  "session.closed",
  "session.recovered",
];

function pageFromPath(): Page {
  const path = location.pathname.replace(/\/+$/, "") || "/";
  if (path === "/docs") return "start";
  const rest = path.replace(/^\/developers\/?/, "");
  const match = PAGES.find((page) => page.id === rest);
  return match?.id || "overview";
}

function pathFor(page: Page) {
  if (page === "overview") return "/developers";
  return `/developers/${page}`;
}

function CodeBlock({
  code,
  label,
  onCopy,
}: {
  code: string;
  label?: string;
  onCopy: (text: string, notice: string) => void;
}) {
  return (
    <div className="plat-code">
      {label ? <span>{label}</span> : null}
      <pre>
        <code>{code}</code>
      </pre>
      <button
        type="button"
        onClick={() => onCopy(code, "Copied")}
        aria-label="Copy code"
      >
        Copy
      </button>
    </div>
  );
}

export default function DevelopersPortal({
  config,
  auth,
}: {
  config: Config;
  auth?: Auth;
}) {
  const origin = location.origin;
  const mcpUrl = config.platform?.mcp || `${origin}/api/mcp`;
  const [page, setPage] = useState<Page>(pageFromPath);
  const [user, setUser] = useState<{ id: string; owner: string } | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [keys, setKeys] = useState<any[]>([]);
  const [token, setToken] = useState("");
  const [hooks, setHooks] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [usage, setUsage] = useState<any>();
  const [hookUrl, setHookUrl] = useState("");
  const [hookSecret, setHookSecret] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>(HOOK_EVENTS);

  const request = useCallback(
    async (path: string, body?: unknown, method?: string) => {
      const token = await auth?.getToken();
      const r = await fetch(`/api${path}`, {
        method: method || (body ? "POST" : "GET"),
        headers: {
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const text = await r.text();
      let data: any = {};
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          throw Object.assign(Error("Request failed"), { status: r.status });
        }
      }
      if (!r.ok)
        throw Object.assign(Error(data.error || "Request failed"), {
          status: r.status,
        });
      return data;
    },
    [auth?.authenticated],
  );

  const go = (id: Page) => {
    history.pushState({}, "", pathFor(id));
    setPage(id);
  };

  useEffect(() => {
    const onPop = () => setPage(pageFromPath());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const refreshMe = useCallback(async () => {
    try {
      const me = await request("/me");
      setUser(me);
      return me;
    } catch (e) {
      if ((e as any).status === 401) setUser(null);
      else setError((e as Error).message);
      return null;
    }
  }, [request]);

  const refreshAccount = useCallback(async () => {
    const me = await refreshMe();
    if (!me) {
      setKeys([]);
      setHooks([]);
      setEvents([]);
      setUsage(undefined);
      return;
    }
    try {
      const [nextKeys, nextHooks, nextEvents, nextUsage] = await Promise.all([
        request("/keys"),
        request("/webhooks"),
        request("/events"),
        request("/usage"),
      ]);
      setKeys(nextKeys);
      setHooks(nextHooks);
      setEvents(nextEvents);
      setUsage(nextUsage);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [refreshMe, request]);

  useEffect(() => {
    void refreshAccount();
  }, [refreshAccount]);

  useEffect(() => {
    if (!["keys", "usage", "webhooks"].includes(page)) return;
    void refreshAccount();
    if (page !== "usage") return;
    const timer = setInterval(() => {
      if (!document.hidden) void refreshAccount();
    }, 8000);
    return () => clearInterval(timer);
  }, [page]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  const act = async (name: string, fn: () => Promise<unknown>) => {
    setBusy(name);
    setError("");
    try {
      await fn();
      await refreshAccount();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  const signIn = () =>
    auth
      ? auth.login()
      : act("signin", async () => {
          await request("/auth/local", {});
        });

  const copy = async (text: string, message: string) => {
    await navigator.clipboard.writeText(text);
    setNotice(message);
  };

  const jsSample = `import { Melt } from './melt-client.mjs';

const melt = new Melt({
  baseUrl: '${origin}',
  apiKey: process.env.MELT_API_KEY
});

const { sent, received } = await melt.envelopes();
const envelope = received[0] || sent[0];
const found = await melt.findOptions(envelope.id, 'an eSIM for Japan');
const quote = await melt.proposePurchase(envelope.id, {
  sku: found.options[0].sku
});
await melt.redeem(envelope.id, quote.quote.id);`;

  const mcpRemote = `{
  "mcpServers": {
    "melt": {
      "url": "${mcpUrl}",
      "headers": {
        "Authorization": "Bearer \${MELT_API_KEY}"
      }
    }
  }
}`;

  const mcpStdio = `{
  "mcpServers": {
    "melt": {
      "command": "npx",
      "args": ["tsx", "packages/sdk/src/mcp.ts"],
      "env": {
        "MELT_API_KEY": "melt_…",
        "MELT_API_URL": "${origin}"
      }
    }
  }
}`;

  const curlList = `curl --fail-with-body \\
  '${origin}/api/envelopes' \\
  -H "Authorization: Bearer $MELT_API_KEY"`;

  const webhookSample = `import { constructEvent } from './melt-client.mjs';

const event = await constructEvent(
  rawBody,
  request.headers['melt-signature'],
  process.env.MELT_WEBHOOK_SECRET
);`;

  const maxPath = Math.max(
    1,
    ...(usage?.byPath || []).map((row: { count: number }) => row.count || 0),
  );

  return (
    <div className="plat-shell">
      <header className="plat-top">
        <a className="plat-brand" href="/developers">
          <MeltWordmark />
          <b>developers</b>
        </a>
        <a className="plat-gifts" href="/app">
          Send a gift
        </a>
        {user ? (
          <div className="account-cluster">
            <button
              className="account"
              title={user.owner}
              onClick={() =>
                void navigator.clipboard
                  .writeText(user.owner)
                  .then(() => setNotice("Wallet address copied"))
                  .catch(() => setError("Could not copy the address"))
              }
            >
              <Wallet size={14} />
              {user.owner
                ? `${user.owner.slice(0, 6)}…${user.owner.slice(-4)}`
                : "Signed in"}
              <Copy size={13} />
            </button>
            <button
              className="account-signout"
              disabled={!!busy}
              onClick={() =>
                act("logout", async () => {
                  await request("/auth/logout", {});
                  await auth?.logout();
                  setToken("");
                  setHookSecret("");
                })
              }
            >
              Sign out
            </button>
          </div>
        ) : (
          <button
            className="account"
            onClick={signIn}
            disabled={!!busy || auth?.ready === false}
          >
            {busy === "signin" ? (
              <MeltLoader size={16} />
            ) : (
              <Wallet size={14} />
            )}
            {config.mode === "local" ? "Open local workspace" : "Sign in"}
          </button>
        )}
      </header>
      {error ? (
        <div className="plat-alert" role="alert">
          <span>{error}</span>
          <button aria-label="Dismiss error" onClick={() => setError("")}>
            <X size={16} />
          </button>
        </div>
      ) : null}
      <div className="plat-body">
        <nav className="plat-nav" aria-label="Developer docs">
          {PAGES.map((item, i) => (
            <span key={item.id}>
              {(i === 0 || PAGES[i - 1].group !== item.group) && (
                <div className="plat-nav-group">{item.group}</div>
              )}
              <a
                href={pathFor(item.id)}
                aria-current={page === item.id ? "page" : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  go(item.id);
                }}
              >
                {item.label}
              </a>
            </span>
          ))}
        </nav>
        <main className="plat-main">
          {page === "overview" && (
            <>
              <p className="plat-kicker">Melt for agents</p>
              <h1>Connect ChatGPT, Claude, Cursor, or Grok</h1>
              <p className="plat-lead">
                Create and fund an envelope in Melt. Give the recipient a key.
                Their assistant can find a matching gift card, propose a quote,
                and redeem it. It cannot create a gift, raise the amount, or
                send cash.
              </p>
              <div className="plat-wire panel">
                <span>Hosted MCP</span>
                <code>{mcpUrl}</code>
                <button
                  className="secondary"
                  onClick={() => copy(mcpUrl, "MCP URL copied")}
                >
                  <Copy size={13} />
                  Copy
                </button>
              </div>
              <div className="plat-lock">
                <article className="panel">
                  <h2 className="ok">A key can</h2>
                  <ul>
                    <li>List envelopes this account sent or received</li>
                    <li>Find gift cards that match the gift</li>
                    <li>Propose a catalog option</li>
                    <li>Redeem that quote onchain</li>
                  </ul>
                </article>
                <article className="panel">
                  <h2>A key cannot</h2>
                  <ul>
                    <li>Create a new envelope</li>
                    <li>Raise the amount or change the purpose</li>
                    <li>Move leftover funds as cash</li>
                    <li>Change the return wallet</li>
                  </ul>
                </article>
              </div>
              <div className="plat-actions">
                <button className="primary" onClick={() => go("start")}>
                  Start with a key
                  <ArrowUpRight size={15} />
                </button>
                <a className="secondary" href="/app">
                  Create an envelope first
                </a>
              </div>
            </>
          )}
          {page === "start" && (
            <>
              <p className="plat-kicker">Five minutes</p>
              <h1>From a gift to a redeeming agent</h1>
              <p className="plat-lead">
                Melt does not sell a store. You lock a purpose in the app. An
                existing assistant spends against that promise.
              </p>
              <div className="plat-steps">
                <article className="panel">
                  <b>1</b>
                  <div>
                    <h2>Create the envelope as the owner</h2>
                    <p>
                      Sign in at Melt, write the purpose, and fund the vault.
                      The recipient can open the gift link without an account.
                    </p>
                  </div>
                </article>
                <article className="panel">
                  <b>2</b>
                  <div>
                    <h2>Mint an API key here</h2>
                    <p>
                      Keys are shown once. Store them on the agent host, never
                      in a public frontend. Revoke at any time.
                    </p>
                    {user ? (
                      <button
                        className="primary"
                        disabled={!!busy}
                        onClick={() =>
                          act("key", async () => {
                            const data = await request("/keys", {
                              name: `Agent ${keys.length + 1}`,
                            });
                            setToken(data.token);
                            go("keys");
                          })
                        }
                      >
                        <Plus size={15} />
                        Create API key
                      </button>
                    ) : (
                      <button className="primary" onClick={signIn}>
                        Sign in to create a key
                      </button>
                    )}
                  </div>
                </article>
                <article className="panel">
                  <b>3</b>
                  <div>
                    <h2>Point the assistant at Melt</h2>
                    <p>
                      Hosted MCP is the fastest path. HTTP and the downloadable
                      client are the same envelope flow.
                    </p>
                  </div>
                </article>
              </div>
              <CodeBlock
                label="First HTTP call"
                code={curlList}
                onCopy={copy}
              />
            </>
          )}
          {page === "http" && (
            <>
              <p className="plat-kicker">REST</p>
              <h1>HTTP for any agent runtime</h1>
              <p className="plat-lead">
                Base URL is {origin}/api. Send Authorization: Bearer melt_….
                Owner-only routes need a signed-in Melt session, not a key.
              </p>
              <div className="plat-actions">
                <a
                  className="secondary"
                  href="/api/openapi.json"
                  target="_blank"
                  rel="noreferrer"
                >
                  OpenAPI
                  <ArrowUpRight size={14} />
                </a>
                <a
                  className="secondary"
                  href="/api/platform"
                  target="_blank"
                  rel="noreferrer"
                >
                  Discovery JSON
                  <ArrowUpRight size={14} />
                </a>
              </div>
              <div className="plat-endpoints">
                {[
                  ["GET", "/envelopes", "List sent and received envelopes"],
                  [
                    "GET",
                    "/envelopes/:id",
                    "Purpose, remaining funds, policy hash",
                  ],
                  [
                    "GET",
                    "/envelopes/:id/options",
                    "Find gift cards that match the gift",
                  ],
                  [
                    "POST",
                    "/envelopes/:id/propose",
                    "Propose a catalog option; no funds move",
                  ],
                  [
                    "POST",
                    "/envelopes/:id/redeem",
                    "Settle that quote. No generic transfer.",
                  ],
                  [
                    "GET",
                    "/envelopes/:id/redemptions",
                    "Settlement and delivery status",
                  ],
                  [
                    "GET",
                    "/platform",
                    "Public docs, MCP URL, and agent limits",
                  ],
                  ["POST", "/mcp", "Hosted MCP Streamable HTTP"],
                ].map(([method, path, label]) => (
                  <div key={path}>
                    <span>{method}</span>
                    <code>{path}</code>
                    <p>{label}</p>
                  </div>
                ))}
              </div>
              <CodeBlock
                label="Propose then redeem"
                code={`curl --fail-with-body '${origin}/api/envelopes/$ID/options?request=an%20eSIM%20for%20Japan' \\
  -H "Authorization: Bearer $MELT_API_KEY"

curl --fail-with-body '${origin}/api/envelopes/$ID/propose' \\
  -H "Authorization: Bearer $MELT_API_KEY" \\
  -H 'Content-Type: application/json' \\
  -d '{"sku":"esim-trip-5gb"}'

curl --fail-with-body '${origin}/api/envelopes/$ID/redeem' \\
  -H "Authorization: Bearer $MELT_API_KEY" \\
  -H 'Content-Type: application/json' \\
  -d '{"quoteId":"QUOTE_UUID"}'`}
                onCopy={copy}
              />
            </>
          )}
          {page === "mcp" && (
            <>
              <p className="plat-kicker">Model Context Protocol</p>
              <h1>One URL for ChatGPT, Claude, Cursor, or Grok</h1>
              <p className="plat-lead">
                Hosted MCP speaks Streamable HTTP at {mcpUrl}. Authenticate with
                the same Melt API key. Tools can list envelopes, find options,
                propose, and redeem. There is no cash-out tool.
              </p>
              <div className="plat-wire panel">
                <span>Endpoint</span>
                <code>{mcpUrl}</code>
                <button
                  className="secondary"
                  onClick={() => copy(mcpUrl, "MCP URL copied")}
                >
                  <Copy size={13} />
                  Copy
                </button>
              </div>
              <h2>Remote MCP</h2>
              <p>
                Paste this into Cursor MCP settings, Claude connectors, or any
                client that accepts a Streamable HTTP URL.
              </p>
              <CodeBlock label="mcp.json" code={mcpRemote} onCopy={copy} />
              <h2>Local stdio</h2>
              <p>
                If you cloned this repo, the same tools run over stdio. Keep the
                key on that machine.
              </p>
              <CodeBlock label="stdio" code={mcpStdio} onCopy={copy} />
              <p className="helper">
                From the repo root you can also run npm run agent:mcp after
                exporting MELT_API_KEY.
              </p>
            </>
          )}
          {page === "client" && (
            <>
              <p className="plat-kicker">No npm package</p>
              <h1>Download the JavaScript client</h1>
              <p className="plat-lead">
                One file, native fetch, no dependencies. Keep a reviewed copy in
                your project. Type declarations are optional.
              </p>
              <div className="plat-actions">
                <a className="primary" href="/api/client.mjs">
                  <Download size={14} />
                  melt-client.mjs
                </a>
                <a className="secondary" href="/api/client.d.mts">
                  Type declarations
                </a>
              </div>
              <CodeBlock label="Redeem a gift" code={jsSample} onCopy={copy} />
            </>
          )}
          {page === "keys" && (
            <>
              <p className="plat-kicker">Credentials</p>
              <h1>API keys</h1>
              <p className="plat-lead">
                Each key is shown once. Usage counts update when an agent calls
                the API. Revocation applies to the next request.
              </p>
              {user ? (
                <>
                  <button
                    className="primary"
                    disabled={!!busy}
                    onClick={() =>
                      act("key", async () => {
                        const data = await request("/keys", {
                          name: `Agent ${keys.length + 1}`,
                        });
                        setToken(data.token);
                      })
                    }
                  >
                    <Plus size={15} />
                    Create API key
                  </button>
                  {token && (
                    <div className="key-reveal">
                      <code>{token}</code>
                      <button
                        className="secondary"
                        onClick={() => copy(token, "Key copied")}
                      >
                        <Copy size={13} />
                        Copy key
                      </button>
                      <p className="helper">
                        Store this on the agent host. Melt only keeps a hash.
                      </p>
                    </div>
                  )}
                  <div className="plat-keys">
                    {keys.length === 0 && (
                      <p className="helper">No keys yet.</p>
                    )}
                    {keys.map((k) => (
                      <div className="plat-key" key={k.id}>
                        <span>
                          {k.name}
                          <small>
                            {k.revoked ? "Revoked" : "Active"}
                            {k.requests
                              ? ` · ${k.requests} request${k.requests === 1 ? "" : "s"}`
                              : ""}
                            {k.lastUsed
                              ? ` · last ${new Date(k.lastUsed).toLocaleString()}`
                              : ""}
                          </small>
                        </span>
                        <button
                          aria-label={`Revoke ${k.name}`}
                          disabled={!!k.revoked || !!busy}
                          onClick={() =>
                            act("revoke", async () => {
                              await request(
                                `/keys/${k.id}`,
                                undefined,
                                "DELETE",
                              );
                            })
                          }
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <button className="secondary" onClick={signIn}>
                  Sign in to create an API key
                </button>
              )}
            </>
          )}
          {page === "usage" && (
            <>
              <p className="plat-kicker">Last 30 days</p>
              <h1>Usage</h1>
              <p className="plat-lead">
                Every API key request is stored. Envelope ids are folded so this
                log stays readable. Hosted MCP tools appear as /mcp/tool-name.
              </p>
              {user ? (
                usage ? (
                  <>
                    <div className="plat-stats">
                      <article className="panel">
                        <p>Requests</p>
                        <strong>{usage.total}</strong>
                      </article>
                      <article className="panel">
                        <p>Errors</p>
                        <strong>{usage.errors}</strong>
                      </article>
                      <article className="panel">
                        <p>Keys</p>
                        <strong>{usage.keys?.length || 0}</strong>
                      </article>
                    </div>
                    <h2>By route</h2>
                    {(usage.byPath || []).length === 0 ? (
                      <p className="helper">
                        No agent calls yet. Redeem a gift with a key to see
                        traffic here.
                      </p>
                    ) : (
                      <table className="plat-table">
                        <thead>
                          <tr>
                            <th>Route</th>
                            <th>Calls</th>
                            <th>Errors</th>
                          </tr>
                        </thead>
                        <tbody>
                          {usage.byPath.map(
                            (row: {
                              path: string;
                              method: string;
                              count: number;
                              errors: number;
                            }) => (
                              <tr key={row.method + row.path}>
                                <td>
                                  <code>
                                    {row.method} {row.path}
                                  </code>
                                  <div className="plat-meter">
                                    <i
                                      style={{
                                        width: `${Math.max(8, (row.count / maxPath) * 100)}%`,
                                      }}
                                    />
                                  </div>
                                </td>
                                <td>{row.count}</td>
                                <td>{row.errors}</td>
                              </tr>
                            ),
                          )}
                        </tbody>
                      </table>
                    )}
                    <h2>Recent calls</h2>
                    <table className="plat-table">
                      <thead>
                        <tr>
                          <th>When</th>
                          <th>Call</th>
                          <th>Status</th>
                          <th>Key</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(usage.recent || []).map(
                          (
                            row: {
                              created: string;
                              method: string;
                              path: string;
                              status: number;
                              keyName?: string;
                            },
                            i: number,
                          ) => (
                            <tr key={row.created + i}>
                              <td>
                                {new Date(row.created).toLocaleTimeString()}
                              </td>
                              <td>
                                <code>
                                  {row.method} {row.path}
                                </code>
                              </td>
                              <td>{row.status}</td>
                              <td>{row.keyName || "Key"}</td>
                            </tr>
                          ),
                        )}
                      </tbody>
                    </table>
                  </>
                ) : (
                  <p className="helper">Loading usage…</p>
                )
              ) : (
                <button className="secondary" onClick={signIn}>
                  Sign in to see usage
                </button>
              )}
            </>
          )}
          {page === "webhooks" && (
            <>
              <p className="plat-kicker">Account events</p>
              <h1>Webhooks</h1>
              <p className="plat-lead">
                Melt signs the raw JSON with HMAC-SHA256 and sends a
                Melt-Signature header in Stripe’s t=,v1= form. HTTPS is required
                in production.
              </p>
              {user ? (
                <>
                  <label className="hook-url">
                    Endpoint URL
                    <input
                      value={hookUrl}
                      onChange={(e) => setHookUrl(e.target.value)}
                      placeholder="https://example.com/melt-webhooks"
                    />
                  </label>
                  <div className="hook-events">
                    {HOOK_EVENTS.map((type) => (
                      <label key={type}>
                        <input
                          type="checkbox"
                          checked={selectedEvents.includes(type)}
                          onChange={() =>
                            setSelectedEvents((current) =>
                              current.includes(type)
                                ? current.filter((item) => item !== type)
                                : [...current, type],
                            )
                          }
                        />
                        {type}
                      </label>
                    ))}
                  </div>
                  <button
                    className="primary"
                    disabled={
                      !!busy || !hookUrl.trim() || !selectedEvents.length
                    }
                    onClick={() =>
                      act("webhook", async () => {
                        const created = await request("/webhooks", {
                          url: hookUrl.trim(),
                          events: selectedEvents,
                        });
                        setHookSecret(created.secret);
                        setHookUrl("");
                      })
                    }
                  >
                    <Plus size={15} />
                    Add endpoint
                  </button>
                  {hookSecret && (
                    <div className="key-reveal">
                      <code>{hookSecret}</code>
                      <button
                        className="secondary"
                        onClick={() =>
                          copy(hookSecret, "Signing secret copied")
                        }
                      >
                        <Copy size={13} />
                        Copy signing secret
                      </button>
                      <p className="helper">
                        Shown once. Store it on your server.
                      </p>
                    </div>
                  )}
                  <CodeBlock
                    label="Verify a signature"
                    code={webhookSample}
                    onCopy={copy}
                  />
                  <div className="plat-hooks">
                    {hooks.map((hook) => (
                      <div className="plat-hook" key={hook.id}>
                        <div>
                          <code>{hook.url}</code>
                          <p>{hook.events.join(", ")}</p>
                        </div>
                        <div className="hook-actions">
                          <button
                            className="secondary"
                            disabled={!!busy}
                            onClick={() =>
                              act("ping", async () => {
                                const result = await request(
                                  `/webhooks/${hook.id}/ping`,
                                  {},
                                );
                                setNotice(
                                  result.delivered
                                    ? "Test event delivered"
                                    : "Endpoint did not accept the test event",
                                );
                              })
                            }
                          >
                            Send test
                          </button>
                          <button
                            aria-label={`Delete webhook ${hook.url}`}
                            disabled={!!busy}
                            onClick={() =>
                              act("delete-hook", async () => {
                                await request(
                                  `/webhooks/${hook.id}`,
                                  undefined,
                                  "DELETE",
                                );
                              })
                            }
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <h2>Event log</h2>
                  <p className="helper">
                    The same objects Melt posts to your webhook. Agent keys
                    cannot read this log.
                  </p>
                  <div className="plat-events">
                    {events.length ? (
                      events.map((item) => (
                        <div className="plat-event" key={item.id}>
                          <code>{item.type}</code>
                          <time>
                            {new Date(item.created).toLocaleTimeString()}
                          </time>
                        </div>
                      ))
                    ) : (
                      <p className="helper">No events yet.</p>
                    )}
                  </div>
                </>
              ) : (
                <button className="secondary" onClick={signIn}>
                  Sign in to add a webhook
                </button>
              )}
            </>
          )}
        </main>
      </div>
      <footer className="plat-foot">
        <a href="/">Melt · Purpose-bound gift cards</a>
        <PoweredByUniswap compact />
        <a href="/app">Consumer app</a>
      </footer>
      {notice ? (
        <div className="plat-toast" role="status">
          <Check size={15} />
          {notice}
        </div>
      ) : null}
    </div>
  );
}
