import { useEffect, useState, type CSSProperties } from "react";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { MeltWordmark } from "./components/MeltMotion";
import { SessionSeal } from "./SessionSeal";
import { NetworkStrip } from "./NetworkStrip";
import { BreakagePour } from "./components/BreakagePour";
import { PoweredByUniswap } from "./components/PoweredByUniswap";
import {
  networkKind,
  SEPOLIA_FAUCET,
} from "../../../packages/shared/src/index";
import "./landing.css";

const app = "/app";
const examples = [
  {
    kind: "Food",
    usd: "$50",
    quote: "Food delivery, up to $50.",
    ok: "Uber Eats, DoorDash, or another food card",
    no: "Not cash. Not Steam.",
    tilt: "-1.4deg",
  },
  {
    kind: "eSIM",
    usd: "$20",
    quote: "Mobile data for your Japan trip.",
    ok: "A travel eSIM they can actually use",
    no: "Not headphones. Not spending money.",
    tilt: "0.9deg",
  },
  {
    kind: "Steam",
    usd: "$40",
    quote: "Steam games, up to $40.",
    ok: "A Steam card that fits the cap",
    no: "Not cash. Not food delivery.",
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
    title: "They pick a card",
    text: "In Melt, or in an assistant they already use. Melt shows cards that match the purpose.",
  },
  {
    n: "04",
    title: "Only a match pays",
    text: "Uniswap converts just enough ETH to USDC. Cryptorefills emails the card. The rest stays, then returns.",
  },
];
const story = [
  {
    who: "You",
    when: "Today",
    text: "Food delivery, up to $50. Unused funds return to me.",
  },
  {
    who: "Alex",
    when: "A Friday in December",
    text: "Use the food gift Sarah sent me. Find Uber Eats.",
  },
  {
    who: "Melt",
    when: "Same night",
    text: "Uber Eats $25 matches. Uniswap converts that amount. The rest stays in the envelope.",
  },
];

export default function Landing() {
  const reduced = useReducedMotion();
  const [scrolled, setScrolled] = useState(false);
  const [flipped, setFlipped] = useState<string>();
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
            <p className="landing-kicker">
              Purpose-bound money for people and agents
            </p>
            <h1 className="hero-title">
              Send money that knows what it is for.
            </h1>
            <p className="hero-lead">
              Lock a purpose and an amount. They spend it later on Uber Eats,
              Steam, or an eSIM, in Melt or in ChatGPT. Unused funds return to
              you. Or give the same wallet to a browser agent for one job.
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
                  This hosted Melt is Sepolia. Uniswap settlement is live here.
                  Cryptorefills cannot email a live card from testnet funds.
                </p>
              ) : null}
              <PoweredByUniswap />
            </div>
          </div>
          <div className="hero-stage panel">
            <BreakagePour />
            <div className="hero-stage-copy">
              <span>Food delivery, up to $50</span>
              <p>
                Drag the spend. A food card uses what it costs. Unused funds
                return to the sender. A store card keeps them.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-facts">
        <div className="landing-wrap fact-row">
          <p>Food delivery, up to $50</p>
          <p>Steam, up to $40</p>
          <p>An eSIM for Japan</p>
          <p>Unused funds return</p>
        </div>
      </section>

      <motion.section id="examples" className="landing-block" {...reveal}>
        <div className="landing-wrap">
          <p className="landing-kicker">What people actually send</p>
          <h2>Write it in English. They pick the card.</h2>
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
              assistant can find options, propose a card, and redeem, e.g.
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
const found = await melt.findOptions(received[0].id, 'Uber Eats');
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
              <p>“Food delivery, up to $50.”</p>
              <dl>
                <div>
                  <dt>Budget</dt>
                  <dd>$50</dd>
                </div>
                <div>
                  <dt>Deadline</dt>
                  <dd>30 days</dd>
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
            <h2>Send food money tonight. They pick the card later.</h2>
            <p>
              Create an envelope in a minute. Unused funds return to the sender.
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
          <span>Melt · Purpose-bound gift cards</span>
          <PoweredByUniswap compact />
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
