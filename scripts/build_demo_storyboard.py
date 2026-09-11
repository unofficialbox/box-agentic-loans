#!/usr/bin/env python3
"""Render the table-driven storyboard from its single JSON source."""
import html
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "demo-storyboard"
LOGIN = "https://agentforce-box.my.site.com/loansvforcesite/login"
JOURNEY = "loan-journey.png"

def build():
    steps = json.loads((OUT / "storyboard.json").read_text())
    header = "# Loan Origination Demo\n\n[Open borrower portal login](" + LOGIN + ")\n\n"
    md = [header, "![Box, Claude, and Salesforce](platform-trio.svg)\n", "## The loan journey\n",
          f"![Capture, decision, and execution with Box and Salesforce]({JOURNEY})\n"]
    overview = ('<article id="platform-trio"><a href="platform-trio.svg"><img src="platform-trio.svg" alt="Box, Claude, and Salesforce"></a></article>'
                '<article id="loan-journey"><h2>The loan journey</h2>'
                f'<a href="{JOURNEY}"><img src="{JOURNEY}" '
                'alt="Capture, decision, and execution with Box and Salesforce"></a></article>')
    resources = json.loads((OUT / "resources.json").read_text())
    resource_cards = []
    for group in resources:
        links = []
        for label, path in group["files"]:
            if not (OUT / path).is_file():
                raise FileNotFoundError(path)
            links.append(f'<tr><td><a href="{html.escape(path)}">{html.escape(label)}</a></td>'
                         f'<td>{html.escape(Path(path).name)}</td></tr>')
        resource_cards.append(f'<article><h2>{html.escape(group["title"])}</h2>'
                              '<table><thead><tr><th>Resource</th><th>File</th></tr></thead><tbody>'
                              + ''.join(links) + '</tbody></table></article>')
    setup = f'''<article><h2>Before the demo</h2>
<table><thead><tr><th>Step</th><th>Action</th><th>Ready when</th></tr></thead><tbody>
<tr><td>1 · Environment</td><td>Follow the <a href="../SETUP.md">deployment guide</a> for a new environment.</td><td>Box and Salesforce use the same loan folder mapping.</td></tr>
<tr><td>2 · Officer</td><td>Load the <a href="../../skills/loan-origination/SKILL.md">standalone SKILL.md</a> in Claude. Connect Box MCP and Salesforce Loan Origination.</td><td>Both connectors are available in the conversation.</td></tr>
<tr><td>3 · Borrower</td><td><a href="{LOGIN}">Sign in to the borrower portal</a>.</td><td>The borrower can create an application and open the workspace.</td></tr>
<tr><td>4 · Documents</td><td>Open the <a href="#resources">sample PDFs</a>. Upload the six supporting documents; add the borrower markup for analysis.</td><td>Classification has completed for the intended loan.</td></tr>
<tr><td>5 · Credit and signing</td><td>Confirm policy and precedent access, credit approver, signer, and registered Doc Gen template.</td><td>Approved terms can produce a populated letter for the intended signer.</td></tr>
<tr><td>6 · Rehearse</td><td>Follow the <a href="#storyboard">storyboard</a>; use the <a href="../../DEMO-CLICKPATH.md">copy/paste prompts</a>.</td><td>Signing closes the loan and the signed files remain accessible.</td></tr>
</tbody></table></article>
<article><h2>Application values</h2><table><tbody>
<tr><th>Borrower</th><td>Dockwright Logistics for new seeds; Harborview Logistics in the recorded walkthrough.</td></tr><tr><th>Loan type</th><td>Commercial Real Estate</td></tr>
<tr><th>Amount</th><td>$4,800,000</td></tr><tr><th>Term</th><td>120 months</td></tr><tr><th>Collateral</th><td>Real Estate</td></tr>
</tbody></table><p>Use the newly created loan throughout the demo.</p></article>'''
    cards = []
    for step in steps:
        title = f"* Step {step['number']} — {step['title']}"
        captures = step.get("captures", [{"label": step["title"], "path": step["screenshot"]}])
        rows = [
            ("Persona", step["persona"]),
            ("Tell — goal", step["tell"]), ("Show — action", step["show"]),
            ("Tell — business value", step["land"]),
        ]
        md += [f"\n## {title}\n", "| Cue | What to say |\n|---|---|",
               *[f"| {k} | {v} |" for k, v in rows],
               *[f"\n### {c['label']}\n\n![{c['label']}]({c['path']})\n" for c in captures],
               "### What to click\n\n| Order | Click / prompt |\n|---|---|"]
        evidence = step.get("evidence", [])
        clicks = step["click"].split(" → ")
        md += [f"| {n} | {text} |" for n, text in enumerate(clicks, 1)]
        md += ["\n### Details\n\n| Reference | Details |\n|---|---|", f"| Note | {step['details']} |"]
        if evidence:
            md += ["\n| Previews | Screenshot |\n|---|---|"]
            md += [f"| {e['label']} | [Open screenshot]({e['path']}) |" for e in evidence]
        h = html.escape
        def table(entries):
            return "<table><tbody>" + "".join(f"<tr><th>{h(str(k))}</th><td>{h(v)}</td></tr>" for k, v in entries) + "</tbody></table>"
        gallery = ''.join(f'<figure><figcaption>{h(c["label"])}</figcaption><a href="{h(c["path"])}">'
                          f'<img loading="lazy" src="{h(c["path"])}" alt="{h(c["label"])} — {h(step["title"])}"></a></figure>' for c in captures)
        cards.append(f'<article id="step-{step["number"]}"><h2>{h(title)}</h2>'
                     + table(rows) + gallery
                     + "<h3>What to click</h3>" + table(list(enumerate(clicks, 1)))
                     + "<details><summary>Details</summary>" + table([("Note", step["details"])]) + "</details>" + "".join(f'<p><a href="{h(e["path"])}">{h(e["label"])}</a></p>' for e in evidence) + "</article>")
    step_nav = '<nav class="step-nav" aria-label="Storyboard steps"><p>Steps</p>' + ''.join(
        f'<a href="#step-{step["number"]}"><span>{step["number"]:02d}</span>{html.escape(step["title"])}</a>'
        for step in steps) + '</nav>'
    (OUT / "storyboard.md").write_text("\n".join(md) + "\n")
    (OUT / "index.html").write_text("""<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Loan Origination Demo</title><style>
@font-face{font-family:Inter;src:url('fonts/Inter-Regular.ttf') format('truetype');font-weight:400;font-display:swap}
@font-face{font-family:Inter;src:url('fonts/Inter-SemiBold.ttf') format('truetype');font-weight:600;font-display:swap}
@font-face{font-family:'Inter Display';src:url('fonts/InterDisplay-SemiBold.ttf') format('truetype');font-weight:600;font-display:swap}
body{font:16px/1.5 Inter,sans-serif;margin:0;background:#f7f5ef;color:#183c38}main{max-width:1440px;margin:auto;padding:32px}article{background:white;padding:24px;margin:28px 0;border:1px solid #ddd8cd;border-radius:12px}table{border-collapse:collapse;width:100%;margin:16px 0}th,td{padding:10px 14px;border:1px solid #ddd8cd;text-align:left;vertical-align:top}th{font-weight:600;width:180px;background:#f7f5ef}img{max-width:100%;height:auto}a{color:#006b62}summary{cursor:pointer;font-weight:600}h1,h2,h3{font-family:'Inter Display',Inter,sans-serif;font-weight:600}
[hidden]{display:none!important}.tabs{display:flex;gap:6px;border-bottom:1px solid #ddd8cd;padding:12px 0;position:sticky;top:0;background:#f7f5ef;z-index:2}.tabs button{font:600 16px Inter,sans-serif;border:0;border-radius:8px;padding:12px 24px;background:transparent;color:#183c38;cursor:pointer}.tabs button[aria-selected="true"]{background:#183c38;color:white}.tabs button:focus-visible{outline:3px solid #0061ff;outline-offset:2px}figure{margin:24px 0}figcaption{font-weight:600;margin:8px 0}figure img{display:block;border-radius:8px}td a{font-weight:600}@media(max-width:640px){main{padding:16px}article{padding:16px}th,td{padding:8px;font-size:14px}.tabs button{padding:10px 16px}}@media print{.tabs{display:none}[role="tabpanel"][hidden]{display:block!important}}
.storyboard-layout{display:grid;grid-template-columns:240px minmax(0,1fr);gap:28px;align-items:start}.storyboard-content{min-width:0}.step-nav{position:sticky;top:86px;max-height:calc(100vh - 110px);overflow:auto;padding:20px 0}.step-nav p{margin:0 12px 12px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.12em;color:#62736e}.step-nav a{display:flex;gap:12px;padding:10px 12px;margin:3px 0;border-radius:8px;text-decoration:none;color:#183c38;font-size:14px;line-height:1.35}.step-nav a span{color:#72847b;font-variant-numeric:tabular-nums}.step-nav a:hover,.step-nav a:focus-visible{background:#e8ede7;outline-offset:2px}.storyboard-content article{scroll-margin-top:90px}.storyboard-content article:target{border-color:#006b62}#setup,#resources{max-width:1120px;margin:auto}@media(max-width:850px){.storyboard-layout{grid-template-columns:1fr;gap:0}.step-nav{position:static;max-height:210px;border-bottom:1px solid #ddd8cd}.step-nav a{padding:8px 12px}}@media print{.step-nav{display:none}.storyboard-layout{display:block}}
</style><main><h1>Loan Origination Demo</h1><p><a href=""" + '"' + LOGIN + '"' + """>Open borrower portal</a></p>
<nav class="tabs" role="tablist" aria-label="Demo sections">
<button id="tab-setup" role="tab" aria-selected="true" aria-controls="setup" data-panel="setup">Setup</button>
<button id="tab-storyboard" role="tab" aria-selected="false" aria-controls="storyboard" data-panel="storyboard" tabindex="-1">Storyboard</button>
<button id="tab-resources" role="tab" aria-selected="false" aria-controls="resources" data-panel="resources" tabindex="-1">Resources</button>
</nav><section id="setup" role="tabpanel" aria-labelledby="tab-setup">""" + setup + """</section>
<section id="storyboard" role="tabpanel" aria-labelledby="tab-storyboard" hidden><div class="storyboard-layout">""" + step_nav + '<div class="storyboard-content">' + overview + "".join(cards) + """</div></div></section>
<section id="resources" role="tabpanel" aria-labelledby="tab-resources" hidden>""" + "".join(resource_cards) + """</section></main>
<script>
const tabs = [...document.querySelectorAll('[role="tab"]')];
function activate(name, focus = false) {
  const selected = tabs.find(tab => tab.dataset.panel === name) || tabs[0];
  for (const tab of tabs) {
    const active = tab === selected;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
    document.getElementById(tab.dataset.panel).hidden = !active;
  }
  if (focus) selected.focus();
}
function fromHash() {
  const target = location.hash.slice(1);
  activate(target.startsWith('step-') ? 'storyboard' : target);
  if (target.startsWith('step-')) document.getElementById(target)?.scrollIntoView();
}
tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => { history.replaceState(null, '', '#' + tab.dataset.panel); activate(tab.dataset.panel); });
  tab.addEventListener('keydown', event => {
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = tabs.length - 1;
    if (next !== undefined) { event.preventDefault(); history.replaceState(null, '', '#' + tabs[next].dataset.panel); activate(tabs[next].dataset.panel, true); }
  });
});
window.addEventListener('hashchange', fromHash);
fromHash();
</script></html>""")


if __name__ == "__main__":
    build()
