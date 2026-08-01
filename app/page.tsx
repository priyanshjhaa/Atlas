import Link from "next/link";
import {
  ArrowRight,
  Check,
  CircleDot,
  Code2,
  Database,
  GitPullRequest,
  Network,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { AtlasMark, ConfidenceBadge } from "../components/brand";
import { MarketingGraph } from "../components/marketing-graph";
import { MarketingNav } from "../components/marketing/marketing-nav";

export const metadata = {
  title: "Atlas — Engineering intelligence for every change",
  description: "Atlas connects GitHub code and change history with Notion decisions to map dependencies and explain the impact of every proposed change.",
};

const capabilities = [
  { icon: GitPullRequest, index: "01", label: "GitHub", title: "Code and change history", detail: "Repositories, commits, pull requests, and reviews" },
  { icon: Database, index: "02", label: "Notion", title: "Decisions and documentation", detail: "Selected pages, data sources, specifications, and ADRs" },
  { icon: Network, index: "03", label: "Map", title: "Connected engineering graph", detail: "Files, symbols, dependencies, and cross-repository paths" },
  { icon: ShieldCheck, index: "04", label: "Explain", title: "Evidence-backed impact", detail: "Risk level, affected components, unknowns, and next actions" },
];

export default function Home() {
  return (
    <main className="marketing">
      <MarketingNav />

      <section className="hero">
        <div className="hero-grid" aria-hidden="true" />
        <div className="hero-orbit hero-orbit--one" aria-hidden="true" />
        <div className="hero-orbit hero-orbit--two" aria-hidden="true" />
        <div className="hero-copy reveal">
          <div className="hero-system-bar">
            <span>CODE, CHANGE HISTORY, AND TEAM CONTEXT — ONE MAP</span>
            <span><i /> GITHUB + NOTION SYNCHRONIZED</span>
          </div>
          <p className="eyebrow"><Sparkles size={14} /> Engineering context, connected</p>
          <h1>Know what a change touches<br /><span>before your team ships it.</span></h1>
          <p className="hero-deck">Atlas connects GitHub repositories, commits, pull requests, and reviews with the decisions and documentation your team keeps in Notion. It maps how the system fits together, then explains the impact of a proposed change with evidence you can verify.</p>
          <div className="hero-actions">
            <Link href="/app/impact/new" className="button button--primary">Run an impact analysis <ArrowRight size={17} /></Link>
            <a href="#story" className="button button--glass">See how it works</a>
          </div>
          <div className="hero-readouts">
            <span><b>GITHUB</b> Code, commits, pull requests, reviews</span>
            <span><b>NOTION</b> Specs, ADRs, documentation, decisions</span>
            <span><b>IMPACT</b> Dependencies, risk, evidence, next steps</span>
          </div>
        </div>

        <div className="hero-console" aria-label="Example impact analysis">
          <div className="window-bar"><span /><span /><span /><em>impact-analysis.atlas</em></div>
          <div className="console-query">
            <span>Proposed change</span>
            <strong>Replace persistent session tokens with rotating refresh tokens.</strong>
          </div>
          <div className="console-progress">
            <i /><span>Tracing code, GitHub history, and Notion decisions</span><b>96%</b>
          </div>
          <div className="console-results">
            <div><CircleDot size={14} /><span><b>7</b> affected components</span></div>
            <div><GitPullRequest size={14} /><span><b>4</b> relevant pull requests</span></div>
            <div><Network size={14} /><span><b>2</b> cross-repo paths</span></div>
          </div>
        </div>

        <section className="intelligence-marquee" aria-label="Atlas capabilities">
          <div className="intelligence-marquee__track">
            {[0, 1].map((group) => (
              <div className="intelligence-marquee__group" aria-hidden={group === 1 ? true : undefined} key={group}>
                {capabilities.map(({ icon: Icon, index, label, title, detail }) => (
                  <article className="intelligence-marquee__item" key={`${group}-${index}`}>
                    <span className="intelligence-marquee__icon"><Icon size={16} /></span>
                    <span className="intelligence-marquee__index">{index} / {label}</span>
                    <b>{title}</b>
                    <i aria-hidden="true" />
                    <small>{detail}</small>
                  </article>
                ))}
              </div>
            ))}
          </div>
        </section>
      </section>

      <section className="statement" id="story">
        <p className="section-number">01 — WHY ATLAS</p>
        <h2>The answer is split between your code<br /><span>and the decisions around it.</span></h2>
        <div className="statement-grid">
          <p>GitHub shows what changed and who reviewed it. Notion preserves specifications, architecture decisions, and operational knowledge. Neither source alone shows the complete blast radius of the next change.</p>
          <p>Atlas synchronizes the sources you approve, connects code to history and documentation, and builds a living model your team can search, explore, and use for source-backed impact analysis.</p>
        </div>
      </section>

      <section className="product-story" id="product">
        <div className="story-copy">
          <p className="section-number">02 — CONNECTED SOURCES</p>
          <h2>GitHub shows what changed.<br />Notion explains why.</h2>
          <p>Atlas indexes selected GitHub repositories and bounded change history, resolves symbols and dependencies across the codebase, and connects that structure to the Notion pages and data sources your workspace chooses to share.</p>
          <ul className="feature-list">
            <li><Check size={15} /> GitHub code, commits, pull requests, authors, and reviews</li>
            <li><Check size={15} /> Notion specifications, ADRs, documentation, and data sources</li>
            <li><Check size={15} /> Incremental synchronization with source-level citations</li>
          </ul>
          <Link href="/app/sources" className="text-link">Explore connected sources <ArrowRight size={15} /></Link>
        </div>
        <div className="story-visual graph-window">
          <div className="window-title"><span>GitHub + Notion context graph</span><small><i /> Sources synchronized</small></div>
          <MarketingGraph />
        </div>
      </section>

      <section className="impact-section" id="intelligence">
        <div className="impact-heading">
          <p className="section-number">03 — CHANGE INTELLIGENCE</p>
          <h2>Ask what a change affects.<br />Get a report grounded in your sources.</h2>
          <p className="impact-heading__copy">Analyze a proposed change or GitHub pull request. Atlas traces the relevant code paths, brings in related commits and reviews, checks connected Notion decisions, and separates observed evidence from historical patterns and unknowns.</p>
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
          <p>Every finding links back to synchronized code, GitHub history, or Notion context. Atlas keeps observed facts, historical patterns, and inferred relationships distinct—and calls out the areas your connected sources cannot verify.</p>
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
        <h2>Bring GitHub and Notion<br />into one engineering map.</h2>
        <p>Connect the sources your team already uses, then understand the impact before you ship.</p>
        <Link href="/app" className="button button--primary">Open the workspace <ArrowRight size={17} /></Link>
      </section>

      <footer><AtlasMark /><p>GitHub code and Notion context, connected for every change.</p><span>© 2026 Atlas</span></footer>
    </main>
  );
}
