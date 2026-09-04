#!/usr/bin/env python3
"""Build the offline LOS experience gallery from real product screenshots."""

from __future__ import annotations

import base64
import html
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCREENSHOTS = ROOT / "output" / "screenshots"
OUTPUT = ROOT / "output" / "html"
BRAND_ASSETS = ROOT / "docs" / "design" / "brand-assets"

BOX_EXPERIENCES = [
    {
        "file": "box-app-dashboard-live.png",
        "eyebrow": "Box Apps",
        "title": "Loan Origination dashboard",
        "description": "The published Box App cockpit with pending high-risk reviews, document-type and package-status charts, and direct new-application, credit-policy, and executed-loan actions.",
    },
    {
        "file": "box-app-dashboard-actions-live.png",
        "eyebrow": "Box Apps actions",
        "title": "Application intake, credit policies, and deal room",
        "description": "The dashboard action row keeps one governed Start a New Application action alongside Credit Policy Hub and Executed Loans shortcuts, followed by the Harborview Deal Room and loan-document cards.",
    },
    {
        "file": "box-app-credit-policy-library-live.png",
        "eyebrow": "Box Apps",
        "title": "Credit Policy Library dashboard page",
        "description": "The Box App page combines the approved lending standards view, governed source files, and a Standard versus Approved Exception portfolio chart.",
    },
    {
        "file": "box-app-approved-standards-view.png",
        "eyebrow": "Box Apps view",
        "title": "Approved lending standards",
        "description": "The metadata-backed Box Apps view over the individual Markdown policy files in the LOS credit policy library.",
    },
    {
        "file": "box-hub-credit-policy-library-live.png",
        "eyebrow": "Box Hubs",
        "title": "Crestline Credit Policy Library",
        "description": "The Crestline Credit Policy Library Hub over the eight governed policy files (standard positions and approved exceptions for LTV, DSCR, pricing and guaranty). The Loan Copilot's policy check reads this Hub and no other.",
    },
    {
        "file": "automate-intake-agents.png",
        "eyebrow": "Box Automate",
        "title": "Extract and agent enrichment",
        "description": "The workflow builder shows deterministic Extract of the loan terms and the Box Agent credit brief before the human decision point.",
    },
    {
        "file": "automate-approval-flow.png",
        "eyebrow": "Box Automate",
        "title": "Human validation gate",
        "description": "The workflow's approval task and approved/rejected branches, preserving human accountability before the Salesforce loan record is created.",
    },
    {
        "file": "automate-https-connector.png",
        "eyebrow": "Box Automate",
        "title": "HTTPS connector stage",
        "description": "The Salesforce standard REST request that creates the LOS_Loan__c record from validated metadata. OAuth smoke and workflow activation remain operator-gated.",
    },
    {
        "file": "box-docgen-templates.png",
        "eyebrow": "Box Doc Gen",
        "title": "LOS document templates",
        "description": "The four Word templates (credit memo, commitment letter, closing summary, maturity notice) in the workspace, each registered as a Box Doc Gen template.",
    },
    {
        "file": "box-workspace-live.png",
        "eyebrow": "Box workspace",
        "title": "LOS-2026-Harborview workspace",
        "description": "The governed loan workspace: numbered lifecycle folders from application intake to covenants and servicing, the Doc Gen templates folder, and the credit policy folder.",
    },
    {
        "file": "box-loan-folder-live.png",
        "eyebrow": "Box loan folder",
        "title": "LN-2026-0042 loan folder",
        "description": "The Box folder the Salesforce loan record resolves to, holding the borrower package with losDocument metadata and the generated draft commitment letter.",
    },
    {
        "file": "box-commitment-letter-preview.png",
        "eyebrow": "Box Doc Gen output",
        "title": "Draft commitment letter",
        "description": "The commitment letter Box Doc Gen rendered from the governed action: policy at issue, requested and approved positions, approved exceptions, proposed terms. A draft pending Credit Committee approval.",
    },
    {
        "file": "box-term-sheet-metadata.png",
        "eyebrow": "Box metadata",
        "title": "Term sheet markup, withheld from the borrower",
        "description": "The borrower's red-line markup carrying losDocument metadata: Term Sheet, versionStatus Internal, policyRisk Critical. Internal is the status the borrower portal withholds and portfolio search flags.",
    },
]
SALESFORCE_EXPERIENCES = [
    {
        "file": "los-loan-record-page.png",
        "eyebrow": "Salesforce",
        "title": "LOS Loan record",
        "description": "The Loan Origination app's record page for LN-2026-0042: amount, rate, term, LTV, DSCR and collateral value beside the borrower, opportunity and status, with the Box tab alongside Details.",
    },
    {
        "file": "los-agentforce-agents.png",
        "eyebrow": "Agentforce",
        "title": "Loan Copilot published and active",
        "description": "Setup's Agentforce Agents list showing Loan Copilot as an active service agent next to the CLM demo's Contract Copilot in the same org.",
    },
    {
        "file": "los-loan-copilot-builder.png",
        "eyebrow": "Agentforce Builder",
        "title": "Loan Copilot agent topology",
        "description": "The Agent Script topology: the loan router start agent routing to Document Answers (three governed Apex actions) and the fallback response.",
    },
]

