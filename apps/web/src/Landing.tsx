import { useEffect, useState } from "react";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { MeltWordmark } from "./components/MeltMotion";
import { BudgetRibbon } from "./components/BudgetRibbon";
import { SessionSeal } from "./SessionSeal";
import "./landing.css";

const app = "/app";
const steps = [
  {
    n: "01",
    title: "Write the promise",
    text: "Dinner for two. A flight home. Mobile data for a trip. You set the purpose, the amount, and when it expires.",
  },
  {
    n: "02",
    title: "Lock it onchain",
    text: "The ETH is held in a Melt envelope. The recipient cannot cash it out. You cannot take it back early.",
  },
  {
    n: "03",
    title: "Their assistant chooses",
    text: "Weeks later they ask ChatGPT, Claude, Codex or Grok to use the gift. Melt finds options that match the promise.",
  },
  {
    n: "04",
    title: "Only a qualifying purchase settles",
    text: "Uniswap converts just the required amount. Leftover funds stay in the envelope, then return to you when it expires.",
  },
];
const uses = [
  {
    title: "You want to send dinner, not a restaurant gift card",
    text: "The recipient picks the place later. Any Italian restaurant, any Friday. Melt checks that the purchase is still dinner.",
  },
  {
    title: "Someone you love is travelling",
    text: "Mobile data for the trip, up to $20. Their assistant finds an eSIM. The money cannot become headphones.",
  },
  {
    title: "You share an assistant, not an app",
    text: "You create the envelope on Melt. They redeem it from ChatGPT. Ethereum holds the conditions between those sessions.",
  },
  {
    title: "You need proof of what it became",
    text: "Every envelope has a public receipt: the mandate, the hashes, and how unused funds return. No Melt login required.",
  },
];
const flow = [
  { title: "Sign in", text: "Email or a wallet, through Privy." },
  {
    title: "Create an envelope",
    text: "Purpose, amount, expiry, who it’s for.",
  },
  { title: "Fund it", text: "ETH is locked in the envelope vault." },
  {
    title: "They choose later",
    text: "Melt or their existing assistant finds a match.",
  },
  {
    title: "Settle the purchase",
    text: "Uniswap converts only what is needed.",
  },
];

