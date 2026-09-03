#!/usr/bin/env python3
"""Build portable, self-contained HTML guides for LOS setup and the loan origination scenario."""

from __future__ import annotations

import base64
import html
import mimetypes
import re
from dataclasses import dataclass, field
from html.parser import HTMLParser
from pathlib import Path


mimetypes.add_type("image/svg+xml", ".svg")


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "html"
BRAND_ASSETS = ROOT / "docs" / "design" / "brand-assets"


SCENARIOS = (
    {
        "order": "00",
        "slug": "operator-setup",
        "sources": [
            ROOT / "docs" / "operator" / "start-here.md",
            ROOT / "docs" / "operator" / "browser-configuration.md",
            ROOT / "docs" / "operator" / "smoke-test.md",
        ],
        "accent": "#f4c86a",
        "accent_2": "#5a95ff",
        "label": "Fresh-environment setup for human and AI-assisted operators",
        "brands": ("box", "salesforce"),
    },
    {
        "order": "01",
        "slug": "box-salesforce-los",
        "source": ROOT / "docs" / "operator" / "scenarios" / "box-salesforce-los" / "README.md",
        "accent": "#a98bff",
        "accent_2": "#5aaeff",
        "label": "Governed loan origination across Box and Salesforce",
        "brands": ("box", "salesforce"),
    },
)


def slugify(value: str) -> str:
    """Create the same predictable section IDs used by the Markdown guides."""

    value = re.sub(r"[`*_]", "", value).lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-")


def data_uri(path: Path) -> str:
    """Embed an image without relying on a filesystem or network reference."""

    mime = mimetypes.guess_type(path.name)[0]
    if mime is None:
        raise ValueError(f"Unsupported embedded asset type: {path}")
    payload = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime};base64,{payload}"


def brand_logos(names: tuple[str, ...]) -> str:
    """Render official embedded platform logos for the active scenario."""

    assets = {
        "box": ("box-logo-blue.svg", "Box"),
        "salesforce": ("salesforce-logo.jpeg", "Salesforce"),
    }
    return "".join(
        f'<img class="brand-logo brand-logo-{name}" data-brand-logo="{name}" '
        f'src="{data_uri(BRAND_ASSETS / assets[name][0])}" alt="{assets[name][1]}">'
        for name in names
    )


@dataclass
class ReferenceIndex:
    """Collect non-page links so the output contains no external href values."""

    targets: list[tuple[str, str]] = field(default_factory=list)
    keys: dict[tuple[str, str], int] = field(default_factory=dict)

    def add(self, label: str, target: str) -> int:
        key = (label, target)
        if key not in self.keys:
            self.targets.append(key)
            self.keys[key] = len(self.targets)
        return self.keys[key]


INLINE_PATTERN = re.compile(
    r"(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))"
)


def canonical_reference_target(target: str, source: Path) -> str:
    """Convert local Markdown targets to durable repository-relative paths."""

    if target.startswith(("#", "http://", "https://", "mailto:")):
        return target
    path_text, separator, fragment = target.partition("#")
    destination = (source.parent / path_text).resolve()
    try:
        repository_path = destination.relative_to(ROOT).as_posix()
    except ValueError:
        return target
    return repository_path + (f"#{fragment}" if separator else "")


def render_inline(text: str, references: ReferenceIndex, source: Path) -> str:
    """Render the small inline Markdown subset used by the scenario guides."""

    output: list[str] = []
    cursor = 0
    for match in INLINE_PATTERN.finditer(text):
        output.append(html.escape(text[cursor : match.start()]))
        token = match.group(0)
        if token.startswith("`"):
            output.append(f"<code>{html.escape(token[1:-1])}</code>")
        elif token.startswith("**"):
            output.append(
                f"<strong>{render_inline(token[2:-2], references, source)}</strong>"
            )
        else:
            label, target = re.fullmatch(r"\[([^\]]+)\]\(([^)]+)\)", token).groups()
            if target.startswith("#"):
                output.append(
                    f'<a href="{html.escape(target, quote=True)}">'
                    f"{html.escape(label)}</a>"
                )
            else:
                number = references.add(label, canonical_reference_target(target, source))
                output.append(
                    f'<span class="source-ref">{html.escape(label)}'
                    f'<sup aria-label="reference {number}">{number}</sup></span>'
                )
        cursor = match.end()
    output.append(html.escape(text[cursor:]))
    return "".join(output)


