#!/usr/bin/env python3
"""Build the self-contained, customer-facing Box Solutions datasheet."""

from __future__ import annotations

import base64
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "html" / "04-customer-solution-datasheet.html"
BRAND_ASSETS = ROOT / "docs" / "design" / "brand-assets"


def asset_data_uri(filename: str, media_type: str) -> str:
    """Return a brand asset as an embedded data URI for offline delivery."""
    encoded = base64.b64encode((BRAND_ASSETS / filename).read_bytes()).decode("ascii")
    return f"data:{media_type};base64,{encoded}"


def icon(name: str) -> str:
    paths = {
        "fast": '<path d="m4 6 8 6-8 6V6Zm8 0 8 6-8 6V6Z"/>',
        "shield": '<path d="M12 3 5 6v5c0 4.4 2.8 7.8 7 10 4.2-2.2 7-5.6 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/>',
        "person": '<circle cx="12" cy="8" r="4"/><path d="M4.8 21c.7-4.2 3.1-6.3 7.2-6.3s6.5 2.1 7.2 6.3"/>',
        "request": '<path d="M6 3h9l3 3v15H6V3Z"/><path d="M14 3v4h4M9 12h6m-3-3v6"/>',
        "understand": '<circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 4 4"/>',
        "decide": '<circle cx="12" cy="12" r="9"/><path d="m8 12 2.6 2.6L16.5 9"/>',
        "improve": '<path d="M5 19V9m5 10V5m5 14v-7m5 7V3"/>',
        "document": '<path d="M6 3h9l3 3v15H6V3Z"/><path d="M14 3v4h4M9 11h6m-6 4h6"/>',
        "review": '<path d="M5 4h10v14H5V4Z"/><circle cx="16" cy="16" r="4"/><path d="m19 19 2 2"/>',
        "sign": '<path d="M4 18c4-1 6-4 8-8l2 2 5-5-2-2-5 5"/><path d="M4 21h16"/>',
        "calendar": '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4m8-4v4M4 10h16"/><circle cx="15.5" cy="15.5" r="2.5"/>',
        "handoff": '<circle cx="8" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M2.5 19c.5-3.7 2.4-5.5 5.5-5.5s5 1.8 5.5 5.5m0-4c.7-.8 1.8-1.2 3.2-1.2 2.6 0 4.2 1.7 4.8 5.2"/>',
        "bolt": '<path d="m13 2-8 12h7l-1 8 8-12h-7l1-8Z"/>',
        "repeat": '<path d="M20 7h-8a6 6 0 0 0-6 6v1"/><path d="m17 4 3 3-3 3M4 17h8a6 6 0 0 0 6-6v-1"/><path d="m7 20-3-3 3-3"/>',
    }
    return f'<svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>'


