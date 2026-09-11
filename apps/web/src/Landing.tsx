import { useEffect, useState, type CSSProperties } from "react";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { MeltWordmark } from "./components/MeltMotion";
import { SessionSeal } from "./SessionSeal";
import { NetworkStrip } from "./NetworkStrip";
import { BreakagePour } from "./components/BreakagePour";
import { FitNeedle } from "./components/FitNeedle";
import {
  networkKind,
  SEPOLIA_FAUCET,
} from "../../../packages/shared/src/index";
import "./landing.css";

const app = "/app";
const examples = [
  {
    kind: "Dinner",
    usd: "$120",
    quote: "Dinner for two, anywhere you like, before New Year.",
    ok: "Any restaurant that is still dinner",
    no: "Not groceries. Not cash.",
    tilt: "-1.4deg",
  },
  {
    kind: "Flight",
    usd: "$400",
    quote: "A flight home for Thanksgiving.",
    ok: "A real ticket in that window",
    no: "Not hotel points. Not a transfer.",
    tilt: "1.2deg",
  },
  {
    kind: "Concert",
    usd: "$150",
    quote: "Any concert you want this summer.",
    ok: "Tickets they actually want to see",
    no: "Not merch, unless you said so.",
    tilt: "-0.8deg",
  },
  {
    kind: "eSIM",
    usd: "$20",
    quote: "Mobile data for your Japan trip.",
    ok: "An eSIM or a local top-up",
    no: "Not headphones. Not spending money.",
    tilt: "0.9deg",
  },
  {
    kind: "Apartment",
    usd: "$200",
    quote: "Something for your new apartment, except electronics.",
    ok: "Kitchen, linens, a lamp",
    no: "Not a laptop or a speaker.",
    tilt: "-1.1deg",
  },
  {
    kind: "Game",
    usd: "$40",
    quote: "Any indie game under $40.",
    ok: "A game that fits the cap",
    no: "Not a Steam wallet dump.",
    tilt: "1.4deg",
  },
];
const steps = [
  {
    n: "01",
    title: "Write the gift",
    text: "Who it is for, what it is for, how much, and when it ends.",
  },
  {
    n: "02",
    title: "Lock the money",
    text: "ETH sits in an envelope vault. They cannot withdraw it. You cannot take it back early.",
  },
  {
    n: "03",
    title: "They choose later",
    text: "In Melt, or in an assistant they already use. The assistant finds a match.",
  },
  {
    n: "04",
    title: "Only a match pays",
    text: "Melt checks the purchase, converts just enough on Uniswap, and leaves the rest.",
  },
];
const story = [
  {
    who: "You",
    when: "Today",
    text: "Dinner for two, anywhere you like, up to $120, before New Year.",
  },
  {
    who: "Alex",
    when: "A Friday in December",
    text: "Use the dinner gift Sarah sent me. Find something Italian near me.",
  },
  {
    who: "Melt",
    when: "Same night",
    text: "Italian dinner matches. $86 settles. The rest stays in the envelope.",
  },
];