def is_table_separator(line: str) -> bool:
    cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
    return bool(cells) and all(re.fullmatch(r":?-{3,}:?", cell) for cell in cells)


def table_cells(line: str) -> list[str]:
    return [cell.strip() for cell in line.strip().strip("|").split("|")]


@dataclass
class RenderedMarkdown:
    source: Path
    title: str
    summary: str
    body: str
    sections: list[tuple[str, str]]
    references: ReferenceIndex
    embedded_assets: list[Path]


def render_markdown(path: Path, references: ReferenceIndex | None = None) -> RenderedMarkdown:
    """Convert the repo's deliberately simple scenario Markdown to HTML."""

    lines = path.read_text(encoding="utf-8").splitlines()
    title = lines[0].removeprefix("# ").strip()
    summary_index = next(index for index, line in enumerate(lines[1:], start=1) if line.strip())
    summary = lines[summary_index].strip()
    references = references or ReferenceIndex()
    embedded_assets: list[Path] = []
    sections: list[tuple[str, str]] = []
    blocks: list[str] = []
    paragraph: list[str] = []
    index = summary_index + 1
    section_open = False

    def flush_paragraph() -> None:
        if not paragraph:
            return
        content = " ".join(part.strip() for part in paragraph)
        blocks.append(f"<p>{render_inline(content, references, path)}</p>")
        paragraph.clear()

    while index < len(lines):
        line = lines[index]
        stripped = line.strip()

        if not stripped:
            flush_paragraph()
            index += 1
            continue

        if stripped.startswith("```"):
            flush_paragraph()
            language = stripped.removeprefix("```").strip()
            index += 1
            code_lines: list[str] = []
            while index < len(lines) and not lines[index].strip().startswith("```"):
                code_lines.append(lines[index])
                index += 1
            if index >= len(lines):
                raise ValueError(f"Unclosed code fence in {path}")
            index += 1
            language_class = f' class="language-{html.escape(language, quote=True)}"' if language else ""
            blocks.append(f"<pre><code{language_class}>{html.escape(chr(10).join(code_lines))}</code></pre>")
            continue

        image = re.fullmatch(r"!\[([^\]]*)\]\(([^)]+)\)", stripped)
        if image:
            flush_paragraph()
            alt, relative = image.groups()
            asset = (path.parent / relative).resolve()
            if not asset.is_file():
                raise FileNotFoundError(asset)
            embedded_assets.append(asset)
            asset_class = "diagram" if asset.suffix.lower() == ".svg" else "screenshot"
            blocks.append(
                '<figure class="product-shot">'
                f'<button class="zoom-trigger" type="button" aria-label="Open {html.escape(alt, quote=True)} at full size">'
                f'<img class="{asset_class}" src="{data_uri(asset)}" alt="{html.escape(alt, quote=True)}" decoding="sync">'
                '<span class="zoom-hint" aria-hidden="true">Open full size</span>'
                '</button>'
                f"<figcaption>{html.escape(alt)} · Embedded from the canonical demo asset</figcaption>"
                "</figure>"
            )
            index += 1
            continue

        heading = re.fullmatch(r"(#{2,4})\s+(.+)", stripped)
        if heading:
            flush_paragraph()
            level = len(heading.group(1))
            text = heading.group(2)
            anchor = slugify(text)
            if level == 2:
                sections.append((anchor, re.sub(r"[*`]", "", text)))
                if section_open:
                    blocks.append("</section>")
                blocks.append(f'<section class="guide-section" id="{anchor}">')
                section_open = True
            blocks.append(
                f'<h{level}>{render_inline(text, references, path)}</h{level}>'
            )
            index += 1
            continue

        if stripped.startswith("|") and index + 1 < len(lines) and is_table_separator(lines[index + 1]):
            flush_paragraph()
            headers = table_cells(stripped)
            index += 2
            rows: list[list[str]] = []
            while index < len(lines) and lines[index].strip().startswith("|"):
                rows.append(table_cells(lines[index]))
                index += 1
            header_html = "".join(
                f"<th>{render_inline(cell, references, path)}</th>" for cell in headers
            )
            rows_html = "".join(
                "<tr>"
                + "".join(f"<td>{render_inline(cell, references, path)}</td>" for cell in row)
                + "</tr>"
                for row in rows
            )
            blocks.append(
                '<div class="table-scroll"><table><thead><tr>'
                f"{header_html}</tr></thead><tbody>{rows_html}</tbody></table></div>"
            )
            continue

        list_match = re.match(r"^(\d+)\.\s+(.+)$", stripped)
        bullet_match = re.match(r"^-\s+(.+)$", stripped)
        if list_match or bullet_match:
            flush_paragraph()
            ordered = list_match is not None
            tag = "ol" if ordered else "ul"
            items: list[str] = []
            pattern = r"^\d+\.\s+(.+)$" if ordered else r"^-\s+(.+)$"
            while index < len(lines):
                item_match = re.match(pattern, lines[index].strip())
                if not item_match:
                    break
                items.append(f"<li>{render_inline(item_match.group(1), references, path)}</li>")
                index += 1
            blocks.append(f"<{tag}>{''.join(items)}</{tag}>")
            continue

        paragraph.append(stripped)
        index += 1

    flush_paragraph()
    body = "\n".join(blocks)
    if section_open:
        body += "\n</section>"
    return RenderedMarkdown(
        source=path,
        title=title,
        summary=summary,
        body=body,
        sections=sections,
        references=references,
        embedded_assets=embedded_assets,
    )


