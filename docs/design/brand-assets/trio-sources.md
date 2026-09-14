# Trio logo sources

- Box: existing `box-logo-blue.svg`.
- Claude: inline SVG from https://claude.com (includes symbol and wordmark).
- Salesforce: https://wp.sfdcdigital.com/en-us/wp-content/uploads/sites/4/2024/11/logo-salesforce.svg
- Amazon Quick: `amazon-quick-icon.svg` wraps the Amazon Quick desktop app icon (supplied `icon.icns`, 512 px rendition cropped to its rounded tile) as an embedded PNG, since no vector artwork was supplied; the "Amazon Quick" wordmark beside it is outlined Inter Display. The card accent `#b800b8` is sampled from the icon's gradient.
- Agentforce: https://brand.salesforce.com/in/guidelines/agentforce — `agentforce-logo.svg` is the supplied artwork; `agentforce-wordmark.svg` removes the background, trims the viewBox, and uses the purple treatment from the reference slide.

The trio embeds SVG paths, with no screenshot crops or shadow filters. Inter and Inter Display labels are outlined from the bundled fonts by `scripts/build_demo_trio.py`.
