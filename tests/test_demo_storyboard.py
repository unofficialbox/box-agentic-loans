"""Check the generated guide's navigation and local presentation dependencies."""
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import subprocess
import unittest
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
GUIDE = ROOT / 'docs/demo-storyboard'

class Page(HTMLParser):
    def __init__(self, content):
        super().__init__(); self.tags = []; self.feed(content)
    def handle_starttag(self, tag, attrs):
        self.tags.append((tag, dict(attrs)))

class DemoStoryboardTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.content = (GUIDE / 'index.html').read_text()
        cls.page = Page(cls.content)

    def test_links_and_assets_resolve(self):
        ids = {a['id'] for _,a in self.page.tags if 'id' in a}
        for _,attrs in self.page.tags:
            for attr in ['href','src']:
                value = attrs.get(attr)
                if not value: continue
                parsed = urlsplit(value)
                if parsed.scheme: continue
                if parsed.path:
                    self.assertTrue((GUIDE / unquote(parsed.path)).is_file(), value)
                elif parsed.fragment:
                    self.assertIn(parsed.fragment, ids)

    def test_three_sections_and_all_steps(self):
        tabs = [a for _,a in self.page.tags if a.get('role') == 'tab']
        self.assertEqual([a['data-panel'] for a in tabs], ['storyboard','setup','resources'])
        self.assertEqual([a['aria-selected'] for a in tabs], ['true','false','false'])
        panels = {a['id']: a for _,a in self.page.tags if a.get('role') == 'tabpanel'}
        self.assertNotIn('hidden', panels['storyboard'])
        self.assertIn('hidden', panels['setup'])
        steps = json.loads((GUIDE/'storyboard.json').read_text())
        ids = [a.get('id') for _,a in self.page.tags]
        for step in steps:
            self.assertIn(f"step-{step['number']}", ids)
            self.assertLessEqual(len(step['land'].split()), 15)
        self.assertEqual(self.content.count('Tell — business value'), 13)

    def test_step_navigation_matches_the_storyboard(self):
        steps = json.loads((GUIDE/'storyboard.json').read_text())
        nav = self.content.split('aria-label="Storyboard steps">', 1)[1].split('</nav>', 1)[0]
        links = [a['href'] for tag,a in Page(nav).tags if tag == 'a']
        self.assertEqual(links, [f"#step-{step['number']}" for step in steps])
        for step in steps:
            self.assertIn(step['title'], nav)

    def test_claude_captures_are_distinct(self):
        steps = json.loads((GUIDE/'storyboard.json').read_text())
        digests = []
        for n in [5,6,8]:
            pair = steps[n-1]['captures']
            self.assertEqual([c['label'] for c in pair], ['Prompt','Result'])
            digests += [hashlib.sha256((GUIDE/c['path']).read_bytes()).hexdigest() for c in pair]
        self.assertEqual(len(set(digests)), 6)

    def test_tab_interactions(self):
        # Execute the shipped navigation script against a minimal DOM; no browser or network.
        script = self.content.split('<script>')[1].split('</script>')[0]
        harness = r'''
const assert = require('node:assert/strict');
const names = ['storyboard','setup','resources'];
const panels = Object.fromEntries(names.map(id => [id,{hidden:id!=='storyboard'}]));
let focused;
const tabs = names.map(name => ({dataset:{panel:name}, attrs:{}, events:{},
 setAttribute(k,v){this.attrs[k]=v}, addEventListener(k,v){this.events[k]=v}, focus(){focused=name}}));
global.document={querySelectorAll:()=>tabs,getElementById:id=>panels[id]};
global.location={hash:''};
global.history={replaceState(a,b,hash){location.hash=hash}};
const events={};global.window={addEventListener:(name,fn)=>events[name]=fn};
'''.replace('const tabs =', 'const mockTabs =').replace('()=>tabs,','()=>mockTabs,')
        assertions = r'''
function selected(name){
 assert.equal(mockTabs.filter(t=>t.attrs['aria-selected']==='true').length,1);
 for(const t of mockTabs)assert.equal(panels[t.dataset.panel].hidden,t.dataset.panel!==name);
}
selected('storyboard');
mockTabs[2].events.click();selected('resources');assert.equal(location.hash,'#resources');
mockTabs[2].events.keydown({key:'ArrowRight',preventDefault(){}});selected('storyboard');assert.equal(focused,'storyboard');
mockTabs[0].events.keydown({key:'End',preventDefault(){}});selected('resources');
location.hash='#setup';events.hashchange();selected('setup');
location.hash='#storyboard';events.hashchange();selected('storyboard');
location.hash='#invalid';events.hashchange();selected('storyboard');
'''
        result = subprocess.run(['node','-e',harness+'\n'+script+'\n'+assertions],capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stderr)