def render_sources(paths: list[Path]) -> RenderedMarkdown:
    """Combine canonical Markdown documents into one portable guide without copying them."""

    references = ReferenceIndex()
    documents = [render_markdown(path, references) for path in paths]
    primary = documents[0]
    body = [primary.body]
    sections = list(primary.sections)
    embedded_assets = list(primary.embedded_assets)

    for document in documents[1:]:
        anchor = slugify(document.title)
        sections.append((anchor, document.title))
        sections.extend(document.sections)
        body.append(
            f'<section class="guide-section document-divider" id="{anchor}">'
            f"<h2>{html.escape(document.title)}</h2>"
            f"<p>{render_inline(document.summary, references, document.source)}</p>"
            "</section>"
        )
        body.append(document.body)
        embedded_assets.extend(document.embedded_assets)

    return RenderedMarkdown(
        source=primary.source,
        title=primary.title,
        summary=primary.summary,
        body="\n".join(body),
        sections=sections,
        references=references,
        embedded_assets=embedded_assets,
    )


def render_reference_index(references: ReferenceIndex) -> str:
    """Render links as inert text so recipients retain provenance offline."""

    if not references.targets:
        return ""
    items = []
    for number, (label, target) in enumerate(references.targets, start=1):
        kind = "Live URL" if re.match(r"https?://", target) else "Repository source"
        items.append(
            f'<li><span><strong>{html.escape(label)}</strong><small>{kind}</small></span>'
            f"<code>{html.escape(target)}</code></li>"
        )
    return (
        '<section class="guide-section reference-index" id="offline-reference-index">'
        "<h2>Offline reference index</h2>"
        "<p>These source locations are preserved as plain text for provenance. "
        "The guide does not load or link to them.</p>"
        f"<ol>{''.join(items)}</ol></section>"
    )


