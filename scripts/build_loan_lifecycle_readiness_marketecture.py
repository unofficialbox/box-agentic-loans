#!/usr/bin/env python3
"""Build the self-contained loan lifecycle readiness marketecture."""

from __future__ import annotations

import base64
import html
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "html" / "05-loan-lifecycle-readiness-marketecture.html"
BRAND_ASSETS = ROOT / "docs" / "design" / "brand-assets"

STAGES = (
    ("01", "Application Intake", "Capture the application package, establish ownership, and create the governed loan file.", "Intake begins when loan metadata is applied in Box; Box Automate starts the governed process."),
    ("02", "Classification & Enrichment", "Extract loan terms, apply metadata, and connect borrower context.", "Extracted amount, rate, term, collateral value, LTV, and DSCR are accepted by a loan officer before the loan record is updated."),
    ("03", "Policy & Covenant Analysis", "Compare the application to the credit policy library and prior executed agreements, explain exceptions, and route domain findings.", "Cited departures are mapped to Credit Risk, Collateral, Compliance, Loan Documentation, or another named domain expert."),
    ("04", "Cross-Source Credit Validation", "Reconcile borrower-stated terms with the appraisal, financial statements, and Salesforce loan context.", "Box content and Salesforce context are compared without changing system authority."),
    ("05", "Human Decision Gate (Credit Committee)", "Credit Risk, Collateral, Compliance, and the Credit Committee assess material findings.", "Named reviewers approve, reject, or request changes before any commitment letter, signature, or funding action."),
    ("06", "Approved Closing & Servicing", "Issue the commitment letter, close the loan, and manage covenants, maturities, and governed records.", "Approved workflows update loan status, preserve decision evidence, and set covenant review and maturity dates."),
)

LANES = (
    {
        "brand": "salesforce",
        "name": "Salesforce Agentforce",
        "class": "salesforce",
        "summary": "Borrower and credit operating context: accounts, opportunities, loan records, loan officers, credit approvals, and covenants.",
        "technical": "Standard Salesforce REST upserts the LOS loan record by external ID; Agentforce uses the same governed loan context, and accepted terms reach the record only through the human-confirmed apply action.",
        "cells": (
            ("Borrower & deal context", "Account, opportunity, application, and accountable loan officer."),
            ("Loan record enrichment", "Loan record, accepted terms, target closing, and participants."),
            ("Underwriting workflow", "Exception tasks, expert assignment, and credit approval state."),
            ("Credit validation", "Requested position, policy position, exception, and ownership."),
            ("Decision tracking", "Named credit approvals, service levels, and accountability."),
            ("Loan status", "Commitment, closing, covenants, maturities, and reporting."),
        ),
    },
    {
        "brand": "box",
        "name": "Box",
        "class": "box",
        "summary": "Governed loan file: applications, financial statements, appraisals, term sheets, credit policies, executed loan documents, tasks, and audit history.",
        "technical": "Box metadata and Automate trigger Extract and Box Agent steps; metadata, tasks, versions, Hubs, Apps, and retention remain native.",
        "cells": (
            ("Governed intake", "Application package, files, metadata, ownership, and access."),
            ("Loan file organization", "Classification, extracted terms, and the borrower workspace."),
            ("Policy evidence", "Credit policies, prior executed agreements, versions, and cited departures."),
            ("Source traceability", "Appraisal, financial statements, and review materials."),
            ("Human review", "Versioned content, tasks, comments, and decision evidence."),
            ("Controlled loan documents", "Commitment letter, executed loan agreement, covenants, retention, and audit history."),
        ),
    },
)

OUTCOMES = (
    ("Consistent application intake", "Every application begins with a governed loan file, ownership, and borrower context."),
    ("Faster expert review", "Material policy exceptions reach the right domain owner with cited evidence."),
    ("Traceable credit decisions", "Recommendations, approvals, and actions remain connected and auditable."),
    ("Governed portfolio intelligence", "Closings, covenants, maturities, risk, and performance improve future lending."),
)


def asset_data_uri(filename: str, media_type: str) -> str:
    encoded = base64.b64encode((BRAND_ASSETS / filename).read_bytes()).decode("ascii")
    return f"data:{media_type};base64,{encoded}"


def stage_markup() -> str:
    return "\n".join(
        f'''<article class="stage{' gate' if number == '05' else ' outcome' if number == '06' else ''}">
          <div class="stage-num">{number}</div><h2>{html.escape(title)}</h2><p class="stage-summary">{html.escape(copy)}</p><p class="technical-note stage-detail">{html.escape(detail)}</p>
        </article>'''
        for number, title, copy, detail in STAGES
    )


def lane_markup(logos: dict[str, str]) -> str:
    rows = []
    for lane in LANES:
        cells = "".join(
            f'<div class="lane-cell"><strong>{html.escape(title)}</strong><span>{html.escape(copy)}</span></div>'
            for title, copy in lane["cells"]
        )
        logo = f'<img data-brand-logo="{lane["brand"]}" src="{logos[lane["brand"]]}" alt="{html.escape(lane["name"])}">'
        rows.append(
            f'''<article class="lane {lane['class']}">
              <div class="lane-heading"><div class="logo-tile">{logo}</div><div><h3>{html.escape(lane['name'])}</h3><p>{html.escape(lane['summary'])}</p><p class="technical-note lane-technical">{html.escape(lane['technical'])}</p></div></div>
              {cells}
            </article>'''
        )
    return "\n".join(rows)


