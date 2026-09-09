import { useEffect, useState, type CSSProperties } from "react";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { MeltWordmark } from "./components/MeltMotion";
import { BudgetRibbon } from "./components/BudgetRibbon";
import { SessionSeal } from "./SessionSeal";
import { NetworkStrip } from "./NetworkStrip";
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
  const [mainnetNote, setMainnetNote] = useState(false);
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
            <h1 className="hero-title">
              Send money that knows what it is for.
            </h1>
            <p className="hero-lead">
              You lock a purpose and an amount. They spend it later on dinner, a
              flight, or an eSIM, in Melt or in the assistant they already use.
              Cash is too loose. A store card is too tight.
            </p>
            <div className="hero-actions">
              <a className="primary" href={app}>
                Create an envelope
                <ArrowRight size={16} />
              </a>
              <a className="secondary" href="#examples">
                See examples
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
            <SessionSeal status="running" />
            <div className="hero-stage-copy">
              <span>Envelope for Alex</span>
              <strong>
                $120 <small>USD</small>
              </strong>
              <BudgetRibbon value={86} total={120} large symbol="USD" />
              <p>Dinner for two, anywhere they like, before New Year.</p>
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
          <h2>Write the gift in plain English.</h2>
          <div className="example-grid">
            {examples.map((item) => (
              <article
                key={item.kind}
                className="example-slip"
                style={{ "--tilt": item.tilt } as CSSProperties}
              >
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
              </article>
            ))}
          </div>
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
                src="/illustrations/melt-browser.jpg"
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
                src="/illustrations/melt-sleeve.jpg"
                alt="Paper sleeve holding fanned sheets, representing an envelope vault that opens for one gift"
              />
            </figure>
          </motion.article>

          <motion.article className="feature-row" {...reveal}>
            <div>
              <p className="landing-kicker">What they do not use</p>
              <h2>Leftover money comes back to you.</h2>
              <p>
                Allow partial use if you want. After expiry, leftover ETH and
                the settlement asset return, even if Melt is offline.
              </p>
            </div>
            <figure className="feature-media panel">
              <img
                src="/illustrations/melt-return.jpg"
                alt="Paper ticket moving from an open sleeve toward an envelope, representing leftover funds returning"
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
        <div className="landing-wrap agents-grid">
          <div>
            <p className="landing-kicker">One primitive, two hands</p>
            <h2>The gift wallet is also an agent wallet.</h2>
            <p>
              Every envelope is a purpose-bound task vault onchain. The same
              vault powers agent jobs: hand your own browser agent a budget and
              a deadline, watch it work live, take over anytime, and recover
              whatever it does not spend.
            </p>
            <a className="secondary" href={`${app}#activity`}>
              Put an agent to work
              <ArrowUpRight size={16} />
            </a>
          </div>
          <div className="panel story-card">
            <div className="story-meta">
              <strong>Same vault, different hands</strong>
            </div>
            <blockquote>
              An envelope is funded by you and spent by their assistant. An
              agent job is funded by you and spent by your own browser agent.
              Either way: a budget, a purpose, a deadline, and onchain recovery
              that works even if Melt disappears.
            </blockquote>
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