def stylesheet(accent: str, accent_2: str) -> str:
    return f"""
    :root {{
      color-scheme: dark;
      --bg: #080b12;
      --surface: #111622;
      --surface-2: #181f2e;
      --ink: #f7f8fc;
      --muted: #aab3c6;
      --faint: #778196;
      --line: rgba(255,255,255,.12);
      --accent: {accent};
      --accent-2: {accent_2};
      --radius: 22px;
      --sidebar: 278px;
    }}
    * {{ box-sizing: border-box; }}
    html {{ scroll-behavior: smooth; }}
    body {{
      margin: 0;
      color: var(--ink);
      background:
        radial-gradient(circle at 16% 0%, color-mix(in srgb, var(--accent-2) 22%, transparent), transparent 34rem),
        radial-gradient(circle at 88% 18%, color-mix(in srgb, var(--accent) 14%, transparent), transparent 32rem),
        var(--bg);
      font: 16px/1.65 ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }}
    a {{ color: var(--accent); text-underline-offset: 4px; }}
    code {{
      padding: .15rem .38rem;
      border: 1px solid var(--line);
      border-radius: 6px;
      color: #dce6ff;
      background: rgba(255,255,255,.055);
      font: .88em/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      overflow-wrap: anywhere;
    }}
    pre {{ margin: 24px 0; padding: 18px 20px; overflow-x: auto; border: 1px solid var(--line); border-radius: 14px; background: #080c14; }}
    pre code {{ padding: 0; border: 0; background: transparent; white-space: pre; }}
    .shell {{ width: min(1540px, calc(100% - 36px)); margin: 0 auto; }}
    .masthead {{
      position: sticky;
      z-index: 20;
      top: 0;
      border-bottom: 1px solid var(--line);
      background: rgba(8,11,18,.86);
      backdrop-filter: blur(18px);
    }}
    .masthead-inner {{
      display: flex;
      align-items: center;
      justify-content: space-between;
      min-height: 64px;
    }}
    .brand {{ display: flex; align-items: center; gap: 12px; font-weight: 750; letter-spacing: -.015em; }}
    .brand > img {{ width: 58px; height: 32px; object-fit: contain; }}
    .platform-logos {{ position: relative; z-index: 1; display: flex; align-items: center; gap: 18px; min-height: 54px; margin-bottom: 28px; }}
    .platform-logos img {{ display: block; max-width: 148px; height: 42px; object-fit: contain; border-radius: 0; background: transparent; }}
    .platform-logos .brand-logo-box {{ width: 76px; }}
    .platform-logos .brand-logo-salesforce {{ width: 128px; height: 46px; border-radius: 8px; }}
    .print-button {{
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 9px 15px;
      color: var(--ink);
      background: rgba(255,255,255,.06);
      font: inherit;
      white-space: nowrap;
      cursor: pointer;
    }}
    .layout {{ display: grid; grid-template-columns: var(--sidebar) minmax(0, 1fr); gap: 54px; align-items: start; }}
    .toc {{ position: sticky; top: 92px; padding: 36px 0; }}
    .toc strong {{ display: block; margin-bottom: 16px; color: var(--faint); font-size: .74rem; letter-spacing: .13em; text-transform: uppercase; }}
    .toc nav {{ display: grid; gap: 4px; }}
    .toc a {{
      display: block;
      padding: 9px 12px;
      border-left: 2px solid transparent;
      color: var(--muted);
      text-decoration: none;
      line-height: 1.3;
    }}
    .toc a:hover, .toc a:focus {{ border-left-color: var(--accent); color: var(--ink); background: rgba(255,255,255,.04); }}
    main {{ min-width: 0; padding: 52px 0 96px; }}
    .hero {{
      position: relative;
      overflow: hidden;
      min-height: 440px;
      padding: clamp(34px, 6vw, 76px);
      border: 1px solid var(--line);
      border-radius: 30px;
      background: linear-gradient(135deg, color-mix(in srgb, var(--accent-2) 24%, #111622), color-mix(in srgb, var(--accent) 12%, #0c1019));
      box-shadow: 0 34px 110px rgba(0,0,0,.28);
    }}
    .hero::after {{ content: ""; position: absolute; width: 420px; height: 420px; right: -130px; bottom: -210px; border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent); border-radius: 50%; box-shadow: 0 0 0 62px color-mix(in srgb, var(--accent-2) 8%, transparent), 0 0 0 124px color-mix(in srgb, var(--accent) 5%, transparent); }}
    .hero-copy {{ position: relative; z-index: 1; max-width: 920px; }}
    .scenario-label {{ color: var(--accent); font-weight: 700; }}
    h1 {{ margin: 20px 0 24px; max-width: 900px; font-size: clamp(3rem, 7vw, 6.8rem); line-height: .92; letter-spacing: -.062em; }}
    .hero .summary {{ max-width: 760px; color: #d2d8e5; font-size: clamp(1.08rem, 2vw, 1.35rem); }}
    .offline-note {{ display: inline-flex; margin-top: 34px; padding: 10px 14px; border: 1px solid var(--line); border-radius: 10px; color: var(--muted); background: rgba(0,0,0,.16); font-size: .88rem; }}
    .guide-content {{ padding: 26px 0 0; }}
    .guide-content > p:first-child {{ color: var(--muted); }}
    .guide-section {{ scroll-margin-top: 88px; padding: 68px 0; border-top: 1px solid var(--line); }}
    .guide-section:first-of-type {{ border-top: 0; }}
    h2 {{ margin: 0 0 28px; font-size: clamp(2rem, 4vw, 3.6rem); line-height: 1.02; letter-spacing: -.045em; }}
    h3 {{ margin: 44px 0 16px; color: var(--accent); font-size: 1.35rem; line-height: 1.2; }}
    h4 {{ margin: 30px 0 12px; font-size: 1.08rem; }}
    p, li {{ max-width: 88ch; }}
    li {{ margin: .55rem 0; padding-left: .35rem; }}
    ol, ul {{ padding-left: 1.4rem; }}
    strong {{ color: #fff; }}
    .source-ref {{ color: #dce6ff; border-bottom: 1px dotted var(--faint); }}
    .source-ref sup {{ margin-left: 3px; color: var(--accent); font-size: .68em; }}
    .table-scroll {{ margin: 28px 0; overflow-x: auto; border: 1px solid var(--line); border-radius: 16px; }}
    table {{ width: 100%; border-collapse: collapse; background: rgba(17,22,34,.72); }}
    th, td {{ padding: 15px 17px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }}
    th {{ color: var(--accent); background: rgba(255,255,255,.035); font-size: .78rem; letter-spacing: .08em; text-transform: uppercase; }}
    tbody tr:last-child td {{ border-bottom: 0; }}
    .product-shot {{ margin: 28px 0 52px; padding: 13px; border: 1px solid var(--line); border-radius: var(--radius); background: linear-gradient(145deg, var(--surface-2), var(--surface)); box-shadow: 0 24px 76px rgba(0,0,0,.25); }}
    .zoom-trigger {{ position: relative; display: block; width: 100%; padding: 0; overflow: hidden; border: 0; border-radius: 13px; color: var(--ink); background: transparent; cursor: zoom-in; text-align: left; }}
    .product-shot img {{ display: block; width: 100%; height: auto; border: 1px solid rgba(255,255,255,.1); border-radius: 13px; background: #fff; }}
    .product-shot img.diagram {{ max-height: 780px; object-fit: contain; }}
    .zoom-hint {{ position: absolute; right: 14px; bottom: 14px; padding: 8px 11px; border: 1px solid rgba(255,255,255,.24); border-radius: 999px; color: #fff; background: rgba(8,11,18,.82); box-shadow: 0 8px 24px rgba(0,0,0,.28); font-size: .78rem; font-weight: 700; opacity: .88; transition: opacity .16s ease, transform .16s ease; }}
    .zoom-trigger:hover .zoom-hint, .zoom-trigger:focus-visible .zoom-hint {{ opacity: 1; transform: translateY(-2px); }}
    .product-shot figcaption {{ padding: 11px 4px 0; color: var(--faint); font-size: .78rem; }}
    .image-modal {{ width: min(96vw, 1680px); height: 94vh; max-width: none; max-height: none; padding: 0; overflow: hidden; border: 1px solid var(--line); border-radius: 20px; color: var(--ink); background: #090d15; box-shadow: 0 36px 140px rgba(0,0,0,.72); }}
    .image-modal::backdrop {{ background: rgba(2,4,8,.84); backdrop-filter: blur(8px); }}
    .modal-frame {{ display: grid; grid-template-rows: auto minmax(0, 1fr); height: 100%; }}
    .modal-toolbar {{ display: flex; align-items: center; justify-content: space-between; gap: 20px; min-height: 62px; padding: 12px 16px 12px 22px; border-bottom: 1px solid var(--line); background: var(--surface); }}
    .modal-toolbar strong {{ overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }}
    .modal-close {{ flex: none; padding: 9px 13px; border: 1px solid var(--line); border-radius: 999px; color: var(--ink); background: rgba(255,255,255,.06); font: inherit; cursor: pointer; }}
    .modal-canvas {{ overflow: auto; padding: 22px; background: #05070c; }}
    .modal-canvas img {{ display: block; width: auto; min-width: min(1200px, 90vw); max-width: none; height: auto; margin: 0 auto; border-radius: 12px; background: #fff; }}
    .modal-canvas img.diagram {{ width: 1200px; min-width: 1200px; }}
    .reference-index > ol {{ display: grid; gap: 10px; padding: 0; list-style: none; counter-reset: refs; }}
    .reference-index li {{ counter-increment: refs; display: grid; grid-template-columns: minmax(190px, .65fr) minmax(0, 1.35fr); gap: 18px; max-width: none; padding: 16px 0; border-bottom: 1px solid var(--line); }}
    .reference-index li::before {{ content: counter(refs); color: var(--accent); font-weight: 750; }}
    .reference-index li {{ grid-template-columns: 30px minmax(190px, .65fr) minmax(0, 1.35fr); }}
    .reference-index span {{ display: grid; }}
    .reference-index small {{ color: var(--faint); }}
    footer {{ padding: 28px 0 58px; border-top: 1px solid var(--line); color: var(--faint); font-size: .86rem; }}
    @media (max-width: 980px) {{
      .layout {{ grid-template-columns: 1fr; gap: 0; }}
      .toc {{ position: relative; top: auto; padding: 28px 0 0; }}
      .toc nav {{ grid-template-columns: repeat(2, minmax(0, 1fr)); }}
      .toc a {{ border-left: 0; border-bottom: 1px solid var(--line); }}
      main {{ padding-top: 32px; }}
    }}
    @media (max-width: 620px) {{
      .shell {{ width: min(100% - 24px, 1540px); }}
      .masthead-inner {{ min-height: 56px; }}
      .brand-label {{ font-size: 0; }}
      .brand-label::after {{ content: "Crestline LOS Guide"; font-size: .88rem; }}
      .print-button {{ padding: 7px 10px; font-size: .82rem; }}
      .toc {{ display: none; }}
      .hero {{ min-height: 360px; padding: 30px 24px; border-radius: 20px; }}
      h1 {{ font-size: clamp(2.7rem, 15vw, 4.4rem); }}
      .guide-section {{ padding: 50px 0; }}
      .reference-index li {{ grid-template-columns: 24px 1fr; }}
      .reference-index li code {{ grid-column: 2; }}
      .image-modal {{ width: 100vw; height: 100dvh; border: 0; border-radius: 0; }}
      .modal-toolbar {{ min-height: 56px; padding-left: 14px; }}
      .modal-canvas {{ padding: 12px; }}
      .modal-canvas img.diagram {{ width: 1000px; min-width: 1000px; }}
    }}
    @media print {{
      :root {{ color-scheme: light; }}
      body {{ color: #151821; background: #fff; font-size: 10pt; }}
      .masthead, .toc, .print-button, .zoom-hint, .image-modal {{ display: none !important; }}
      .layout {{ display: block; }}
      main {{ padding: 0; }}
      .hero {{ min-height: 0; padding: 30pt; border: 1px solid #bbb; color: #111; background: #f2f5fa; box-shadow: none; break-after: page; }}
      .hero::after {{ display: none; }}
      .hero .summary, .scenario-label, .offline-note {{ color: #333; }}
      h1, h2, h3, h4, strong {{ color: #111; }}
      a, .source-ref, .reference-index li::before {{ color: #245ec7; }}
      code {{ color: #222; background: #f3f3f3; border-color: #ccc; }}
      .guide-section {{ padding: 24pt 0; border-color: #ccc; }}
      .product-shot {{ break-inside: avoid; padding: 5pt; border-color: #bbb; background: #fff; box-shadow: none; }}
      table {{ background: #fff; }}
      th {{ color: #111; background: #eee; }}
      th, td {{ border-color: #ccc; }}
      footer {{ color: #555; border-color: #ccc; }}
    }}
    """