export default function Landing() {
  const reduced = useReducedMotion();
  const [scrolled, setScrolled] = useState(false);
  const [flipped, setFlipped] = useState<string>();
  const [mainnetNote, setMainnetNote] = useState(false);
  const [tryAsk, setTryAsk] = useState("Italian near me");
  const [tryFit, setTryFit] = useState<{
    verdict: "idle" | "fits" | "no" | "loading";
    reason: string;
  }>({ verdict: "idle", reason: "" });
  const [hostedChainId, setHostedChainId] = useState(
    Number(import.meta.env.VITE_CHAIN_ID || 31337),
  );
  const [hostedName, setHostedName] = useState(
    String(import.meta.env.VITE_CHAIN_NAME || "Local Ethereum"),
  );
  const [faucetUrl, setFaucetUrl] = useState(
    Number(import.meta.env.VITE_CHAIN_ID) === 11155111
      ? SEPOLIA_FAUCET
      : undefined,
  );
  const hostedNetwork = networkKind(hostedChainId);
  const reveal = reduced
    ? {}
    : {
        initial: { opacity: 0, y: 18 },
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true, margin: "-80px" as const },
        transition: { duration: 0.5, ease: "easeOut" as const },
      };
  useEffect(() => {
    const hash = location.hash.slice(1).toLowerCase();
    if (
      [
        "envelopes",
        "discover",
        "activity",
        "developers",
        "sessions",
        "receipts",
      ].includes(hash)
    ) {
      location.replace(app + location.hash);
      return;
    }
    fetch("/api/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((cfg) => {
        if (!cfg?.chain?.id) return;
        setHostedChainId(cfg.chain.id);
        if (cfg.chain.name) setHostedName(cfg.chain.name);
        setFaucetUrl(cfg.faucetUrl || undefined);
      })
      .catch(() => {});
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <div className="landing">
      <header className={`landing-nav${scrolled ? " is-scrolled" : ""}`}>
        <div className="landing-wrap nav-row">
          <a className="wordmark" href="/" aria-label="Melt home">
            <MeltWordmark />
          </a>
          <nav>
            <a href="#examples">Examples</a>
            <a href="#try">Would it count</a>
            <a href="#how">How it works</a>
            <a href="/developers">Developers</a>
          </nav>
          <a className="primary" href={app}>
            Create an envelope
            <ArrowRight size={16} />
          </a>
        </div>
      </header>

      <section className="landing-hero">
        <div className="landing-wrap hero-grid">
          <div>
            <p className="landing-kicker">
              Purpose-bound money for people and agents
            </p>
            <h1 className="hero-title">
              Send money that knows what it is for.
            </h1>
            <p className="hero-lead">
              Lock a purpose and an amount. They spend it later on dinner, a
              flight, or an eSIM, in Melt or in ChatGPT. Or give the same wallet
              to a browser agent for one job.
            </p>
            <div className="hero-actions">
              <a className="primary" href={app}>
                Create an envelope
                <ArrowRight size={16} />
              </a>
              <a className="secondary" href={`${app}#activity`}>
                Give an agent a job
              </a>
            </div>
            <div className="hero-network">
              <NetworkStrip
                network={hostedNetwork}
                chainName={hostedName}
                faucetUrl={faucetUrl}
                onExplainMainnet={() => setMainnetNote(true)}
              />
              {mainnetNote ? (
                <p>
                  This hosted Melt is Sepolia. Mainnet would spend real ETH and
                  is not this deployment.
                </p>
              ) : null}
            </div>
          </div>
          <div className="hero-stage panel">
            <BreakagePour />
            <div className="hero-stage-copy">
              <span>Dinner for two, anywhere they like</span>
              <p>
                Drag dinner. Unused funds return to the sender. A store card
                keeps them.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-facts">
        <div className="landing-wrap fact-row">
          <p>Dinner for two, up to $120</p>
          <p>A flight home for Thanksgiving</p>
          <p>Any concert this summer</p>
          <p>An eSIM for Japan</p>
        </div>
      </section>

      <motion.section id="examples" className="landing-block" {...reveal}>
        <div className="landing-wrap">
          <p className="landing-kicker">What people actually send</p>
          <h2>Write it in English. The store is not the point.</h2>
          <div className="example-grid">
            {examples.map((item) => (
              <button
                key={item.kind}
                type="button"
                className={`example-slip${flipped === item.kind ? " is-flipped" : ""}`}
                style={{ "--tilt": item.tilt } as CSSProperties}
                onClick={() =>
                  setFlipped((cur) =>
                    cur === item.kind ? undefined : item.kind,
                  )
                }
              >
                <span className="example-face">
                  <header>
                    <span>{item.kind}</span>
                    <strong>{item.usd}</strong>
                  </header>
                  <blockquote>{item.quote}</blockquote>
                  <ul>
                    <li>
                      <span>Can</span>
                      {item.ok}
                    </li>
                    <li>
                      <span>Cannot</span>
                      {item.no}
                    </li>
                  </ul>
                </span>
                <span className="example-back">
                  <strong>Unused funds return</strong>
                  <p>
                    Gift cards keep the $3 you don’t spend. Unused money here
                    returns to the sender.
                  </p>
                </span>
              </button>
            ))}
          </div>
        </div>
      </motion.section>

      <motion.section id="try" className="landing-block" {...reveal}>
        <div className="landing-wrap try-grid">
          <div>
            <p className="landing-kicker">
              The question gift cards cannot answer
            </p>
            <h2>Would this count?</h2>
            <p>
              Ask before anyone spends. Italian counts on a dinner gift.
              Cash-out does not.
            </p>
          </div>
          <form
            className="try-fit panel"
            onSubmit={(e) => {
              e.preventDefault();
              const request = tryAsk.trim();
              if (request.length < 2) return;
              setTryFit({ verdict: "loading", reason: "" });
              fetch("/api/public/preview-fit", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  purpose: "Dinner for two, anywhere you like, up to $120",
                  request,
                }),
              })
                .then(async (response) => {
                  const body = await response.json();
                  if (!response.ok)
                    throw Error(body.error || "Could not check that");
                  setTryFit({
                    verdict: body.fits ? "fits" : "no",
                    reason: body.reason || "",
                  });
                })
                .catch((err) =>
                  setTryFit({ verdict: "no", reason: err.message }),
                );
            }}
          >
            <img
              src="/illustrations/melt-fit-needle.png"
              alt=""
              className="try-illust"
            />
            <FitNeedle verdict={tryFit.verdict} />
            <label>
              Dinner gift, $120
              <input
                value={tryAsk}
                onChange={(e) => {
                  setTryAsk(e.target.value);
                  if (tryFit.verdict !== "idle")
                    setTryFit({ verdict: "idle", reason: "" });
                }}
                placeholder="Italian near me, cash out, headphones…"
              />
            </label>
            <div className="try-chips">
              {["Italian near me", "cash out to my wallet", "headphones"].map(
                (ask) => (
                  <button
                    key={ask}
                    type="button"
                    className={tryAsk === ask ? "chosen" : ""}
                    onClick={() => {
                      setTryAsk(ask);
                      setTryFit({ verdict: "idle", reason: "" });
                    }}
                  >
                    {ask}
                  </button>
                ),
              )}
            </div>
            <button
              type="submit"
              className="secondary"
              disabled={
                tryAsk.trim().length < 2 || tryFit.verdict === "loading"
              }
            >
              Ask
            </button>
            {tryFit.reason ? <p className="helper">{tryFit.reason}</p> : null}
          </form>
        </div>
      </motion.section>

      <motion.section id="how" className="landing-block" {...reveal}>
        <div className="landing-wrap">
          <p className="landing-kicker">How it works</p>
          <h2>You send it today. They spend it when they need it.</h2>
          <div className="step-grid">
            {steps.map((step) => (
              <article key={step.n} className="panel step-card">
                <span className="quiet">{step.n}</span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </article>
            ))}
          </div>
        </div>
      </motion.section>

      <motion.section className="landing-block" {...reveal}>
        <div className="landing-wrap">
          <p className="landing-kicker">One gift, two sessions</p>
          <h2>They spend it in Melt, or in the assistant they already use.</h2>
          <div className="story-grid">
            {story.map((item) => (
              <article key={item.who} className="panel story-card">
                <div className="story-meta">
                  <strong>{item.who}</strong>
                  <span>{item.when}</span>
                </div>
                <blockquote>{item.text}</blockquote>
              </article>
            ))}
          </div>
        </div>
      </motion.section>

      <section id="product" className="landing-block">
        <div className="landing-wrap">
          <motion.article className="feature-row" {...reveal}>
            <div>
              <p className="landing-kicker">
                Give their assistant a way to pay
              </p>
              <h2>They do not need a new shopping app.</h2>
              <p>
                Create the envelope here. Weeks later they tell an assistant to
                use it, e.g. ChatGPT or Claude. Melt is the wallet that
                assistant calls. You never hand it an unrestricted key.
              </p>
            </div>
            <figure className="feature-media panel">
              <img
                src="/illustrations/melt-agent-sleeve.png"
                alt="Paper card with a receipt strip, representing a purpose-bound envelope"
              />
            </figure>
          </motion.article>

          <motion.article className="feature-row flip" {...reveal}>
            <div>
              <p className="landing-kicker">Held between two people</p>
              <h2>Neither Melt nor a model can rewrite the gift.</h2>
              <p>
                Ethereum keeps the amount, the purpose, the expiry, and where
                unused funds go. The recipient cannot cash it out. You cannot
                claw it back early.
              </p>
            </div>
            <figure className="feature-media panel">
              <img
                src="/illustrations/melt-loom.png"
                alt="A small loom of waxed threads, representing a gift that can become some things and not others"
              />
            </figure>
          </motion.article>

          <motion.article className="feature-row" {...reveal}>
            <div>
              <p className="landing-kicker">What they do not use</p>
              <h2>Unused funds return to the sender.</h2>
              <p>
                After the gift ends, unused ETH and the settlement asset return
                to the sender, even if Melt is offline.
              </p>
            </div>
            <figure className="feature-media panel">
              <img
                src="/illustrations/melt-pour.png"
                alt="Wax pouring from a gift well into a sender well, representing leftover funds returning"
              />
            </figure>
          </motion.article>
        </div>
      </section>

      <motion.section className="landing-block" {...reveal}>
        <div className="landing-wrap agents-grid">
          <div>
            <p className="landing-kicker">Any MCP client</p>
            <h2>Connect an agent. It can spend a gift, not send cash.</h2>
            <p>
              Fund the envelope yourself. Give the recipient an API key. Their
              assistant can find options, propose a purchase, and redeem, e.g.
              ChatGPT, Claude, Cursor, or Grok. It cannot create envelopes or
              raise the amount.
            </p>
            <a className="secondary" href="/developers">
              Agent docs
              <ArrowUpRight size={16} />
            </a>
          </div>
          <pre className="panel agent-sample">{`const melt = new Melt({ apiKey });
const { received } = await melt.envelopes();
const found = await melt.findOptions(received[0].id, 'Italian near me');
const quote = await melt.proposePurchase(received[0].id, { sku: found.options[0].sku });
await melt.redeem(received[0].id, quote.quote.id);`}</pre>
        </div>
      </motion.section>

      <motion.section className="landing-block" {...reveal}>
        <div className="landing-wrap">
          <p className="landing-kicker">Where Melt started</p>
          <h2>A wallet for a browser agent. Then a gift on the same vault.</h2>
          <p className="evolution-lead">
            Melt began as a spending-limit wallet for one job: a budget, a
            deadline, unused funds returned. The gift is that wallet handed to
            someone else. The purpose is the instruction. Their assistant spends
            it.
          </p>
          <div className="evolution-strip" aria-hidden="true">
            <motion.article
              className="panel evolution-card"
              initial={reduced ? false : { opacity: 0, x: -24 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.45 }}
            >
              <span className="evolution-tag">The original idea</span>
              <strong>An agent job</strong>
              <p>“Mint the demo NFT.”</p>
              <dl>
                <div>
                  <dt>Budget</dt>
                  <dd>0.005 ETH</dd>
                </div>
                <div>
                  <dt>Deadline</dt>
                  <dd>15 minutes</dd>
                </div>
                <div>
                  <dt>Spent by</dt>
                  <dd>your browser agent</dd>
                </div>
              </dl>
            </motion.article>
            <div className="evolution-melt">
              <i />
              <i />
              <i />
              <span>same vault</span>
            </div>
            <motion.article
              className="panel evolution-card"
              initial={reduced ? false : { opacity: 0, x: 24 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.45, delay: 0.15 }}
            >
              <span className="evolution-tag">What it became</span>
              <strong>An envelope</strong>
              <p>“Dinner for two, anywhere you like.”</p>
              <dl>
                <div>
                  <dt>Budget</dt>
                  <dd>$120</dd>
                </div>
                <div>
                  <dt>Deadline</dt>
                  <dd>New Year</dd>
                </div>
                <div>
                  <dt>Spent by</dt>
                  <dd>their assistant</dd>
                </div>
              </dl>
            </motion.article>
          </div>
          <div className="evolution-actions">
            <a className="secondary" href={`${app}#activity`}>
              Give an agent a job
              <ArrowUpRight size={16} />
            </a>
          </div>
        </div>
      </motion.section>

      <section className="landing-close">
        <div className="landing-wrap close-panel panel">
          <SessionSeal status="ready" />
          <div>
            <h2>Send dinner tonight. Let them pick the table later.</h2>
            <p>
              Create an envelope in a minute. Unused funds come back to you.
            </p>
            <a className="primary" href={app}>
              Create an envelope
              <ArrowRight size={16} />
            </a>
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-wrap footer-row">
          <span>Melt · Gift cards without stores</span>
          <div>
            <a href={app}>App</a>
            <a href="/recover">Recover</a>
            <a href="https://github.com/GitBolt/melt">Source</a>
            <a href="/developers">API</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
