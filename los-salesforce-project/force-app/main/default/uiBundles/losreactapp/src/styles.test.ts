import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

/**
 * Our stylesheet and box-ui-elements' share one global cascade.
 *
 * box-ui-elements ships plain, unscoped class names in `dist/*.css`, and its elements are
 * lazy chunks -- so its rules land *after* ours at equal specificity and win every
 * property they both set. `.modal-backdrop` was the one that bit: theirs carries
 * `z-index: -1`, which painted the upload dialog behind the page it was covering, and no
 * amount of z-index or portalling on our side could outrank a rule that simply came last.
 *
 * The fix is to not share names. This is the guard, because the collision is invisible in
 * review: both files read correctly on their own.
 */

const CLASS_PATTERN = /\.([a-zA-Z][\w-]*)/g;

/** Comments name classes in prose -- including this collision's own explanation. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function classNames(css: string): Set<string> {
  return new Set([...stripComments(css).matchAll(CLASS_PATTERN)].map((match) => match[1]));
}

/**
 * `.be*` are box-ui-elements' own classes, which we deliberately target to tame the
 * element's chrome. Every one is scoped under `.box-element-host`, so it reaches only the
 * element we mounted and cannot leak back the other way.
 */
const DELIBERATE = new Set(["be", "be-header", "be-logo"]);

describe("styles.css", () => {
  test("shares no class name with box-ui-elements", () => {
    const ours = classNames(readFileSync(join(__dirname, "styles.css"), "utf8"));

    const vendorDir = join(__dirname, "..", "node_modules", "box-ui-elements", "dist");
    const theirs = new Set<string>();
    for (const file of readdirSync(vendorDir).filter((name) => name.endsWith(".css"))) {
      for (const name of classNames(readFileSync(join(vendorDir, file), "utf8"))) {
        theirs.add(name);
      }
    }
    // A guard against the fixture of a guard: if the vendor CSS ever stops being found,
    // an empty set would make this test pass by knowing nothing.
    expect(theirs.size).toBeGreaterThan(100);

    const collisions = [...ours].filter((name) => theirs.has(name) && !DELIBERATE.has(name));
    expect(collisions).toEqual([]);
  });

  test("scopes every class it shares with box-ui-elements on purpose", () => {
    const css = stripComments(readFileSync(join(__dirname, "styles.css"), "utf8"));
    for (const name of DELIBERATE) {
      const rules = css.split("\n").filter((line) => new RegExp(`\\.${name}(?![\\w-])`).test(line));
      expect(rules.length).toBeGreaterThan(0);
      for (const rule of rules) expect(rule).toContain(".box-element-host");
    }
  });
});

/**
 * The palette is the identity. Every hue the page uses is a token on :root, so the whole
 * look can be read in one block -- and so the navy-and-blue CLM portal this app was
 * forked from cannot creep back one hex code at a time.
 */
describe("Acme Bank identity", () => {
  const css = stripComments(readFileSync(join(__dirname, "styles.css"), "utf8"));
  const root = css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {")));

  test("declares the palette as custom properties on :root", () => {
    const expected: Record<string, string> = {
      "--ab-ink": "#1B2A2F",
      "--ab-bg": "#F6F3EC",
      "--ab-surface": "#FFFFFF",
      "--ab-line": "#E4DED2",
      "--ab-green": "#0F4C45",
      "--ab-green-deep": "#0A332E",
      "--ab-amber": "#C9871A",
      "--ab-success": "#2E7D5B",
      "--ab-warning": "#B8641B",
      "--ab-danger": "#A93A3A",
      "--ab-muted": "#6B7470",
    };
    for (const [token, value] of Object.entries(expected)) {
      expect(root).toMatch(new RegExp(`${token}:\\s*${value};`, "i"));
    }
  });

  test("uses a serif stack for headings and keeps Lato for the body", () => {
    expect(root).toMatch(/--ab-serif:\s*"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;/);
    expect(root).toMatch(/--ab-sans:\s*Lato,/);
    expect(css).toMatch(/h1, h2, h3 \{ font-family: var\(--ab-serif\);/);
  });

  test("carries none of the CLM portal's colours", () => {
    // Navy top bar, blue square mark, blue focus rings. If any of these is back, so is
    // the resemblance.
    for (const old of ["#071b33", "#1166e8", "#4d9aff", "#2f6fd0", "#2a78d6"]) {
      expect(css.toLowerCase()).not.toContain(old);
    }
  });

  test("no source file mentions Headless 360", () => {
    const srcDir = __dirname;
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        // Tests may name the phrase in order to assert its absence; sources may not.
        else if (/\.(tsx?|css|html)$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name)) {
          if (readFileSync(path, "utf8").includes("Headless 360")) offenders.push(path);
        }
      }
    };
    walk(srcDir);
    walk(join(srcDir, "..", "e2e"));
    expect(offenders).toEqual([]);
    expect(readFileSync(join(srcDir, "..", "index.html"), "utf8")).not.toContain("Headless 360");
  });
});