def outcome_markup() -> str:
    return "".join(
        f'<p class="capability"><strong>{html.escape(title)}</strong><span>{html.escape(copy)}</span></p>'
        for title, copy in OUTCOMES
    )


def build() -> Path:
    logos = {
        "box": asset_data_uri("box-logo-blue.svg", "image/svg+xml"),
        "salesforce": asset_data_uri("salesforce-logo-cropped.png", "image/png"),
    }
    document = f'''<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="AI-assisted loan origination marketecture showing persistent platform contributions and human credit decision authority.">
  <title>Crestline LOS · Loan Lifecycle Readiness</title>
  <style>
    :root {{ --ink:#0b1f4d; --muted:#506181; --line:#cbd5e1; --paper:#fff; --wash:#f8fbff; --box:#0061d5; --salesforce:#00a1e0; --success:#177245; }}
    * {{ box-sizing:border-box; }}
    html,body {{ margin:0; background:#eef3f9; }}
    body {{ color:var(--ink); font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }}
    .page {{ width:1920px; min-height:1080px; margin:0 auto; padding:54px 62px 38px; background:radial-gradient(circle at 90% 5%,rgba(0,161,224,.08),transparent 22%),var(--paper); }}
    .top {{ display:flex; align-items:end; justify-content:space-between; gap:32px; border-bottom:1px solid var(--line); padding-bottom:26px; }}
    h1 {{ margin:0; font-size:52px; letter-spacing:-2.1px; line-height:1; }}
    .subtitle {{ margin:12px 0 0; color:var(--muted); font-size:22px; font-weight:650; }}
    .view-toggle {{ display:flex; gap:8px; }}
    .view-control {{ padding:11px 16px; color:var(--ink); border:1px solid #9bb1cf; border-radius:999px; background:#fff; cursor:pointer; font:700 15px/1 Inter,ui-sans-serif,system-ui,sans-serif; white-space:nowrap; }}
    .view-control:hover {{ border-color:var(--ink); background:#f6f9fd; }}
    .view-control[aria-pressed="true"] {{ border-color:var(--ink); background:#f1f6fc; box-shadow:inset 0 0 0 1px var(--ink); }}
    .principle {{ display:grid; grid-template-columns:46px 1fr; gap:16px; align-items:center; margin:24px 0 22px; padding:16px 20px; border-left:5px solid var(--box); background:linear-gradient(90deg,#fffaf1,#fff 76%); }}
    .principle-icon {{ display:grid; place-items:center; width:40px; height:40px; color:#fff; border-radius:50%; background:var(--ink); font-size:23px; }}
    .principle strong {{ font-size:18px; }} .principle span {{ color:var(--muted); font-size:16px; }}
    .lifecycle {{ display:grid; grid-template-columns:repeat(6,1fr); gap:12px; margin-bottom:18px; }}
    .stage {{ position:relative; min-height:116px; padding:16px 18px 14px; border:1.5px solid #92a7c4; border-radius:15px; background:#fff; box-shadow:0 5px 16px rgba(11,31,77,.06); }}
    .stage:not(:last-child)::after {{ content:""; position:absolute; z-index:2; top:50%; right:-13px; width:13px; height:2px; background:var(--ink); }}
    .stage:not(:last-child)::before {{ content:""; position:absolute; z-index:3; top:calc(50% - 5px); right:-13px; border-top:6px solid transparent; border-bottom:6px solid transparent; border-left:8px solid var(--ink); }}
    .stage-num {{ color:var(--muted); font-size:14px; font-weight:800; }}
    .stage h2 {{ margin:6px 0 0; font-size:18px; line-height:1.14; letter-spacing:-.4px; }}
    .stage p {{ margin:8px 0 0; color:var(--muted); font-size:13px; line-height:1.32; }}
    .stage.gate {{ border-color:var(--success); background:linear-gradient(135deg,#f5fff9,#fff); }}
    .stage.outcome {{ border-color:var(--ink); background:linear-gradient(135deg,#f4f8ff,#fff); }}
    .technical-note {{ display:none; padding-top:7px; border-top:1px dashed color-mix(in srgb,var(--ink) 24%,white); }}
    body:not(.compact) .technical-note {{ display:block; }}
    .matrix {{ display:flex; flex-direction:column; padding-top:14px; border-top:2px solid var(--ink); }}
    .matrix-title {{ order:0; margin:0 0 10px; font-size:15px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; }}
    .lane {{ display:grid; grid-template-columns:270px repeat(6,1fr); overflow:hidden; margin-top:10px; border:1px solid var(--lane-color); border-radius:14px; background:linear-gradient(90deg,color-mix(in srgb,var(--lane-color) 8%,white),#fff 56%); }}
    .lane-heading {{ display:flex; align-items:center; gap:14px; padding:14px 16px; border-right:1px solid color-mix(in srgb,var(--lane-color) 36%,white); }}
    .logo-tile {{ width:54px; height:54px; display:grid; place-items:center; flex:0 0 auto; overflow:hidden; border:1px solid #dce5f1; border-radius:11px; background:#fff; }}
    .logo-tile img {{ display:block; max-width:44px; max-height:34px; object-fit:contain; }}
    .logo-tile img[data-brand-logo="salesforce"] {{ width:46px; height:34px; }}
    .logo-tile img[data-brand-logo="box"] {{ width:44px; }}
    .lane-heading h3 {{ margin:0; font-size:17px; line-height:1.12; letter-spacing:-.25px; }}
    .lane-heading p {{ margin:5px 0 0; color:var(--muted); font-size:12.5px; line-height:1.26; }}
    .lane-heading .lane-technical {{ font-size:11px; }}
    .lane-cell {{ position:relative; min-height:84px; padding:15px 13px 12px; border-right:1px solid #dce5f1; }}
    .lane-cell:last-child {{ border-right:0; }}
    .lane-cell::before {{ content:""; position:absolute; top:0; left:50%; height:10px; border-left:2px dotted var(--lane-color); }}
    .lane-cell strong {{ display:block; color:var(--ink); font-size:13.5px; line-height:1.18; }}
    .lane-cell span {{ display:block; margin-top:5px; color:var(--muted); font-size:12px; line-height:1.24; }} .salesforce {{ --lane-color:var(--salesforce); order:2; }} .box {{ --lane-color:var(--box); order:3; }}
    .capabilities {{ display:grid; grid-template-columns:1.1fr repeat(4,1fr); gap:0; margin-top:22px; overflow:hidden; border:1px solid var(--line); border-radius:14px; }}
    .capabilities h2,.capability {{ margin:0; padding:18px 20px; }}
    .capabilities h2 {{ color:#fff; background:var(--ink); font-size:16px; line-height:1.25; }}
    .capability {{ border-right:1px solid var(--line); background:#fff; }} .capability:last-child {{ border-right:0; }}
    .capability strong {{ display:block; font-size:14px; }} .capability span {{ display:block; margin-top:4px; color:var(--muted); font-size:12px; line-height:1.25; }}
    footer {{ display:flex; justify-content:space-between; gap:20px; align-items:center; margin-top:22px; color:#667896; font-size:12px; }}
    .legend {{ display:flex; gap:15px; flex-wrap:wrap; }} .legend-item {{ display:inline-flex; align-items:center; gap:6px; }} .dot {{ width:9px; height:9px; border-radius:50%; background:var(--dot); }}
    @media print {{ .page {{ margin:0; }} .view-toggle {{ display:none; }} }}
    @media (max-width:1000px) {{ .page {{ width:100%; min-height:100vh; padding:28px 20px; overflow-x:auto; }} .page>* {{ min-width:1300px; }} }}
    @media (min-width:3000px) {{ body {{ overflow:hidden; }} .page {{ zoom:2; }} }}
  </style>
</head>
<body class="compact">
  <main class="page">
    <header class="top"><div><h1>AI-Assisted Loan Origination</h1><p class="subtitle">Loan Origination (LOS)</p></div>
      <div class="view-toggle" role="group" aria-label="Detail level"><button class="view-control" type="button" data-view="compact" aria-pressed="true">Overview</button><button class="view-control" type="button" data-view="detail" aria-pressed="false">Detail</button></div>
    </header>
    <section class="principle" aria-label="Architecture principle"><div class="principle-icon">↔</div><div><strong>One end-to-end lifecycle. Persistent platform responsibilities.</strong><br><span>Every platform contributes across the loan lifecycle; governed Apex actions are the only path between them.</span></div></section>
    <section class="lifecycle" aria-label="Loan lifecycle">{stage_markup()}</section>
    <section class="matrix" aria-label="Persistent platform responsibilities across the lifecycle"><p class="matrix-title">Persistent platform responsibilities across every lifecycle stage</p>{lane_markup(logos)}</section>
    <section class="capabilities" aria-label="Shared outcomes"><h2>Shared outcomes across the lifecycle</h2>{outcome_markup()}</section>
    <footer><div class="legend" aria-label="Platform color legend"><span class="legend-item"><i class="dot" style="--dot:var(--salesforce)"></i>Salesforce Agentforce</span><span class="legend-item"><i class="dot" style="--dot:var(--box)"></i>Box</span></div><span>Platform marks are trademarks of their respective owners.</span></footer>
  </main>
  <script>
    const controls = [...document.querySelectorAll('[data-view]')];
    controls.forEach(button => button.addEventListener('click', () => {{
      const compact = button.dataset.view === 'compact'; document.body.classList.toggle('compact', compact);
      controls.forEach(control => control.setAttribute('aria-pressed', String(control === button)));
    }}));
  </script>
</body>
</html>'''
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(document, encoding="utf-8")
    return OUTPUT


if __name__ == "__main__":
    print(build())
