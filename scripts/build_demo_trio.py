#!/usr/bin/env python3
"""Build the storyboard trio with original logo artwork and outlined Inter type."""
from pathlib import Path
import xml.etree.ElementTree as ET
from html import escape
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/demo-storyboard'
FONTS = {k: TTFont(OUT / 'fonts' / v) for k,v in {
    'body':'Inter-Regular.ttf', 'bold':'Inter-SemiBold.ttf',
    'display':'InterDisplay-SemiBold.ttf'}.items()}
parts = ['<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1600" height="900" viewBox="0 0 1600 900" role="img"><title>Box, Claude, and Salesforce: the loan origination team</title><desc>Box manages content and intelligence. Claude reasons and orchestrates through MCP. Salesforce governs loan records and actions. People approve.</desc><rect width="1600" height="900" fill="white"/>']
def text(s,x,y,size=22,font='body',fill='#151b26',anchor='start'):
    f=FONTS[font]; gs=f.getGlyphSet(); cmap=f.getBestCmap(); scale=size/f['head'].unitsPerEm
    width=sum(gs[cmap[ord(c)]].width for c in s)*scale
    if anchor=='middle': x-=width/2
    paths=[]; at=0
    for c in s:
        g=gs[cmap[ord(c)]]; pen=SVGPathPen(gs);g.draw(pen)
        paths.append(f'<path transform="translate({at} 0)" d="{pen.getCommands()}"/>');at+=g.width
    parts.append(f'<g aria-label="{escape(s)}" fill="{fill}" transform="translate({x} {y}) scale({scale} {-scale})">'+''.join(paths)+'</g>')
def rect(x,y,w,h,color,fill='white',r=22):
    parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}" stroke="{color}" stroke-width="1.5"/>')
def logo(x,y,w,h,name):
    asset = ET.parse(ROOT/'docs/design/brand-assets'/name).getroot()
    asset.set('x',str(x)); asset.set('y',str(y))
    asset.set('width',str(w)); asset.set('height',str(h))
    asset.set('preserveAspectRatio','xMidYMid meet')
    # Scope asset CSS and IDs so separately authored vectors cannot collide.
    prefix = name.replace('.svg','')+'-'
    markup = ET.tostring(asset,encoding='unicode')
    import re
    for ident in set(re.findall(r'id="([^"]+)"',markup)):
        markup=markup.replace('id="'+ident+'"','id="'+prefix+ident+'"').replace('#'+ident,'#'+prefix+ident)
    for cls in set(re.findall(r'class="([^"]+)"',markup)):
        markup=markup.replace('class="'+cls+'"','class="'+prefix+cls+'"').replace('.'+cls,'.'+prefix+cls)
    parts.append(markup)
text('One loan. Three connected platforms.',80,89,44,'display')
text('Content intelligence meets governed action.',80,133,23,fill='#667085')
# Three connected surfaces, preserving the reference palette and logo artwork.
for x,w,c,bg in [(80,420,'#0061ff','#ffffff'),(590,420,'#d97757','#fffdfa'),(1100,420,'#00a1e0','#f9fdff')]:
    rect(x,211,w,490,c,bg)
logo(244,242,92,50,'box-logo-blue.svg')
logo(690,245,220,50,'claude-logo.svg')
logo(1176,242,80,56,'salesforce-logo.svg')
logo(1270,253,174,34,'agentforce-wordmark.svg')
for a,b in [(500,590),(1010,1100)]:
    parts.append(f'<path d="M {a} 456 H {b}" stroke="#00b894" stroke-width="2"/>')
    for x in [a,b]:parts.append(f'<circle cx="{x}" cy="456" r="5" fill="#00b894"/>')
    text('MCP',(a+b)/2,431,16,'bold','#16876b','middle')
for center,label in [(290,'Content & intelligence'),(800,'Reason & orchestrate'),(1310,'Records & control')]:text(label,center,354,28,'display',anchor='middle')
rows=[(114,[('Understand the loan file','Box AI · Box Extract · Box Hubs'),('Generate and execute','Box Doc Gen · Box Sign'),('Keep the signed record','Box Metadata · Box for Salesforce')]),(624,[('Understand the request','Natural language + source context'),('Recommend the next action','Cited analysis · Human confirmation'),('Coordinate both platforms','Box MCP + Salesforce hosted MCP')]),(1134,[('Capture the application','React Multi-Framework site'),('Apply approved changes','Salesforce Platform · Apex'),('Close the loan','Verified signature → Closed')])]
for x,items in rows:
    for i,(title,detail) in enumerate(items):
        y=425+i*91
        text(title,x,y,22,'bold');text(detail,x,y+32,18,fill='#667085')
        if i<2:parts.append(f'<path d="M {x} {y+52} H {x+352}" stroke="#e5e9ef"/>')
for x,label in [(290,'Unstructured data in Box'),(800,'Agent Experience in Claude'),(1310,'Structured data in Headless360')]:
    text(label,x,841,23,'display',anchor='middle')
parts.append('</svg>')
(OUT/'platform-trio.svg').write_text(''.join(parts))
