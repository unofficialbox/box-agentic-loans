#!/usr/bin/env python3
"""Build the presenter landing page and self-contained combined edition."""

from __future__ import annotations

import base64
import html
import json
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "html"


@dataclass(frozen=True)
class PresenterPage:
    filename: str
    title: str
    group: str
    eyebrow: str
    description: str


PAGES = (
    PresenterPage(
        "00-operator-setup-guide.html",
        "Operator Setup Guide",
        "Prepare",
        "Environment readiness",
        "Configure, deploy, validate, and rehearse the demo in a new environment.",
    ),
    PresenterPage(
        "01-box-salesforce-los-guide.html",
        "Box + Salesforce Loan Origination Guide",
        "Scenario",
        "Tell / show / tell",
        "Present governed loan origination across Box and Salesforce Agentforce.",
    ),
    PresenterPage(
        "02-box-salesforce-los-gallery.html",
        "Box + Salesforce Experience Gallery",
        "Scenario",
        "Real demo evidence",
        "Review the borrower portal, governed loan file, credit policy, and human-decision experiences.",
    ),
    PresenterPage(
        "03-executive-marketecture.html",
        "Executive Marketecture",
        "Communicate",
        "Leadership view",
        "Connect the operating model, platform responsibilities, outcomes, and delivery path.",
    ),
    PresenterPage(
        "04-customer-solution-datasheet.html",
        "Customer Solution Datasheet",
        "Communicate",
        "Customer overview",
        "Share the business problem, solution experience, outcomes, and platform contribution.",
    ),
    PresenterPage(
        "05-loan-lifecycle-readiness-marketecture.html",
        "Loan Lifecycle Readiness",
        "Communicate",
        "Lifecycle view",
        "Trace persistent platform responsibilities from application intake through approved closing and servicing.",
    ),
)


SHARED_CSS = """
:root {
  --ink:#0b2349; --muted:#5b6f8e; --line:#d7e1ef; --paper:#ffffff;
  --wash:#f3f7fc; --blue:#0061d5; --cyan:#00a1e0; --green:#087f5b;
  --violet:#6941c6; --orange:#d96c00; --shadow:0 20px 60px rgba(11,35,73,.12);
}
* { box-sizing:border-box; }
html { scroll-behavior:smooth; }
body { margin:0; background:var(--wash); color:var(--ink); font-family:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
button,a,select { font:inherit; }
a { color:inherit; }
.shell { width:min(1180px,calc(100% - 48px)); margin-inline:auto; }
.masthead { color:#fff; background:radial-gradient(circle at 85% 0,rgba(0,161,224,.32),transparent 35%),linear-gradient(135deg,#071a38,#0b2c60 62%,#0d477e); }
.masthead-inner { padding:64px 0 54px; }
.brandline { display:flex; justify-content:space-between; gap:24px; align-items:center; margin-bottom:54px; }
.brand { display:flex; align-items:center; gap:12px; font-size:14px; font-weight:800; letter-spacing:.12em; text-transform:uppercase; }
.brand-mark { width:34px; height:34px; display:grid; place-items:center; border:1px solid rgba(255,255,255,.4); border-radius:10px; }
.status { padding:8px 12px; border:1px solid rgba(255,255,255,.28); border-radius:999px; background:rgba(255,255,255,.09); color:#dbeafe; font-size:12px; font-weight:700; }
.kicker { margin:0 0 14px; color:#7dd3fc; font-size:13px; font-weight:800; letter-spacing:.14em; text-transform:uppercase; }
h1 { max-width:900px; margin:0; font-size:clamp(40px,6vw,72px); line-height:.98; letter-spacing:-.055em; }
.intro { max-width:760px; margin:24px 0 0; color:#dce8f8; font-size:19px; line-height:1.6; }
.actions { display:flex; flex-wrap:wrap; gap:12px; margin-top:32px; }
.button { display:inline-flex; align-items:center; justify-content:center; gap:9px; min-height:46px; padding:0 18px; border-radius:10px; text-decoration:none; font-weight:800; border:1px solid rgba(255,255,255,.32); }
.button.primary { color:#08234a; background:#fff; border-color:#fff; }
.button.secondary { color:#fff; background:rgba(255,255,255,.08); }
.button svg { width:16px; height:16px; }
.content { padding:52px 0 72px; }
.section { margin-top:46px; }
.section:first-child { margin-top:0; }
.section-head { display:flex; align-items:end; justify-content:space-between; gap:24px; padding-bottom:16px; border-bottom:2px solid var(--ink); }
.section-head h2 { margin:0; font-size:26px; letter-spacing:-.03em; }
.section-head p { max-width:570px; margin:0; color:var(--muted); line-height:1.5; text-align:right; }
.cards { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px; margin-top:18px; }
.card { position:relative; min-height:214px; display:flex; flex-direction:column; padding:26px; overflow:hidden; border:1px solid var(--line); border-radius:16px; background:var(--paper); box-shadow:0 8px 24px rgba(11,35,73,.05); text-decoration:none; transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease; }
.card::before { content:""; position:absolute; inset:0 auto 0 0; width:5px; background:var(--card-accent,var(--blue)); }
.card:hover,.card:focus-visible { transform:translateY(-3px); border-color:#8bb9ef; box-shadow:var(--shadow); outline:none; }
.card .meta { color:var(--card-accent,var(--blue)); font-size:11px; font-weight:900; letter-spacing:.13em; text-transform:uppercase; }
.card h3 { margin:16px 0 8px; font-size:24px; letter-spacing:-.03em; }
.card p { margin:0; color:var(--muted); line-height:1.55; }
.card .open { display:flex; align-items:center; gap:7px; margin-top:auto; padding-top:22px; font-size:13px; font-weight:850; }
.card .open svg { width:15px; height:15px; }
.prepare { --card-accent:var(--orange); }
.scenario-one { --card-accent:var(--green); }
.communicate { --card-accent:var(--blue); }
.combined-callout { display:grid; grid-template-columns:1.4fr .6fr; gap:28px; align-items:center; margin-top:-28px; padding:28px 30px; border:1px solid #8bb9ef; border-radius:18px; background:linear-gradient(120deg,#e8f3ff,#fff 62%); box-shadow:var(--shadow); }
.combined-callout h2 { margin:0 0 8px; font-size:28px; letter-spacing:-.035em; }
.combined-callout p { margin:0; color:var(--muted); line-height:1.55; }
.combined-callout .button { justify-self:end; color:#fff; background:var(--blue); border-color:var(--blue); }
footer { padding:26px 0; border-top:1px solid var(--line); background:#fff; color:var(--muted); font-size:12px; }
footer .shell { display:flex; justify-content:space-between; gap:20px; }
@media (max-width:760px) {
  .shell { width:min(100% - 28px,1180px); }
  .masthead-inner { padding:30px 0 42px; }
  .brandline { align-items:flex-start; margin-bottom:44px; }
  .status { max-width:170px; text-align:center; }
  h1 { font-size:44px; }
  .intro { font-size:17px; }
  .combined-callout,.cards { grid-template-columns:1fr; }
  .combined-callout { margin-top:-20px; padding:24px; }
  .combined-callout .button { justify-self:stretch; }
  .section-head { display:block; }
  .section-head p { margin-top:8px; text-align:left; }
  footer .shell { display:block; }
  footer .shell span { display:block; margin-top:6px; }
}
"""