def build_scenario(scenario: dict[str, object]) -> Path:
    if "sources" in scenario:
        rendered = render_sources([Path(path) for path in scenario["sources"]])
    else:
        rendered = render_markdown(Path(scenario["source"]))
    toc = "".join(
        f'<a href="#{html.escape(anchor, quote=True)}">{html.escape(label)}</a>'
        for anchor, label in rendered.sections
    )
    toc += '<a href="#offline-reference-index">Offline reference index</a>'
    summary_html = render_inline(rendered.summary, rendered.references, rendered.source)
    reference_index = render_reference_index(rendered.references)
    document = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark light">
  <title>Crestline LOS · {html.escape(rendered.title)} Demo Guide</title>
  <style>{stylesheet(str(scenario['accent']), str(scenario['accent_2']))}</style>
</head>
<body>
  <header class="masthead">
    <div class="shell masthead-inner">
      <div class="brand"><img data-brand-logo="box" src="{data_uri(BRAND_ASSETS / 'box-logo-blue.svg')}" alt="Box"><span class="brand-label">Crestline Bank · LOS Demo Guide</span></div>
      <button class="print-button" type="button" onclick="window.print()">Print / Save PDF</button>
    </div>
  </header>
  <div class="shell layout">
    <aside class="toc">
      <strong>On this page</strong>
      <nav aria-label="Guide sections">{toc}</nav>
    </aside>
    <main>
      <section class="hero" id="top">
        <div class="hero-copy">
          <div class="platform-logos" aria-label="Platforms in this scenario">{brand_logos(tuple(scenario['brands']))}</div>
          <div class="scenario-label">{html.escape(str(scenario['label']))}</div>
          <h1>{html.escape(rendered.title)}</h1>
          <p class="summary">{summary_html}</p>
          <div class="offline-note">Portable edition · All styles, diagrams, and screenshots embedded</div>
        </div>
      </section>
      <article class="guide-content">
        {rendered.body}
        {reference_index}
      </article>
    </main>
  </div>
  <dialog class="image-modal" id="image-modal" aria-labelledby="image-modal-title">
    <div class="modal-frame">
      <div class="modal-toolbar">
        <strong id="image-modal-title">Expanded demo image</strong>
        <button class="modal-close" type="button">Close</button>
      </div>
      <div class="modal-canvas"><img alt=""></div>
    </div>
  </dialog>
  <footer><div class="shell">Self-contained scenario guide · Generated from the canonical Markdown without modifying it · No external assets or links</div></footer>
  <script>
    (() => {{
      const dialog = document.querySelector("#image-modal");
      const modalImage = dialog.querySelector(".modal-canvas img");
      const modalTitle = dialog.querySelector("#image-modal-title");
      const closeButton = dialog.querySelector(".modal-close");
      document.querySelectorAll(".zoom-trigger").forEach((trigger) => {{
        trigger.addEventListener("click", () => {{
          const source = trigger.querySelector("img");
          modalImage.src = source.currentSrc || source.src;
          modalImage.alt = source.alt;
          modalImage.className = source.className;
          modalTitle.textContent = source.alt;
          dialog.showModal();
          closeButton.focus();
        }});
      }});
      closeButton.addEventListener("click", () => dialog.close());
      dialog.addEventListener("click", (event) => {{
        if (event.target === dialog) dialog.close();
      }});
      dialog.addEventListener("close", () => modalImage.removeAttribute("src"));
    }})();
  </script>