def build() -> Path:
    box_logo = asset_data_uri("box-logo-blue.svg", "image/svg+xml")
    salesforce_logo = asset_data_uri("salesforce-logo.jpeg", "image/jpeg")
    document = f'''<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="Customer-facing Box Solutions datasheet for guided, governed work.">
  <title>Box Solutions · Customer Datasheet</title>
  <style>
    :root {{
      color-scheme: light;
      --ink: #091f45;
      --muted: #52627a;
      --blue: #0061d5;
      --blue-soft: #edf5ff;
      --violet: #6936d3;
      --violet-soft: #f4efff;
      --teal: #008b91;
      --teal-soft: #eaf9f8;
      --gold: #e89a00;
      --gold-soft: #fff7e7;
      --line: #dce4ee;
      --shadow: 0 16px 42px rgba(18, 45, 81, .09);
      --radius: 20px;
    }}
    * {{ box-sizing: border-box; }}
    html {{ scroll-behavior: smooth; }}
    body {{ margin: 0; color: var(--ink); background: #fff; font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }}
    button {{ font: inherit; }}
    svg {{ width: 25px; height: 25px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }}
    .page {{ width: min(1120px, calc(100% - 40px)); margin: 0 auto; }}
    .brand {{ display: flex; align-items: center; gap: 18px; padding: 34px 0 20px; color: var(--ink); font-size: 1.1rem; font-weight: 760; letter-spacing: .18em; text-transform: uppercase; }}
    .brand-logo {{ display: block; width: 76px; height: 41px; object-fit: contain; }}
    h1, h2, h3 {{ font-family: ui-serif, Georgia, Cambria, "Times New Roman", serif; }}
    .hero {{ display: grid; grid-template-columns: minmax(0, .9fr) minmax(0, 1.3fr); gap: 58px; align-items: center; padding: 28px 0 46px; }}
    .hero > * {{ min-width: 0; }}
    h1 {{ max-width: 510px; margin: 0; font-size: clamp(3.45rem, 6vw, 5.8rem); line-height: .95; letter-spacing: -.055em; font-weight: 620; }}
    .rule {{ width: 64px; height: 4px; margin: 30px 0; background: var(--blue); border-radius: 8px; }}
    .lead {{ max-width: 530px; margin: 0; color: var(--muted); font-size: clamp(1.12rem, 2vw, 1.35rem); line-height: 1.55; }}
    .workspace {{ min-width: 0; overflow: hidden; border: 1px solid var(--line); border-radius: 16px; background: #fff; box-shadow: var(--shadow); }}
    .workspace-head {{ display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 20px 22px; border-bottom: 1px solid var(--line); }}
    .file-title {{ display: flex; align-items: center; gap: 12px; }}
    .doc-icon {{ width: 39px; height: 39px; display: grid; place-items: center; color: #fff; background: var(--violet); border-radius: 8px; }}
    .file-title strong, .file-title small {{ display: block; }}
    .file-title small {{ margin-top: 2px; color: var(--muted); font-size: .72rem; }}
    .status {{ padding: 5px 10px; color: #17673e; background: #e3f6ea; border-radius: 999px; font-size: .72rem; font-weight: 700; }}
    .workspace-body {{ display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr); }}
    .summary, .actions {{ min-width: 0; padding: 20px 22px; }}
    .summary {{ border-right: 1px solid var(--line); }}
    .workspace h3 {{ margin: 0 0 18px; font: 750 .9rem/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }}
    .facts {{ display: grid; grid-template-columns: 1fr 1fr; gap: 12px 18px; margin: 0; }}
    .facts div {{ min-width: 0; }} .facts dt {{ color: var(--muted); font-size: .7rem; }} .facts dd {{ margin: 2px 0 0; font-size: .82rem; font-weight: 620; }}
    .next {{ display: grid; gap: 9px; }}
    .next-row {{ display: grid; grid-template-columns: 38px 1fr auto; gap: 11px; align-items: center; padding: 11px; border: 1px solid var(--line); border-radius: 11px; box-shadow: 0 5px 12px rgba(25,55,95,.05); }}
    .next-row .mini {{ width: 34px; height: 34px; display: grid; place-items: center; border-radius: 50%; }}
    .next-row:nth-child(1) .mini {{ color: var(--violet); background: var(--violet-soft); }}
    .next-row:nth-child(2) .mini {{ color: var(--teal); background: var(--teal-soft); }}
    .next-row:nth-child(3) .mini {{ color: var(--gold); background: var(--gold-soft); }}
    .next-row strong, .next-row small {{ display: block; }} .next-row strong {{ font-size: .8rem; }} .next-row small {{ color: var(--muted); font-size: .68rem; }}
    .chevron {{ color: var(--muted); font-size: 1.25rem; }}
    .approval {{ display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 17px 22px; border-top: 1px solid var(--line); }}
    .reviewer {{ display: flex; align-items: center; gap: 10px; }}
    .avatar {{ width: 38px; height: 38px; display: grid; place-items: center; color: var(--ink); background: var(--blue-soft); border-radius: 50%; }}
    .reviewer strong, .reviewer small {{ display: block; }} .reviewer strong {{ font-size: .8rem; }} .reviewer small {{ color: var(--muted); font-size: .68rem; }}
    .buttons {{ display: flex; gap: 8px; }}
    .buttons button {{ padding: 9px 13px; border-radius: 7px; border: 1px solid var(--blue); cursor: pointer; transition: transform .15s ease; }}
    .buttons button:hover {{ transform: translateY(-1px); }}
    .secondary {{ color: var(--blue); background: #fff; }} .primary {{ color: #fff; background: var(--blue); }}
    .outcomes {{ display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 22px; padding: 24px 0 50px; }}
    .outcome {{ min-height: 235px; padding: 28px; border-radius: var(--radius); }}
    .outcome:nth-child(1) {{ background: var(--blue-soft); }} .outcome:nth-child(2) {{ background: var(--violet-soft); }} .outcome:nth-child(3) {{ background: var(--teal-soft); }}
    .round-icon {{ width: 58px; height: 58px; display: grid; place-items: center; color: #fff; border-radius: 50%; }}
    .outcome:nth-child(1) .round-icon {{ background: var(--blue); }} .outcome:nth-child(2) .round-icon {{ background: var(--violet); }} .outcome:nth-child(3) .round-icon {{ background: var(--teal); }}
    .outcome h2 {{ margin: 28px 0 8px; font-size: 2rem; line-height: 1; letter-spacing: -.035em; }}
    .outcome p {{ max-width: 250px; margin: 0; color: #233d67; font-size: 1.05rem; }}
    .journey {{ display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 26px; padding: 28px 30px 60px; }}
    .journey-step {{ position: relative; text-align: center; }}
    .journey-step:not(:last-child)::after {{ content: ""; position: absolute; top: 30px; right: -30px; width: 34px; border-top: 2px solid var(--line); }}
    .journey-step .step-icon {{ width: 62px; height: 62px; margin: 0 auto 17px; display: grid; place-items: center; border-radius: 50%; }}
    .journey-step:nth-child(1) {{ color: var(--blue); }} .journey-step:nth-child(1) .step-icon {{ background: var(--blue-soft); }}
    .journey-step:nth-child(2) {{ color: var(--violet); }} .journey-step:nth-child(2) .step-icon {{ background: var(--violet-soft); }}
    .journey-step:nth-child(3) {{ color: var(--teal); }} .journey-step:nth-child(3) .step-icon {{ background: var(--teal-soft); }}
    .journey-step:nth-child(4) {{ color: var(--gold); }} .journey-step:nth-child(4) .step-icon {{ background: var(--gold-soft); }}
    .journey-step strong {{ display: block; font-size: 1.08rem; }} .journey-step p {{ max-width: 190px; margin: 7px auto 0; color: var(--muted); font-size: .88rem; }}
    .systems {{ padding: 48px 0 56px; border-top: 1px solid var(--line); text-align: center; }}
    .section-title {{ margin: 0; font-size: clamp(2.2rem, 4vw, 3.6rem); line-height: 1; letter-spacing: -.045em; }}
    .section-lead {{ margin: 14px auto 28px; color: var(--muted); }}
    .system-grid {{ display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 26px; }}
    .system {{ position: relative; padding: 28px; border: 1px solid var(--line); border-radius: 14px; box-shadow: 0 8px 24px rgba(17,50,91,.06); }}
    .system:not(:last-child)::after {{ content: ""; position: absolute; top: 50%; right: -27px; width: 26px; border-top: 2px dotted #b9c7da; }}
    .system-logo {{ min-height: 84px; display: grid; place-items: center; margin-bottom: 14px; }}
    .system-logo img {{ display: block; max-width: 100%; object-fit: contain; }}
    .box-logo {{ width: 92px; height: 50px; }}
    .salesforce-logo {{ width: 220px; height: 84px; }}
    .system-name {{ min-height: 23px; margin: -5px 0 10px; color: var(--ink); font-size: .78rem; font-weight: 740; letter-spacing: .01em; }}
    .system h3 {{ margin: 0; font: 760 1rem/1.3 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }} .system p {{ margin: 7px 0 0; color: var(--muted); font-size: .82rem; }}
    .example {{ padding: 35px; border: 1px solid #eadfc7; border-radius: var(--radius); background: #fffbf3; }}
    .example h2 {{ margin: 0 0 28px; text-align: center; font-size: 2rem; letter-spacing: -.03em; }}
    .use-cases {{ display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); }}
    .use-case {{ display: grid; grid-template-columns: 42px 1fr; gap: 12px; padding: 0 22px; color: var(--gold); border-right: 1px solid #eadfc7; }} .use-case:last-child {{ border-right: 0; }}
    .use-case strong {{ display: block; color: var(--ink); font-size: .85rem; }} .use-case p {{ margin: 6px 0 0; color: var(--muted); font-size: .74rem; }}
    .proof {{ display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); margin: 34px 0; border: 1px solid var(--line); border-radius: 14px; box-shadow: 0 8px 24px rgba(17,50,91,.05); }}
    .proof-item {{ display: grid; grid-template-columns: 45px 1fr; gap: 12px; align-items: center; padding: 24px; border-right: 1px solid var(--line); }} .proof-item:last-child {{ border-right: 0; }}
    .proof-item:nth-child(1) {{ color: var(--blue); }} .proof-item:nth-child(2) {{ color: var(--violet); }} .proof-item:nth-child(3) {{ color: var(--teal); }} .proof-item:nth-child(4) {{ color: var(--gold); }}
    .proof-item strong {{ display: block; color: var(--ink); font: 650 1.05rem/1.05 ui-serif, Georgia, serif; }} .proof-item small {{ display: block; margin-top: 6px; color: var(--muted); font-size: .72rem; }}
    footer {{ padding: 30px 0 78px; border-top: 1px solid var(--line); text-align: center; }}
    footer p {{ margin: 0; color: var(--muted); font-size: .86rem; }}
    .toast {{ position: fixed; right: 22px; bottom: 22px; z-index: 5; padding: 13px 17px; color: #fff; background: var(--ink); border-radius: 10px; box-shadow: var(--shadow); transform: translateY(120px); opacity: 0; transition: .22s ease; }}
    .toast.show {{ transform: translateY(0); opacity: 1; }}
    @media (max-width: 850px) {{
      .hero {{ grid-template-columns: 1fr; }} h1 {{ max-width: 700px; }} .workspace {{ max-width: 680px; }}
      .outcomes {{ grid-template-columns: 1fr; }} .outcome {{ min-height: 0; }}
      .journey {{ grid-template-columns: repeat(2, 1fr); }} .journey-step::after {{ display: none; }}
      .system-grid {{ grid-template-columns: 1fr; }} .system::after {{ display: none; }}
      .use-cases, .proof {{ grid-template-columns: repeat(2, 1fr); }} .use-case:nth-child(2), .proof-item:nth-child(2) {{ border-right: 0; }} .use-case:nth-child(-n+2), .proof-item:nth-child(-n+2) {{ margin-bottom: 24px; }}
    }}
    @media (max-width: 560px) {{
      .page {{ width: min(100% - 24px, 1120px); }} .brand {{ padding-top: 22px; }} h1 {{ font-size: clamp(3rem, 15vw, 4.4rem); }}
      .workspace-body {{ grid-template-columns: 1fr; }} .summary {{ border-right: 0; border-bottom: 1px solid var(--line); }} .approval {{ align-items: flex-start; flex-direction: column; }} .buttons {{ width: 100%; }} .buttons button {{ flex: 1; }}
      .journey, .use-cases, .proof {{ grid-template-columns: 1fr; }} .use-case, .proof-item {{ border-right: 0; border-bottom: 1px solid var(--line); padding-block: 20px; margin: 0 !important; }} .use-case:last-child, .proof-item:last-child {{ border-bottom: 0; }}
      .example {{ padding: 28px 18px; }}
    }}
    @media (prefers-reduced-motion: reduce) {{ html {{ scroll-behavior: auto; }} *, *::before, *::after {{ transition-duration: .01ms !important; }} }}
    @media print {{
      @page {{ size: A4 portrait; margin: 10mm; }}
      body {{ font-size: 10px; }} .page {{ width: 100%; }} .brand {{ padding: 0 0 8px; }} .hero {{ padding: 5px 0 12px; gap: 18px; }} h1 {{ font-size: 38px; }} .lead {{ font-size: 12px; }} .rule {{ margin: 14px 0; }}
      .workspace {{ box-shadow: none; }} .outcomes {{ padding: 8px 0 12px; gap: 8px; }} .outcome {{ min-height: 105px; padding: 12px; }} .round-icon {{ width: 32px; height: 32px; }} .outcome h2 {{ margin: 10px 0 4px; font-size: 17px; }} .outcome p {{ font-size: 10px; }}
      .journey {{ padding: 8px 10px 14px; }} .systems {{ padding: 14px 0; }} .section-title {{ font-size: 24px; }} .section-lead {{ margin: 4px 0 10px; }} .system {{ padding: 10px; }}
      .example {{ padding: 12px; }} .example h2 {{ margin-bottom: 10px; font-size: 18px; }} .proof {{ margin: 10px 0; }} .proof-item {{ padding: 10px; }} footer {{ padding: 10px 0 0; }} .toast {{ display: none; }}
    }}
  </style>
</head>
<body>
  <header class="brand page"><img class="brand-logo" data-brand-logo="box" src="{box_logo}" alt="Box"><span>Solutions</span></header>
  <main class="page">
    <section class="hero" aria-labelledby="hero-title">
      <div>
        <h1 id="hero-title">Move work forward. Decide with confidence.</h1>
        <div class="rule" aria-hidden="true"></div>
        <p class="lead">A guided workflow that brings content, business context, approvals, and insight together—so teams can act faster with confidence.</p>
      </div>
      <article class="workspace" aria-label="Guided loan approval experience">
        <div class="workspace-head">
          <div class="file-title"><span class="doc-icon">{icon('document')}</span><span><strong>Commitment Letter · Harborview Logistics</strong><small>Crestline Bank · Loan LN-2026-0042 · Updated September 15, 2026</small></span></div>
          <span class="status" id="status">Ready for approval</span>
        </div>
        <div class="workspace-body">
          <section class="summary"><h3>Loan summary</h3><dl class="facts"><div><dt>Borrower</dt><dd>Harborview Logistics Holdings LLC</dd></div><div><dt>Loan officer</dt><dd>Alex Bennett</dd></div><div><dt>Target closing</dt><dd>November 30, 2026</dd></div><div><dt>Term</dt><dd>120 months</dd></div><div><dt>Amount</dt><dd>$4,800,000</dd></div><div><dt>Collateral</dt><dd>1200 Harbor Way (appraised $5,650,000)</dd></div></dl></section>
          <section class="actions"><h3>Recommended next actions</h3><div class="next"><div class="next-row"><span class="mini">{icon('review')}</span><span><strong>Review covenant terms</strong><small>Focus on loan-to-value and debt service coverage</small></span><span class="chevron">›</span></div><div class="next-row"><span class="mini">{icon('shield')}</span><span><strong>Confirm policy alignment</strong><small>Standard, approved exception, or escalation</small></span><span class="chevron">›</span></div><div class="next-row"><span class="mini">{icon('handoff')}</span><span><strong>Route for approval</strong><small>Credit Risk, Collateral, Compliance</small></span><span class="chevron">›</span></div></div></section>
        </div>
        <div class="approval"><div class="reviewer"><span class="avatar">{icon('person')}</span><span><strong>Approval · Priya Shah</strong><small>Chief Credit Officer · Review and approve to proceed</small></span></div><div class="buttons"><button class="secondary" id="changes" type="button">Request changes</button><button class="primary" id="approve" type="button">Approve</button></div></div>
      </article>
    </section>

    <section class="outcomes" aria-label="Business outcomes">
      <article class="outcome"><span class="round-icon">{icon('fast')}</span><h2>Move faster</h2><p>Turn requests into coordinated action.</p></article>
      <article class="outcome"><span class="round-icon">{icon('shield')}</span><h2>Reduce risk</h2><p>Apply approved content, policy, and expertise.</p></article>
      <article class="outcome"><span class="round-icon">{icon('person')}</span><h2>Stay in control</h2><p>Keep people accountable for important decisions.</p></article>
    </section>

    <section class="journey" aria-label="How work moves forward">
      <article class="journey-step"><span class="step-icon">{icon('request')}</span><strong>1. Request</strong><p>Start in one place</p></article>
      <article class="journey-step"><span class="step-icon">{icon('understand')}</span><strong>2. Understand</strong><p>Bring the full picture together</p></article>
      <article class="journey-step"><span class="step-icon">{icon('decide')}</span><strong>3. Decide</strong><p>Approve the right next step</p></article>
      <article class="journey-step"><span class="step-icon">{icon('improve')}</span><strong>4. Improve</strong><p>Learn from every outcome</p></article>
    </section>

    <section class="systems" aria-labelledby="systems-title">
      <h2 class="section-title" id="systems-title">The right context for every decision.</h2>
      <p class="section-lead">Content and customer context come together when the work requires them.</p>
      <div class="system-grid"><article class="system"><div class="system-logo"><img class="box-logo" data-brand-logo="box" src="{box_logo}" alt="Box"></div><div class="system-name" aria-hidden="true">&nbsp;</div><h3>Content and knowledge</h3><p>Secure content, policies, templates, and expertise.</p></article><article class="system"><div class="system-logo"><img class="salesforce-logo" data-brand-logo="salesforce" src="{salesforce_logo}" alt="Salesforce"></div><div class="system-name">Salesforce Agentforce</div><h3>Customers and business process</h3><p>Account context and process across the lifecycle.</p></article></div>
    </section>

    <section class="example" aria-labelledby="example-title">
      <h2 id="example-title">Start with loan origination</h2>
      <div class="use-cases"><article class="use-case">{icon('request')}<div><strong>New loan applications</strong><p>Capture applications and gather the right documents up front.</p></div></article><article class="use-case">{icon('review')}<div><strong>Policy and covenant review</strong><p>Surface policy exceptions and precedent with clear visibility.</p></div></article><article class="use-case">{icon('sign')}<div><strong>Approvals and signatures</strong><p>Route credit decisions to the right people with full context and audit.</p></div></article><article class="use-case">{icon('calendar')}<div><strong>Covenants and maturities</strong><p>Track covenants and trigger actions before maturity.</p></div></article></div>
    </section>

    <section class="proof" aria-label="Solution value"><article class="proof-item">{icon('handoff')}<span><strong>Fewer handoffs</strong><small>Less back-and-forth, more progress.</small></span></article><article class="proof-item">{icon('bolt')}<span><strong>Faster decisions</strong><small>The right information to the right people.</small></span></article><article class="proof-item">{icon('shield')}<span><strong>Consistent governance</strong><small>Policy and controls applied everywhere.</small></span></article><article class="proof-item">{icon('repeat')}<span><strong>Reusable across solutions</strong><small>A foundation that scales with your needs.</small></span></article></section>
  </main>
  <footer><p>Box&nbsp;&nbsp;•&nbsp;&nbsp;Salesforce Agentforce</p></footer>
  <div class="toast" id="toast" role="status" aria-live="polite"></div>
  <script>
    const status = document.getElementById('status');
    const toast = document.getElementById('toast');
    let timer;
    function update(message, state) {{
      status.textContent = state;
      toast.textContent = message;
      toast.classList.add('show');
      clearTimeout(timer);
      timer = setTimeout(() => toast.classList.remove('show'), 2400);
    }}
    document.getElementById('approve').addEventListener('click', () => update('Approval recorded. The next step is ready.', 'Approved'));
    document.getElementById('changes').addEventListener('click', () => update('Change request prepared for the loan officer.', 'Changes requested'));
  </script>
</body>
</html>'''
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(document, encoding="utf-8")
    return OUTPUT


if __name__ == "__main__":
    print(build())