ARROW = """<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h11m-4-4 4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>"""


def page_class(page: PresenterPage) -> str:
    return {
        "Prepare": "prepare",
        "Scenario": "scenario-one",
        "Communicate": "communicate",
    }[page.group]


def build_landing(output: Path | None = None) -> Path:
    """Build a small home page that routes to the separate presenter files."""

    target = output or OUTPUT / "index.html"
    sections: list[str] = []
    group_copy = {
        "Prepare": "Start here when configuring or rehearsing the solution in a new environment.",
        "Scenario": "Governed loan origination across the Box loan file, Salesforce loan context, and the Loan Copilot.",
        "Communicate": "Executive, customer, and lifecycle views for non-technical and technical conversations.",
    }
    for group in group_copy:
        cards = []
        for number, page in enumerate(PAGES, 1):
            if page.group != group:
                continue
            cards.append(
                f'''<a class="card {page_class(page)}" href="{html.escape(page.filename)}">
  <span class="meta">{number:02d} · {html.escape(page.eyebrow)}</span>
  <h3>{html.escape(page.title)}</h3>
  <p>{html.escape(page.description)}</p>
  <span class="open">Open standalone file {ARROW}</span>
</a>'''
            )
        sections.append(
            f'''<section class="section">
  <div class="section-head"><h2>{html.escape(group)}</h2><p>{html.escape(group_copy[group])}</p></div>
  <div class="cards">{"".join(cards)}</div>
</section>'''
        )

    document = f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Crestline LOS · Presenter Library</title><style>{SHARED_CSS}</style></head>
<body><header class="masthead"><div class="shell masthead-inner">
  <div class="brandline"><div class="brand"><span class="brand-mark">LOS</span><span>Crestline Loan Operations</span></div><span class="status">Portable presenter library · 7 chapters</span></div>
  <p class="kicker">Start here</p><h1>Choose the right story for the room.</h1>
  <p class="intro">One entry point for environment setup, the complete demo scenario, real experience galleries, and executive-ready solution narratives. Every chapter remains available as its own portable file.</p>
  <div class="actions"><a class="button primary" href="06-complete-presenter-edition.html">Open the combined edition {ARROW}</a><a class="button secondary" href="#library">Browse individual files</a></div>
