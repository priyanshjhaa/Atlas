import Link from "next/link";
import {
  ArrowRight,
  Check,
  CircleDot,
  Code2,
  GitPullRequest,
  Menu,
  Network,
  Search,
  Sparkles,
} from "lucide-react";
import { AtlasMark, ConfidenceBadge } from "../components/brand";
import { AtlasGraph } from "../components/atlas-graph";

export const metadata = {
  title: "Atlas — Engineering intelligence for every change",
  description: "Understand what changes before you change it. Atlas maps code, architecture, history, and decisions across your engineering system.",
};

export default function Home() {
  return (
    <main className="marketing">
      <nav className="floating-nav" aria-label="Primary navigation">
        <AtlasMark />
        <div className="nav-links">
          <a href="#product">Product</a>
          <a href="#intelligence">Intelligence</a>
          <a href="#evidence">Evidence</a>
        </div>
        <Link href="/app" className="button button--small button--ghost">
          Open workspace <ArrowRight size={15} />
        </Link>
        <button className="menu-button" aria-label="Open navigation"><Menu size={19} /></button>
      </nav>

      <section className="hero">
        <div className="hero-grid" aria-hidden="true" />
        <div className="hero-orbit hero-orbit--one" aria-hidden="true" />
        <div className="hero-orbit hero-orbit--two" aria-hidden="true" />
        <div className="hero-copy reveal">
          <p className="eyebrow"><Sparkles size={14} /> Engineering intelligence, connected</p>
          <h1>Understand what changes<br />before you change it.</h1>
          <p className="hero-deck">Atlas maps the code, architecture, history, and decisions behind your systems—so every change begins with the full picture.</p>
          <div className="hero-actions">
            <Link href="/app/impact/new" className="button button--primary">Analyze a change <ArrowRight size={17} /></Link>
            <a href="#story" className="button button--glass">See how it works</a>
          </div>
        </div>

        <div className="hero-console" aria-label="Example impact analysis">
          <div className="window-bar"><span /><span /><span /><em>impact-analysis.atlas</em></div>
          <div className="console-query">
            <span>Proposed change</span>
            <strong>Replace persistent session tokens with rotating refresh tokens.</strong>
          </div>
          <div className="console-progress">
            <i /><span>Tracing 31 relationships across 5 repositories</span><b>96%</b>
          </div>
          <div className="console-results">
            <div><CircleDot size={14} /><span><b>7</b> affected components</span></div>
            <div><GitPullRequest size={14} /><span><b>4</b> relevant pull requests</span></div>
            <div><Network size={14} /><span><b>2</b> cross-repo paths</span></div>
          </div>
        </div>
        <a href="#story" className="scroll-cue">Explore the system <span>↓</span></a>
      </section>

      <section className="statement" id="story">
        <p className="section-number">01 — THE PROBLEM</p>
        <h2>Your codebase is documented everywhere.<br /><span>Understood nowhere.</span></h2>
        <div className="statement-grid">
          <p>Repository chat can find a file. It cannot tell you why the file exists, which team depends on it, or what happened the last time it changed.</p>
          <p>Atlas continuously turns repositories, pull requests, and technical decisions into one living model of how your engineering system actually works.</p>
        </div>
      </section>

      <section className="product-story" id="product">
        <div className="story-copy">
          <p className="section-number">02 — REPOSITORY INTELLIGENCE</p>
          <h2>From files and folders<br />to systems and flows.</h2>
          <p>Atlas includes a CodeMap-derived intelligence engine that parses TypeScript, resolves symbols and dependencies, and reconstructs architecture across repositories.</p>
          <ul className="feature-list">
            <li><Check size={15} /> Cross-repository dependency mapping</li>
            <li><Check size={15} /> Symbol-level evidence and citations</li>
            <li><Check size={15} /> Architecture that stays current</li>
          </ul>
          <Link href="/app/graph" className="text-link">Explore the engineering graph <ArrowRight size={15} /></Link>
        </div>
        <div className="story-visual graph-window">
          <div className="window-title"><span>Northstar Labs</span><small>Live architecture · updated 4m ago</small></div>
          <AtlasGraph compact />
        </div>
      </section>

      <section className="impact-section" id="intelligence">
        <div className="impact-heading">
          <p className="section-number">03 — CHANGE INTELLIGENCE</p>
          <h2>Think through the blast radius<br />before the first line changes.</h2>
        </div>
        <div className="impact-demo">
          <div className="impact-rail">
            <span className="active">Change</span><span>Direct impact</span><span>Downstream</span><span>Evidence</span>
          </div>
          <div className="impact-content">
            <div className="impact-question">
              <p>What happens if we change the refresh-token response?</p>
              <span>identity-service · main <Search size={14} /></span>
            </div>
            <div className="impact-summary">
              <div className="risk-orb">HIGH<br /><small>RISK</small></div>
              <div><span>Executive summary</span><h3>This contract crosses three repository boundaries.</h3><p>The gateway validator and storefront edge middleware require coordinated updates. One external mobile consumer cannot be verified.</p></div>
            </div>
            <div className="impact-items">
              <article><Code2 size={17} /><div><b>SessionController.refresh()</b><p>Response contract changes at lines 84–112</p></div><ConfidenceBadge type="observed" /></article>
              <article><Network size={17} /><div><b>storefront-web / edge middleware</b><p>Reads the existing sessionToken field</p></div><ConfidenceBadge type="observed" /></article>
              <article><CircleDot size={17} /><div><b>Mobile authentication clients</b><p>Mentioned in ADR-024; repository unavailable</p></div><ConfidenceBadge type="inferred" /></article>
            </div>
          </div>
        </div>
      </section>

      <section className="evidence-section" id="evidence">
        <div>
          <p className="section-number">04 — TRUST BY DESIGN</p>
          <h2>Every answer carries<br />its evidence.</h2>
          <p>Observed facts, historical patterns, and inferred relationships never look the same. Atlas shows exactly where an answer came from—and where the system is uncertain.</p>
        </div>
        <div className="evidence-stack">
          <article className="evidence-card"><span>CODE · OBSERVED</span><b>SessionController.refresh</b><p>identity-service/src/session/session.controller.ts</p><code>return this.sessions.rotate(refreshTokenId);</code></article>
          <article className="evidence-card evidence-card--offset"><span>GITHUB · HISTORICAL</span><b>PR #401 — Rotate compromised sessions</b><p>8 files · reviewed by Maya Chen</p></article>
          <article className="evidence-card evidence-card--last"><span>NOTION · DECISION</span><b>ADR-024 — Token rotation</b><p>Updated 6 weeks ago</p></article>
        </div>
      </section>

      <section className="closing-cta">
        <span className="cta-glow" aria-hidden="true" />
        <AtlasMark />
        <h2>Your engineering system<br />already knows the answer.</h2>
        <p>Atlas connects the evidence so your team can act on it.</p>
        <Link href="/app" className="button button--primary">Enter the demo workspace <ArrowRight size={17} /></Link>
      </section>

      <footer><AtlasMark /><p>Engineering intelligence for every change.</p><span>© 2026 Atlas</span></footer>
    </main>
  );
}
