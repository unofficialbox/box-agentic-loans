#!/usr/bin/env python3
"""Package the existing guide, fonts, images, and GitHub resource links in one HTML."""
import base64
import hashlib
import html
import json
import mimetypes
from pathlib import Path
import re
from urllib.parse import quote, unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
GUIDE = ROOT / 'docs/demo-storyboard'
REPO_URL = 'https://github.com/unofficialbox/box-claudeforce-loans/blob/main/'


def build(source=GUIDE / 'index.html', destination=GUIDE / 'standalone.html'):
    source = Path(source)
    assets = {}

    def register(url):
        parsed = urlsplit(html.unescape(url))
        if parsed.scheme or parsed.netloc or not parsed.path:
            return None
        path = (source.parent / unquote(parsed.path)).resolve()
        if not path.is_relative_to(ROOT):
            raise ValueError(f'Resource outside repository: {url}')
        data = path.read_bytes()
        key = hashlib.sha256(data).hexdigest()
        mime = mimetypes.guess_type(path.name)[0] or 'application/octet-stream'
        if path.suffix == '.md':
            mime = 'text/markdown'
        assets.setdefault(key, {'mime': mime, 'data': base64.b64encode(data).decode()})
        return key, path.name, mime

    def attribute(match):
        name, url = match.groups()
        parsed = urlsplit(html.unescape(url))
        if parsed.scheme or parsed.netloc or not parsed.path:
            return match.group(0)
        if name == 'href':
            path = (source.parent / unquote(parsed.path)).resolve()
            relative = path.relative_to(ROOT).as_posix()
            target = REPO_URL + quote(relative, safe='/')
            if parsed.fragment:
                target += '#' + parsed.fragment
            return f'href="{html.escape(target, quote=True)}" target="_blank" rel="noopener"'
        key, _, _ = register(url)
        return f'data-embedded-src="{key}"'

    content = source.read_text()
    content = re.sub(r'\b(href|src)="([^"]+)"', attribute, content)

    def font(match):
        asset = register(match.group(2))
        if asset is None:
            return match.group(0)
        key, _, mime = asset
        # CSS fonts need a URL before the document scripts run.
        return f'url("data:{mime};base64,{assets[key]["data"]}")'

    content = re.sub(r"url\(([\"'])(.*?)\1\)", font, content)
    payload = json.dumps(assets, separators=(',', ':'))
    runtime = '''
<script id="embedded-files" type="application/json">''' + payload + '''</script>
<script>
(() => {
  const files = JSON.parse(document.getElementById('embedded-files').textContent);
  const urls = new Map();
  function fileUrl(key) {
    if (!urls.has(key)) {
      const file = files[key];
      const bytes = Uint8Array.from(atob(file.data), char => char.charCodeAt(0));
      urls.set(key, URL.createObjectURL(new Blob([bytes], {type: file.mime})));
    }
    return urls.get(key);
  }
  document.querySelectorAll('[data-embedded-src]').forEach(image => { image.src = fileUrl(image.dataset.embeddedSrc); });
})();
</script>
'''
    content = content.replace('</html>', runtime + '</html>')
    Path(destination).write_text(content)
    return len(assets)


if __name__ == '__main__':
    count = build()
    print(f'Created standalone.html with {count} embedded files.')
