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
    title: "Write the job",
    text: "Use a site you do not want your main wallet on, pay an invoice, mint, or type your own instructions.",
  },
  {
    n: "02",
    title: "Set a spending limit",
    text: "Choose how much the task wallet may spend, how long it stays open, and which wallet leftover funds return to.",
  },
  {
    n: "03",
    title: "Let it work",
    text: "Melt opens an isolated browser and a wallet that is not yours. The agent, or you by hand, completes the job inside that limit.",
  },
  {
    n: "04",
    title: "End the session",
    text: "Spending access closes onchain. Unused funds and supported assets return. Recovery stays available if something arrives later.",
  },
];
const uses = [
  {
    title: "An agent is about to click Connect",
    text: "ChatGPT, Claude, and Cursor already have a browser. They should not get your wallet. Melt opens the site with a disposable task wallet and a hard spending limit.",
  },
  {
    title: "You are handing work to another agent",
    text: "You create and fund the session. Your coding agent can operate the browser. It cannot raise the limit, change the return wallet, or keep leftover funds.",
  },
  {
    title: "You want to try a site once",
    text: "Connect a numbered allowance instead of your main wallet. When the session ends, spending dies onchain and leftovers return.",
  },
];
const flow = [
  { title: "Sign in", text: "Email or a wallet, through Privy." },
  { title: "Owner wallet", text: "An embedded wallet you control." },
  { title: "Fund the session", text: "Send only the limit you set." },
  {
    title: "Task wallet spends",
    text: "The site never sees your main wallet.",
  },
  { title: "Funds return", text: "Leftovers and bought items come back." },
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
    if (["sessions", "receipts", "developers"].includes(hash)) {
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
            <h1 className="hero-title">
              Let an agent spend without your wallet.
            </h1>
            <p className="hero-lead">
              ChatGPT and Claude already have a browser. They should not get
              your wallet. Melt opens a separate wallet with a spending limit.
              When you end the session, spending stops and leftovers return.
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
              <span>Spending limit</span>
              <strong>
                0.0003 <small>ETH</small>
              </strong>
              <BudgetRibbon value={0.00009} total={0.0003} large />
              <p>Used only for this session. Leftover funds return to you.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-facts">
        <div className="landing-wrap fact-row">
          <p>Spending limits enforced onchain</p>
          <p>Isolated browser for the job</p>
          <p>Leftover funds return</p>
          <p>Recovery after the session ends</p>
        </div>
      </section>

      <motion.section id="when" className="landing-block" {...reveal}>
        <div className="landing-wrap">
          <p className="landing-kicker">When this is the right tool</p>
          <h2>When your main wallet should stay disconnected.</h2>
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
          <p className="landing-kicker">How a session works</p>
          <h2>You set the limit. Then you can close it.</h2>
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
              <p className="landing-kicker">Any job you can describe</p>
              <h2>Start from the job, not a contract function.</h2>
              <p>
                Use a site you do not want your main wallet on, pay an invoice,
                mint, or type your own instructions. Website and contract locks
                are optional if you want to narrow where it can spend.
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
              <p className="landing-kicker">Separate from you</p>
              <h2>The site never sees your main wallet.</h2>
              <p>
                Sign in with email or a wallet. You fund a session from an owner
                wallet you control. The agent spends from a separate task
                wallet, and that spending stops when you end the session.
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
              <p className="landing-kicker">Then it comes back</p>
              <h2>Close spending. Keep recovery.</h2>
              <p>
                Unused ETH and supported tokens or collectibles return to the
                wallet you named. If something arrives late, you can still
                recover it — including without Melt running.
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
          <h2>Fund it from your wallet. The agent never inherits it.</h2>
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
            Swap tokens to fund a session in your own wallet with Uniswap. That
            conversion never enters the agent browser.
          </p>
        </div>
      </motion.section>

      <motion.section className="landing-block" {...reveal}>
        <div className="landing-wrap agents-grid">
          <div>
            <p className="landing-kicker">For your own agent</p>
            <h2>HTTP, a one-file client, or MCP.</h2>
            <p>
              Create and fund a session in Melt, then let Cursor or Claude
              operate it. API keys cannot create wallets or raise spending
              limits.
            </p>
            <a className="secondary" href={`${app}#developers`}>
              Connect an agent
              <ArrowUpRight size={16} />
            </a>
          </div>
          <pre className="panel agent-sample">{`const melt = new Melt({ apiKey });
await melt.start(sessionId, { manual: true });
const page = await melt.observe(sessionId);`}</pre>
        </div>
      </motion.section>

      <section className="landing-close">
        <div className="landing-wrap close-panel panel">
          <SessionSeal status="ready" />
          <div>
            <h2>Set a spending limit and start.</h2>
            <p>
              Describe the job, choose how much it may spend, and open a
              session. The site never sees your main wallet.
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
          <span>Melt · Agent spending you still control</span>
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
