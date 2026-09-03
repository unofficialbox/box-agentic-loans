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