REACT_EXPERIENCES = [
    {
        "file": "los-borrower-apply.png",
        "eyebrow": "Borrower portal",
        "title": "Start an application",
        "description": "The intake beat begins here: loan type, amount, term, purpose, borrowing entity and collateral, with the documents the bank will ask for listed before the borrower submits.",
    },
    {
        "file": "los-borrower-workspace-checklist.png",
        "eyebrow": "Borrower portal",
        "title": "Uploads classified by Box AI",
        "description": "The new application's workspace after two uploads: Box AI named each document against the losDocument template, the checklist ticked itself, and the loan application is still outstanding.",
    },
    {
        "file": "los-borrower-loans.png",
        "eyebrow": "Borrower portal",
        "title": "Dana Whitfield's loans",
        "description": "The Crestline Borrower Portal signed in as the Harborview CFO: loans by status, value by loan, upcoming maturities, the new application in progress, and only Harborview's loans. The Pinecrest loan in the same org is not visible.",
    },
    {
        "file": "los-react-workspace.png",
        "eyebrow": "Borrower portal",
        "title": "Harborview Logistics loan workspace",
        "description": "The LN-2026-0042 workspace over the governed Box loan folder: review progress, documents by type, the draft commitment letter, and the borrower's own uploads. The Internal term-sheet markup is withheld; eight of nine documents show.",
    },
]

for experience in BOX_EXPERIENCES:
    experience["source"] = "box-automate-loan-orchestration"

for experience in REACT_EXPERIENCES + SALESFORCE_EXPERIENCES:
    experience["source"] = "box-salesforce-los"

SCENARIOS = [
    {
        "order": "02",
        "slug": "box-salesforce-los",
        "title": "Box + Salesforce Loan Origination",
        "headline": "The complete multi-platform LOS operating model.",
        "description": "The governed Box loan file plus the Salesforce Agentforce experience in the borrower portal.",
        "status": "Captured from the live org and enterprise where a screen exists; Box App, Automate and the signed-in borrower workspace remain capture pending (MT-072).",
        "experiences": SALESFORCE_EXPERIENCES + REACT_EXPERIENCES + BOX_EXPERIENCES,
        "brands": ("box", "salesforce"),
    },
]


def data_uri(path: Path) -> str:
    """Return an embedded image data URI for a screenshot path."""

    suffix = path.suffix.lower()
    mime = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".svg": "image/svg+xml",
    }.get(suffix)
    if mime is None:
        raise ValueError(f"Unsupported embedded image: {path}")
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode('ascii')}"