</body>
</html>
"""
    OUTPUT.mkdir(parents=True, exist_ok=True)
    output_path = OUTPUT / f"{scenario['order']}-{scenario['slug']}-guide.html"
    output_path.write_text(document, encoding="utf-8")
    validate_document(output_path, rendered)
    return output_path


class PortableHTMLValidator(HTMLParser):
    """Reject any network or filesystem dependency in a generated guide."""

    def __init__(self) -> None:
        super().__init__()
        self.errors: list[str] = []
        self.images = 0
        self.brand_images = 0
        self.zoom_triggers = 0
        self.dialogs = 0
        self.sections: set[str] = set()

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        if tag == "img":
            src = attributes.get("src")
            if src:
                self.images += 1
                if attributes.get("data-brand-logo"):
                    self.brand_images += 1
                if not src.startswith("data:image/"):
                    self.errors.append(f"non-embedded image: {src}")
        classes = (attributes.get("class") or "").split()
        if "zoom-trigger" in classes:
            self.zoom_triggers += 1
        if tag == "dialog":
            self.dialogs += 1
        if tag in {"link", "iframe"} or (tag == "script" and attributes.get("src")):
            self.errors.append(f"external-capable element: {tag}")
        href = attributes.get("href")
        if href is not None and not href.startswith("#"):
            self.errors.append(f"non-page href: {href}")
        element_id = attributes.get("id")
        if element_id:
            self.sections.add(element_id)


def validate_document(path: Path, rendered: RenderedMarkdown) -> None:
    parser = PortableHTMLValidator()
    parser.feed(path.read_text(encoding="utf-8"))
    expected_sections = {anchor for anchor, _ in rendered.sections}
    missing_sections = expected_sections - parser.sections
    content_images = parser.images - parser.brand_images
    if content_images != len(rendered.embedded_assets):
        parser.errors.append(
            f"embedded content image count {content_images} != {len(rendered.embedded_assets)}"
        )
    if parser.zoom_triggers != len(rendered.embedded_assets):
        parser.errors.append(
            f"zoom trigger count {parser.zoom_triggers} != {len(rendered.embedded_assets)}"
        )
    if parser.dialogs != 1:
        parser.errors.append(f"image modal count {parser.dialogs} != 1")
    if missing_sections:
        parser.errors.append(f"missing sections: {sorted(missing_sections)}")
    if parser.errors:
        raise ValueError(f"{path}: " + "; ".join(parser.errors))


def build() -> None:
    for scenario in SCENARIOS:
        output = build_scenario(scenario)
        print(f"{output.relative_to(ROOT)} ({output.stat().st_size:,} bytes)")


if __name__ == "__main__":
    build()