export default function Landing() {
  const reduced = useReducedMotion();
  const [scrolled, setScrolled] = useState(false);
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
            <a href="#when">When to use it</a>
            <a href="#how">How it works</a>
            <a href={`${app}#developers`}>Developers</a>
          </nav>
          <a className="primary" href={app}>
            Open Melt
            <ArrowRight size={16} />
          </a>
        </div>
      </header>

      <section className="landing-hero">
        <div className="landing-wrap hero-grid">
          <div>
            <h1 className="hero-title">Gift cards without stores.</h1>
            <p className="hero-lead">
              Send purchasing power for a purpose — dinner, a flight home, a
              concert — and let their AI choose how to use it later. The money
              can only become what you meant.
            </p>
            <div className="hero-actions">
              <a className="primary" href={app}>
                Open Melt
                <ArrowRight size={16} />
              </a>
              <a className="secondary" href="#how">
                See how it works
              </a>
            </div>
          </div>
          <div className="hero-stage panel">
            <SessionSeal status="running" />
            <div className="hero-stage-copy">
              <span>Envelope</span>
              <strong>
                0.05 <small>ETH</small>
              </strong>
              <BudgetRibbon value={0.008} total={0.05} large />
              <p>Dinner for two, anywhere they like, before New Year.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-facts">
        <div className="landing-wrap fact-row">
          <p>Purpose-bound gifts, not cash</p>
          <p>Redeemed through any assistant</p>
          <p>Uniswap converts only what’s needed</p>
          <p>Unused funds return to the sender</p>
        </div>
      </section>

      <motion.section id="when" className="landing-block" {...reveal}>
        <div className="landing-wrap">
          <p className="landing-kicker">When this is the right tool</p>
          <h2>When cash is too loose and a gift card is too tight.</h2>
          <div className="use-grid">
            {uses.map((item) => (
              <article key={item.title} className="panel step-card">
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </div>
      </motion.section>

      <motion.section id="how" className="landing-block" {...reveal}>
        <div className="landing-wrap">
          <p className="landing-kicker">How an envelope works</p>
          <h2>You send a possibility. They choose later.</h2>
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

      <section id="product" className="landing-block">
        <div className="landing-wrap">
          <motion.article className="feature-row" {...reveal}>
            <div>
              <p className="landing-kicker">Any purpose you can describe</p>
              <h2>Start from the promise, not a store.</h2>
              <p>
                Dinner for two, a flight home, something for a new apartment
                except electronics. The recipient’s assistant finds a qualifying
                purchase. Melt checks it against the original gift.
              </p>
            </div>
            <figure className="feature-media panel">
              <img
                src="/illustrations/melt-browser.jpg"
                alt="Paper browser card with a receipt strip, representing the isolated task browser"
              />
            </figure>
          </motion.article>

          <motion.article className="feature-row flip" {...reveal}>
            <div>
              <p className="landing-kicker">Held between two people</p>
              <h2>Neither Melt nor a model can rewrite it.</h2>
              <p>
                Sign in with email. Fund the envelope. Weeks later a completely
                different assistant can redeem it through MCP. Ethereum holds
                the money and the conditions between those sessions.
              </p>
            </div>
            <figure className="feature-media panel">
              <img
                src="/illustrations/melt-sleeve.jpg"
                alt="Paper sleeve holding fanned sheets, representing a task wallet opening for one job"
              />
            </figure>
          </motion.article>

          <motion.article className="feature-row" {...reveal}>
            <div>
              <p className="landing-kicker">Then the rest comes back</p>
              <h2>Unused funds return. Recovery stays.</h2>
              <p>
                Partial use is allowed when you say so. Leftover ETH and the
                settlement asset return to you after expiry — including without
                Melt running.
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
        <div className="landing-wrap">
          <p className="landing-kicker">How money moves</p>
          <h2>Fund it from your wallet. Their agent never inherits it.</h2>
          <div className="flow-grid">
            {flow.map((item, i) => (
              <article key={item.title} className="panel flow-card">
                <span className="quiet">{String(i + 1).padStart(2, "0")}</span>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
          <p className="flow-note">
            Uniswap is the conversion rail, not a product tab: when a purchase
            qualifies, Melt swaps only the required ETH to USDC from the
            envelope vault. No approvals. Leftovers stay in the gift.
          </p>
        </div>
      </motion.section>

      <motion.section className="landing-block" {...reveal}>
        <div className="landing-wrap agents-grid">
          <div>
            <p className="landing-kicker">For your own agent</p>
            <h2>HTTP, a one-file client, or MCP.</h2>
            <p>
              Create and fund an envelope in Melt, then let Cursor or Claude
              redeem it. API keys cannot create envelopes, raise the amount, or
              send unrestricted cash. Signed webhooks notify you when a gift is
              used.
            </p>
            <a className="secondary" href={`${app}#developers`}>
              Connect an agent
              <ArrowUpRight size={16} />
            </a>
          </div>
          <pre className="panel agent-sample">{`const melt = new Melt({ apiKey });
const { sent } = await melt.envelopes();
const found = await melt.findOptions(sent[0].id, 'an eSIM');
const quote = await melt.proposePurchase(sent[0].id, { sku: found.options[0].sku });
await melt.redeem(sent[0].id, quote.quote.id);`}</pre>
        </div>
      </motion.section>

      <section className="landing-close">
        <div className="landing-wrap close-panel panel">
          <SessionSeal status="ready" />
          <div>
            <h2>Send a possibility instead of cash.</h2>
            <p>
              Describe the gift, choose how much it may become, and let their
              assistant choose later.
            </p>
            <a className="primary" href={app}>
              Open Melt
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
            <a href={`${app}#developers`}>API</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
