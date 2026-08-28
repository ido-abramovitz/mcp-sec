const intelligence = [
  { name: "Filesystem MCP", version: "2026.8.1", status: "Verified", risk: "Low", signal: "14 tools · local", tone: "safe" },
  { name: "GitHub MCP Server", version: "0.18.0", status: "Review", risk: "Elevated", signal: "write access · remote", tone: "warn" },
  { name: "Chrome DevTools MCP", version: "1.7.0", status: "Verified", risk: "Medium", signal: "browser control · local", tone: "safe" },
];

export default function Home() {
  return (
    <main>
      <nav className="nav shell">
        <a className="brand" href="/"><span className="brand-mark">M</span><span>mcpSecurity<span className="dim">.cloud</span></span></a>
        <div className="nav-links"><a href="/enterprise">Enterprise</a><a href="/assessments">Assessments</a><a href="https://catalog.mcpsecurity.cloud/blog">Research</a><a href="https://catalog.mcpsecurity.cloud">Catalog</a></div>
        <a className="button small" href="/assessments#contact" data-analytics-event="assessment_cta_click" data-analytics-label="Home navigation">Request an assessment <span>↗</span></a>
      </nav>

      <section className="hero shell">
        <div className="eyebrow"><span className="pulse" /> MCP ecosystem intelligence · continuously updated</div>
        <h1>Find the MCP risk your company <span>cannot see.</span></h1>
        <p className="hero-copy">We discover MCP exposure, test exact versions for exploitable behavior, and turn the evidence into decisions your security team can act on.</p>
        <div className="hero-actions">
          <a className="button" href="/assessments" data-analytics-event="assessment_cta_click" data-analytics-label="Home hero">Assess your MCPs <span>→</span></a>
          <a className="button ghost" href="/enterprise" data-analytics-event="enterprise_cta_click" data-analytics-label="Home hero">Enterprise monitoring</a>
        </div>
        <div className="proofline"><span>71,584</span> servers tracked <i /> <span>6,000</span> deeply enriched <i /> <span>2,286</span> versions indexed <i /> <span>2,308</span> endpoints observed</div>
      </section>

      <section className="offer-section shell">
        <div className="offer-intro"><div><div className="section-index">TWO WAYS TO WORK WITH US</div><h2>Start with an assessment.<br/>Continue with monitoring.</h2></div><p>Get a decision-ready picture of today’s exposure, then keep it current as MCP servers, tools, dependencies, and versions change.</p></div>
        <div className="offer-grid">
          <article className="offer-card featured"><div className="offer-label">MCP ASSESSMENTS</div><h3>Know what is risky before it reaches production.</h3><p>A focused engagement for one MCP server, a product portfolio, or your full MCP fleet.</p><ul><li>Runtime testing with reproducible evidence</li><li>Tools, resources, prompts, and trust-boundary review</li><li>Supply-chain and configuration analysis</li><li>Prioritized remediation report and retest</li></ul><a className="button" href="/assessments" data-analytics-event="assessment_cta_click" data-analytics-label="Home services">View assessment service →</a></article>
          <article className="offer-card"><div className="offer-label">ENTERPRISE MONITORING</div><h3>Know when your MCP risk changes.</h3><p>Continuous intelligence for every MCP implementation and exact version relevant to your organization.</p><ul><li>Organization-specific MCP inventory</li><li>Exact-version vulnerability monitoring</li><li>Capability and publisher change alerts</li><li>Historical evidence and decision support</li></ul><a className="button ghost" href="/enterprise" data-analytics-event="enterprise_cta_click" data-analytics-label="Home services">Explore enterprise →</a></article>
        </div>
      </section>

      <section className="intelligence-window shell">
        <div className="window-top"><div><span className="window-dot red"/><span className="window-dot amber"/><span className="window-dot green"/></div><span>LIVE INTELLIGENCE FEED</span><span className="live">● LIVE</span></div>
        <div className="window-grid">
          <div className="feed-main">
            <div className="feed-head"><span>MCP IMPLEMENTATION</span><span>VERSION</span><span>VERIFICATION</span><span>RISK</span></div>
            {intelligence.map((item) => <div className="feed-row" key={item.name}>
              <div><strong>{item.name}</strong><small>{item.signal}</small></div><code>{item.version}</code><span className={`tag ${item.tone}`}>● {item.status}</span><span className={`risk ${item.tone}`}>{item.risk}</span>
            </div>)}
            <div className="scan-event"><span className="scan-beam"/><span>New version detected</span><strong>context7@0.5.8</strong><small>Dependency diff queued · 12s ago</small></div>
          </div>
          <aside className="evidence-panel"><div className="panel-label">INDEPENDENT EVIDENCE</div><div className="score-ring"><strong>87</strong><span>/ 100</span></div><h3>Filesystem MCP</h3><p>Strong verification confidence</p><ul><li><span>✓</span> Package provenance</li><li><span>✓</span> Executable entrypoint</li><li><span>✓</span> stdio transport</li><li><span>✓</span> Version integrity</li></ul><a href="/mcp/filesystem-mcp">View full profile →</a></aside>
        </div>
      </section>

      <section className="split shell">
        <div><div className="section-index">01 / THE INTELLIGENCE LAYER</div><h2>A living security record.<br/>Not another directory.</h2></div>
        <div className="split-copy"><p>Directories tell you an MCP exists. We tell you what it is, how it runs, what changed, and which versions deserve your trust.</p><div className="feature-grid">
          <article><span>⌁</span><h3>Version intelligence</h3><p>Immutable release history, dependency drift, fixes, regressions, and exact affected ranges.</p></article>
          <article><span>◎</span><h3>Independent verification</h3><p>Repository, package, transport, endpoint, and capability claims checked against evidence.</p></article>
          <article><span>△</span><h3>Security posture</h3><p>Supply-chain signals, dangerous capabilities, authentication, maintenance, and blast radius.</p></article>
          <article><span>↗</span><h3>Operational health</h3><p>Remote endpoint observations, version fingerprints, latency, transport, and change history.</p></article>
        </div></div>
      </section>

      <section className="scanner-band">
        <div className="shell scanner-grid"><div><div className="section-index green-text">02 / THE SCANNER</div><h2>Know what your agents are using. Before they use it.</h2><p>Run the same intelligence against your actual MCP configuration—from the CLI, Claude Code, or CI.</p><div className="codebox"><div><span>$</span> npx mcp-sec scan</div><p>✓ 8 MCP servers discovered</p><p>✓ 5 verified safe under this scan profile</p><p className="amber-text">! 2 need review</p><p className="red-text">✕ 1 known vulnerable version</p></div><div className="hero-actions"><a className="button light" href="#install">Install the CLI <span>→</span></a><a className="text-link" href="/scanner">See how it works</a></div></div>
          <div className="scanner-result"><div className="result-top"><span>SCAN RESULT</span><span>8 / 8 complete</span></div><div className="result-title"><div className="alert-icon">!</div><div><h3>filesystem-mcp <code>1.2.1</code></h3><p>Known affected version detected</p></div></div><div className="finding"><span>HIGH</span><strong>Path traversal</strong><p>Affects versions <code>&gt;=1.0.0 &lt;1.2.4</code></p></div><div className="upgrade"><span>RECOMMENDED</span><p>Upgrade to <strong>1.2.4</strong> or later</p><small>Fix independently reproduced · confidence 96%</small></div><div className="result-foot"><span>Evidence-based result</span><span>No tested issue ≠ guaranteed safe</span></div></div>
        </div>
      </section>

      <section className="cta shell"><div className="eyebrow">THE MCP SECURITY RECORD</div><h2>Trust your agents.<br/><span>Know their tools.</span></h2><p>Explore independently verified intelligence or scan the MCP servers already in your stack.</p><div className="hero-actions"><a className="button" href="/catalog" data-analytics-event="catalog_cta_click" data-analytics-label="Home final CTA">Explore the catalog →</a><a className="button ghost" href="/scanner" data-analytics-event="scanner_cta_click" data-analytics-label="Home final CTA">Scan your MCPs</a></div></section>
      <footer className="footer shell"><a className="brand" href="/"><span className="brand-mark">M</span>mcpSecurity.cloud</a><p>Independent MCP security intelligence and assessments.</p><div><a href="/enterprise">Enterprise</a><a href="/assessments">Assessments</a><a href="https://catalog.mcpsecurity.cloud/blog">Research</a><a href="https://catalog.mcpsecurity.cloud">Catalog</a></div></footer>
    </main>
  );
}
