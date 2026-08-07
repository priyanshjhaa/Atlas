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
  title: "Atlas — A living map of your engineering system",
  description: "Atlas turns GitHub code and history plus Notion decisions into a searchable engineering graph for architecture exploration and evidence-backed change analysis.",
};

const capabilities = [
  { icon: GitPullRequest, index: "01", label: "Sync", title: "GitHub intelligence", detail: "Code, bounded history, pull requests, reviews, and revisions" },
  { icon: Database, index: "02", label: "Context", title: "Notion knowledge", detail: "Selected specifications, ADRs, runbooks, pages, and data sources" },
  { icon: Network, index: "03", label: "Map", title: "Living system graph", detail: "Packages, files, symbols, APIs, dependencies, and architecture" },
  { icon: ShieldCheck, index: "04", label: "Analyze", title: "Verifiable change impact", detail: "Risk, affected paths, evidence, unknowns, and verification steps" },
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
            <span>CODE, HISTORY, DOCUMENTATION, AND ARCHITECTURE — ONE MAP</span>
            <span><i /> SOURCE-BACKED ENGINEERING INTELLIGENCE</span>
          </div>
          <p className="eyebrow"><Sparkles size={14} /> From synchronized sources to verifiable impact</p>
          <h1>See your whole system.<br /><span>Understand every change.</span></h1>
          <p className="hero-deck">Atlas turns selected GitHub repositories and Notion knowledge into a living engineering graph of packages, files, symbols, APIs, dependencies, history, and decisions. Explore architecture, search indexed context, or analyze a planned change or pull request to uncover risk, affected paths, evidence, unknowns, and the steps needed to ship safely.</p>
          <div className="hero-actions">
            <Link href="/app/impact/new" className="button button--primary">Run an impact analysis <ArrowRight size={17} /></Link>
            <a href="#story" className="button button--glass">See how it works</a>
          </div>
          <div className="hero-readouts">
            <span><b>INGEST</b> GitHub code and history + selected Notion knowledge</span>
            <span><b>MODEL</b> Architecture, symbols, APIs, and cross-repository paths</span>
            <span><b>ANALYZE</b> Planned changes and pull requests with cited evidence</span>
          </div>
        </div>

        <div className="hero-console" aria-label="Illustrative impact analysis">
          <div className="window-bar"><span /><span /><span /><em>impact-analysis.atlas</em></div>
          <div className="console-query">
            <span>Illustrative proposed change</span>
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
        <h2>Your system is more than source code.<br /><span>Its history and decisions matter too.</span></h2>
        <figure
          className="purpose-map"
          aria-label="Atlas brings code, history, context, and change impact together as system understanding."
        >
          <span className="purpose-map__circle purpose-map__circle--code"><b>Code</b><small>what exists</small></span>
          <span className="purpose-map__circle purpose-map__circle--history"><b>History</b><small>how it evolved</small></span>
          <span className="purpose-map__circle purpose-map__circle--context"><b>Context</b><small>why it exists</small></span>
          <span className="purpose-map__circle purpose-map__circle--impact"><b>Impact</b><small>what changes next</small></span>
          <figcaption className="purpose-map__center"><i>Atlas</i><strong>System<br />understanding</strong></figcaption>
        </figure>
        <div className="statement-grid">
          <p>Repository structure shows what exists; commits, pull requests, and reviews explain how it evolved; and specifications, ADRs, and runbooks preserve why important decisions were made. Atlas brings those perspectives together by synchronizing approved sources, resolving code relationships, preserving revision-level provenance, and connecting implementation evidence to engineering knowledge—giving teams one explorable map for understanding every change.</p>
        </div>
      </section>

      <section className="product-story" id="product">
        <div className="story-copy">
          <p className="section-number">02 — CONNECTED SOURCES</p>
          <h2>Synchronize the sources<br />that explain your system.</h2>
          <p>Atlas safely indexes selected GitHub repositories and bounded revision history, then connects packages, files, symbols, imports, public APIs, and cross-repository consumers to the Notion pages and data sources your workspace chooses to share.</p>
          <ul className="feature-list">
            <li><Check size={15} /> GitHub code, revisions, commits, pull requests, authors, and reviews</li>
            <li><Check size={15} /> Selected Notion specifications, ADRs, runbooks, pages, and data sources</li>
            <li><Check size={15} /> Incremental, retryable synchronization with source revision and citation metadata</li>
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
          <h2>Explore the system.<br />Then analyze the change.</h2>
          <p className="impact-heading__copy">Browse current and historical graph relationships, inspect architecture snapshots, and search indexed source with repository-scoped citations. For a planned change or GitHub pull request, Atlas resolves relevant entities, traverses direct and downstream paths across repositories, retrieves related history and Notion context, scores risk, and produces findings, evidence, limitations, recommendations, and a verification plan.</p>
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
          <h2>Evidence stays attached.<br />Uncertainty stays visible.</h2>
          <p>Every finding links to synchronized code, a source revision, GitHub history, or selected Notion context. Atlas distinguishes observed relationships, historical evidence, and inference; identifies unavailable consumers and runtime blind spots; and keeps generated explanations separate from the deterministic report they summarize.</p>
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
        <h2>Build a living map<br />your team can act on.</h2>
        <p>Connect approved GitHub and Notion sources, explore how the system fits together, and verify the impact of the next change before it ships.</p>
        <Link href="/app" className="button button--primary">Open the workspace <ArrowRight size={17} /></Link>
      </section>

      <footer><AtlasMark /><p>Source-backed architecture, search, and change intelligence for engineering teams.</p><span>© 2026 Atlas</span></footer>
    </main>
  );
}