</div></header>
<main id="library" class="shell content">
  <aside class="combined-callout"><div><h2>Need one file?</h2><p>The combined edition packages all seven chapters into a single self-contained HTML file with chapter navigation, keyboard controls, and no network dependencies.</p></div><a class="button" href="06-complete-presenter-edition.html">Launch combined edition {ARROW}</a></aside>
  {"".join(sections)}
</main><footer><div class="shell"><span>Crestline LOS · Portable specification and local deterministic fixture</span><span>Markdown remains authoritative · HTML is the sharing layer</span></div></footer></body></html>'''
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(document, encoding="utf-8")
    return target


def embedded_pages(source_dir: Path) -> list[dict[str, str]]:
    """Read and encode every standalone file for the combined edition."""

    records = []
    for page in PAGES:
        source = source_dir / page.filename
        if not source.is_file():
            raise FileNotFoundError(f"Missing presenter chapter: {source}")
        records.append(
            {
                "filename": page.filename,
                "title": page.title,
                "group": page.group,
                "eyebrow": page.eyebrow,
                "description": page.description,
                "document": base64.b64encode(source.read_bytes()).decode("ascii"),
            }
        )
    return records


def build_combined(source_dir: Path | None = None, output: Path | None = None) -> Path:
    """Build one offline file containing all standalone presenter documents."""

    source_dir = source_dir or OUTPUT
    target = output or OUTPUT / "06-complete-presenter-edition.html"
    page_data = json.dumps(embedded_pages(source_dir), separators=(",", ":"))
    document = f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Crestline LOS · Complete Presenter Edition</title><style>
{SHARED_CSS}
html,body {{ height:100%; overflow:hidden; }}
body {{ background:#e9f0f8; }}
.reader {{ height:100%; display:grid; grid-template-rows:auto 1fr; }}
.reader-head {{ position:relative; z-index:4; display:grid; grid-template-columns:auto minmax(0,1fr) auto; align-items:center; gap:20px; min-height:76px; padding:12px 20px; color:#fff; background:#071a38; box-shadow:0 8px 30px rgba(7,26,56,.2); }}
.reader-brand {{ display:flex; align-items:center; gap:11px; font-size:12px; font-weight:850; letter-spacing:.09em; text-transform:uppercase; }}
.reader-brand .brand-mark {{ width:34px; height:34px; }}
.chapter-context {{ min-width:0; text-align:center; }}
.chapter-context small {{ display:block; color:#7dd3fc; font-size:10px; font-weight:850; letter-spacing:.12em; text-transform:uppercase; }}
.chapter-context strong {{ display:block; margin-top:3px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:17px; }}
.reader-actions {{ display:flex; align-items:center; gap:8px; }}
.icon-button {{ width:40px; height:40px; display:grid; place-items:center; color:#fff; border:1px solid rgba(255,255,255,.24); border-radius:9px; background:rgba(255,255,255,.07); cursor:pointer; }}
.icon-button:hover,.icon-button:focus-visible {{ background:rgba(255,255,255,.16); outline:2px solid #7dd3fc; outline-offset:1px; }}
.icon-button:disabled {{ opacity:.35; cursor:not-allowed; }}
.icon-button svg {{ width:17px; height:17px; }}
.reader-body {{ min-height:0; display:grid; grid-template-columns:310px minmax(0,1fr); }}
.chapters {{ min-height:0; overflow:auto; padding:20px 14px 28px; border-right:1px solid #c7d5e7; background:#f8fbff; }}
.chapters h2 {{ margin:4px 10px 18px; font-size:12px; letter-spacing:.14em; text-transform:uppercase; }}
.chapter {{ width:100%; display:grid; grid-template-columns:34px 1fr; gap:10px; padding:13px 10px; color:var(--ink); text-align:left; border:0; border-radius:11px; background:transparent; cursor:pointer; }}
.chapter:hover {{ background:#e9f2fe; }}
.chapter[aria-current="true"] {{ color:#fff; background:#0b3973; box-shadow:0 8px 18px rgba(11,57,115,.2); }}
.chapter-number {{ width:28px; height:28px; display:grid; place-items:center; border:1px solid #b8cae0; border-radius:8px; font-size:10px; font-weight:900; }}
.chapter[aria-current="true"] .chapter-number {{ border-color:rgba(255,255,255,.35); background:rgba(255,255,255,.08); }}
.chapter-label {{ min-width:0; }}
.chapter-label small {{ display:block; margin-bottom:3px; color:var(--muted); font-size:9px; font-weight:850; letter-spacing:.1em; text-transform:uppercase; }}
.chapter[aria-current="true"] small {{ color:#9fdcff; }}
.chapter-label strong {{ display:block; font-size:13px; line-height:1.25; }}
.stage {{ position:relative; min-width:0; min-height:0; background:#fff; }}
#chapter-frame {{ width:100%; height:100%; display:block; border:0; background:#fff; }}
.loading {{ position:absolute; inset:0; display:grid; place-items:center; color:var(--muted); background:#fff; font-size:14px; }}
.mobile-jump {{ display:none; width:100%; min-width:0; padding:10px 36px 10px 12px; color:#fff; border:1px solid rgba(255,255,255,.28); border-radius:8px; background:#0b315f; }}
@media (max-width:820px) {{
  .reader-head {{ grid-template-columns:auto 1fr; gap:12px; min-height:88px; }}
  .reader-brand span:last-child,.chapter-context {{ display:none; }}
  .reader-actions {{ min-width:0; }}
  .mobile-jump {{ display:block; }}
  .reader-body {{ grid-template-columns:1fr; }}
  .chapters {{ display:none; }}
}}
</style></head><body><div class="reader">
<header class="reader-head"><div class="reader-brand"><span class="brand-mark">LOS</span><span>Complete Presenter Edition</span></div>
  <div class="chapter-context"><small id="chapter-meta">Chapter 1 of 9</small><strong id="chapter-title">Operator Setup Guide</strong></div>
  <div class="reader-actions"><select id="mobile-jump" class="mobile-jump" aria-label="Choose chapter"></select>
    <button id="previous" class="icon-button" type="button" aria-label="Previous chapter"><svg viewBox="0 0 20 20"><path d="m12 5-5 5 5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
    <button id="next" class="icon-button" type="button" aria-label="Next chapter">{ARROW}</button>
  </div></header>
<div class="reader-body"><nav class="chapters" aria-label="Presenter chapters"><h2>Table of contents</h2><div id="chapter-list"></div></nav>
<main class="stage"><div id="loading" class="loading">Preparing chapter…</div><iframe id="chapter-frame" title="Presenter chapter"></iframe></main></div>
</div><script>
const pages={page_data};
const list=document.getElementById("chapter-list");
const jump=document.getElementById("mobile-jump");
const frame=document.getElementById("chapter-frame");
const loading=document.getElementById("loading");
let active=0;
const decode=value=>new TextDecoder().decode(Uint8Array.from(atob(value),char=>char.charCodeAt(0)));
pages.forEach((page,index)=>{{
  const button=document.createElement("button");
  button.type="button"; button.className="chapter"; button.dataset.index=String(index);
  button.innerHTML=`<span class="chapter-number">${{String(index+1).padStart(2,"0")}}</span><span class="chapter-label"><small>${{page.group}} · ${{page.eyebrow}}</small><strong>${{page.title}}</strong></span>`;
  button.addEventListener("click",()=>show(index)); list.appendChild(button);
  const option=document.createElement("option"); option.value=String(index); option.textContent=`${{index+1}}. ${{page.title}}`; jump.appendChild(option);
}});
function show(index){{
  active=Math.max(0,Math.min(index,pages.length-1)); const page=pages[active]; loading.hidden=false;
  document.querySelectorAll(".chapter").forEach((button,i)=>button.setAttribute("aria-current",String(i===active)));
  document.getElementById("chapter-meta").textContent=`Chapter ${{active+1}} of ${{pages.length}} · ${{page.group}}`;
  document.getElementById("chapter-title").textContent=page.title; jump.value=String(active);
  document.getElementById("previous").disabled=active===0; document.getElementById("next").disabled=active===pages.length-1;
  frame.title=page.title; frame.srcdoc=decode(page.document); history.replaceState(null,"",`#chapter-${{active+1}}`);
}}
frame.addEventListener("load",()=>{{loading.hidden=true;}});
jump.addEventListener("change",event=>show(Number(event.target.value)));
document.getElementById("previous").addEventListener("click",()=>show(active-1));
document.getElementById("next").addEventListener("click",()=>show(active+1));
document.addEventListener("keydown",event=>{{if(event.altKey&&event.key==="ArrowLeft")show(active-1);if(event.altKey&&event.key==="ArrowRight")show(active+1);}});
const requested=Number(location.hash.replace("#chapter-",""))-1; show(Number.isInteger(requested)&&requested>=0?requested:0);
</script></body></html>'''
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(document, encoding="utf-8")
    return target


def build() -> tuple[Path, Path]:
    landing = build_landing()
    combined = build_combined()
    return landing, combined


if __name__ == "__main__":
    for path in build():
        print(path)