def brand_logos(names: tuple[str, ...]) -> str:
    """Render official embedded platform logos for the gallery scenario."""

    assets = {
        "box": ("box-logo-blue.svg", "Box"),
        "salesforce": ("salesforce-logo.jpeg", "Salesforce"),
    }
    return "".join(
        f'<img class="brand-logo brand-logo-{name}" data-brand-logo="{name}" '
        f'src="{data_uri(BRAND_ASSETS / assets[name][0])}" alt="{assets[name][1]}">'
        for name in names
    )


def render_card(item: dict[str, str], index: int) -> str:
    """Render one gallery card.

    A missing screenshot renders a "Screen capture pending" placeholder rather than
    raising or substituting some other image. No loan-demo screen has been captured yet
    (MT-072); the card still names the surface so a presenter knows what will appear
    there, and a fabricated or borrowed picture would be a claim the repository cannot
    back.
    """

    path = SCREENSHOTS / item["source"] / item["file"]
    if path.exists():
        figure = (
            f'<img src="{data_uri(path)}" alt="{html.escape(item["title"])} real demo screenshot" loading="lazy">'
            "<figcaption>Captured from the real LOS demo experience in the signed-in Box tenant or the running borrower portal.</figcaption>"
        )
    else:
        figure = (
            '<div class="pending" role="img" aria-label="Screen capture pending">'
            "<strong>Screen capture pending</strong>"
            f"<span>{html.escape(item['source'])}/{html.escape(item['file'])}</span>"
            "</div>"
            "<figcaption>No loan-demo screen has been captured for this surface yet (MT-072). Nothing is fabricated in its place.</figcaption>"
        )
    return f"""
      <article class="experience" id="experience-{index}">
        <div class="copy">
          <p class="eyebrow">{html.escape(item['eyebrow'])}</p>
          <h2>{html.escape(item['title'])}</h2>
          <p>{html.escape(item['description'])}</p>
        </div>
        <figure>
          {figure}
        </figure>
      </article>"""


