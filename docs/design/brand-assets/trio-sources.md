# Trio logo sources

- Box: existing `box-logo-blue.svg`.
- Claude: inline SVG from https://claude.com (includes symbol and wordmark).
- Salesforce: https://wp.sfdcdigital.com/en-us/wp-content/uploads/sites/4/2024/11/logo-salesforce.svg
- Amazon Quick: `amazon-quick-icon.svg` is the official AWS Architecture Icon for Amazon Quick Suite (https://aws.amazon.com/architecture/icons/, `Arch_Amazon-Quick-Suite_64.svg`), used unchanged; the "Amazon Quick" wordmark beside it is outlined Inter Display, not supplied artwork.
- Agentforce: https://brand.salesforce.com/in/guidelines/agentforce — `agentforce-logo.svg` is the supplied artwork; `agentforce-wordmark.svg` removes the background, trims the viewBox, and uses the purple treatment from the reference slide.

The trio embeds SVG paths, with no screenshot crops or shadow filters. Inter and Inter Display labels are outlined from the bundled fonts by `scripts/build_demo_trio.py`.