def build_scenario(scenario: dict[str, object]) -> Path:
    """Build one self-contained scenario gallery."""

    slug = str(scenario["slug"])
    experiences = scenario["experiences"]
    if not isinstance(experiences, list):
        raise TypeError("scenario experiences must be a list")
    cards = "\n".join(
        render_card(item, i + 1)
        for i, item in enumerate(experiences)
    )
    document = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Crestline LOS · Visual Gallery · {html.escape(str(scenario['title']))}</title>
  <style>
    :root {{
      color-scheme: dark;
      --ink: #f6f7fb;
      --muted: #aab1c2;
      --line: rgba(255,255,255,.12);
      --panel: rgba(20,24,35,.82);
      --blue: #72a7ff;
      --mint: #7ce7c6;
      --radius: 24px;
    }}
    * {{ box-sizing: border-box; }}
    html {{ scroll-behavior: smooth; }}
    body {{
      margin: 0;
      color: var(--ink);
      background:
        radial-gradient(circle at 12% 0%, rgba(45,103,220,.28), transparent 34rem),
        radial-gradient(circle at 90% 20%, rgba(37,183,143,.17), transparent 28rem),
        #080b12;
      font: 16px/1.55 Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }}
    header, main, footer {{ width: min(1440px, calc(100% - 40px)); margin-inline: auto; }}
    header {{ padding: 84px 0 56px; display: grid; grid-template-columns: 1.5fr 1fr; gap: 48px; align-items: end; }}
    .kicker, .eyebrow {{ color: var(--mint); font-size: .78rem; font-weight: 750; letter-spacing: .13em; text-transform: uppercase; }}
    h1 {{ margin: 10px 0 18px; max-width: 920px; font-size: clamp(2.8rem, 6vw, 6rem); line-height: .95; letter-spacing: -.055em; }}
    header p {{ margin: 0; color: var(--muted); font-size: 1.08rem; max-width: 700px; }}
    .brand-logos {{ display: flex; flex-wrap: wrap; align-items: center; gap: 18px; min-height: 54px; margin-bottom: 28px; }}
    .brand-logos img {{ display: block; width: auto; max-width: 150px; height: 42px; object-fit: contain; border: 0; border-radius: 0; background: transparent; }}
    .brand-logos .brand-logo-box {{ width: 76px; }}
    .brand-logos .brand-logo-salesforce {{ width: 128px; height: 46px; border-radius: 8px; }}
    .status {{ border: 1px solid var(--line); border-radius: var(--radius); padding: 24px; background: var(--panel); backdrop-filter: blur(14px); }}
    .status strong {{ display: block; margin-bottom: 8px; font-size: 1.15rem; }}
    .status span {{ color: var(--muted); }}
    main {{ display: grid; gap: 30px; padding-bottom: 72px; }}
    .experience {{
      border: 1px solid var(--line);
      border-radius: var(--radius);
      overflow: hidden;
      background: linear-gradient(145deg, rgba(27,32,46,.94), rgba(12,15,23,.94));
      box-shadow: 0 26px 90px rgba(0,0,0,.28);
    }}
    .copy {{ display: grid; grid-template-columns: 180px minmax(250px, 1fr) minmax(280px, .9fr); gap: 28px; align-items: start; padding: 30px 34px; border-bottom: 1px solid var(--line); }}
    .copy p {{ margin: 0; color: var(--muted); }}
    .copy .eyebrow {{ color: var(--mint); }}
    h2 {{ margin: 0; font-size: clamp(1.35rem, 2.4vw, 2rem); line-height: 1.1; letter-spacing: -.025em; }}
    figure {{ margin: 0; padding: 18px; }}
    img {{ display: block; width: 100%; height: auto; border-radius: 14px; border: 1px solid rgba(255,255,255,.1); background: #fff; }}
    .pending {{ display: grid; place-items: center; gap: 8px; min-height: 260px; padding: 32px; border: 1px dashed rgba(255,255,255,.28); border-radius: 14px; color: var(--muted); background: rgba(255,255,255,.03); text-align: center; }}
    .pending strong {{ color: var(--ink); font-size: 1.1rem; }}
    .pending span {{ font: .82rem/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }}
    figcaption {{ padding: 13px 4px 0; color: #7f8799; font-size: .78rem; }}
    footer {{ padding: 0 0 64px; color: #7f8799; }}
    @media (max-width: 860px) {{
      header {{ grid-template-columns: 1fr; padding-top: 52px; }}
      header > * {{ min-width: 0; }}
      .copy {{ grid-template-columns: 1fr; gap: 12px; padding: 24px; }}
      .copy .eyebrow {{ margin-bottom: 2px; }}
    }}
    @media (prefers-reduced-motion: no-preference) {{
      .experience {{ animation: settle .55s ease both; animation-delay: calc(var(--i, 0) * 40ms); }}
      @keyframes settle {{ from {{ opacity: 0; transform: translateY(14px); }} to {{ opacity: 1; transform: none; }} }}
    }}
  </style>
</head>
<body>
  <header>
    <div>
      <div class="brand-logos" aria-label="Platforms in this scenario">{brand_logos(tuple(scenario['brands']))}</div>
      <p class="kicker">Crestline Bank · Visual Gallery · {html.escape(str(scenario['title']))}</p>
      <h1>{html.escape(str(scenario['headline']))}</h1>
      <p>{html.escape(str(scenario['description']))} Every product image in this gallery is captured from the real demo app or live Box tenant, never a documentation site; surfaces without a capture say so.</p>
    </div>
    <aside class="status">
      <strong>Capture state</strong>
      <span>{html.escape(str(scenario['status']))}</span>
    </aside>
  </header>
  <main>
{cards}
  </main>
  <footer>Visual-only companion · Embedded real-demo screenshots or explicit capture-pending placeholders · No external fonts, scripts, stylesheets, or image references</footer>
</body>
</html>
"""
    OUTPUT.mkdir(parents=True, exist_ok=True)
    output_path = OUTPUT / f"{scenario['order']}-{slug}-gallery.html"
    output_path.write_text(document, encoding="utf-8")
    return output_path


def build() -> None:
    """Build every scenario gallery."""

    for scenario in SCENARIOS:
        print(build_scenario(scenario))


if __name__ == "__main__":
    build()
