import { describe, expect, test } from "vitest";
import type { BoxFolderItem } from "./box";
import { byDocumentType, byMostRecent, documentFacts, documentTotals, formatDate } from "./documents";

function file(over: Partial<BoxFolderItem> & { id: string }): BoxFolderItem {
  return { name: `${over.id}.pdf`, type: "file", ...over };
}

describe("documentFacts", () => {
  test("prefers the document's own change date over the upload's", () => {
    // Everything in a seeded folder shares an upload minute. content_modified_at is when
    // the document actually changed, which is what a reader means by "last modified".
    const facts = documentFacts(
      file({ id: "a", modified_at: "2026-09-01T17:08:11Z", content_modified_at: "2026-08-21T15:10:00Z" }),
    );
    expect(facts.changedAt).toBe("2026-08-21T15:10:00Z");
  });

  test("falls back to the upload date when Box has no content date", () => {
    expect(documentFacts(file({ id: "a", modified_at: "2026-09-01T17:08:11Z" })).changedAt)
      .toBe("2026-09-01T17:08:11Z");
  });

  test("counts only approved and executed as approved", () => {
    const status = (s?: string) =>
      documentFacts(file({ id: "a", metadata: { enterprise: { losDocument: { versionStatus: s } } } })).approved;
    expect(status("Approved")).toBe(true);
    expect(status("Executed")).toBe(true);
    expect(status("Draft")).toBe(false);
    expect(status("Internal")).toBe(false);
    expect(status(undefined)).toBe(false);
  });
});

describe("byMostRecent", () => {
  test("orders newest first and leaves the caller's array alone", () => {
    // The table renders the folder's own order; reordering it underneath would make the
    // table and the timeline disagree about which document is which.
    const input = [
      file({ id: "old", content_modified_at: "2026-06-15T10:20:00Z" }),
      file({ id: "new", content_modified_at: "2026-08-21T15:10:00Z" }),
    ];
    expect(byMostRecent(input).map((f) => f.id)).toEqual(["new", "old"]);
    expect(input.map((f) => f.id)).toEqual(["old", "new"]);
  });

  test("puts documents with no date last rather than dropping them", () => {
    const ordered = byMostRecent([
      file({ id: "undated" }),
      file({ id: "dated", content_modified_at: "2026-06-15T10:20:00Z" }),
    ]);
    expect(ordered.map((f) => f.id)).toEqual(["dated", "undated"]);
  });
});

describe("formatDate", () => {
  test("renders an em dash rather than Invalid Date", () => {
    expect(formatDate(undefined)).toBe("—");
    expect(formatDate("not-a-date")).toBe("—");
  });
});

describe("documentTotals", () => {
  test("splits approved from open and reports the latest change", () => {
    const totals = documentTotals([
      file({ id: "a", content_modified_at: "2026-06-15T10:20:00Z",
             metadata: { enterprise: { losDocument: { versionStatus: "Approved" } } } }),
      file({ id: "b", content_modified_at: "2026-08-21T15:10:00Z",
             metadata: { enterprise: { losDocument: { versionStatus: "Draft" } } } }),
    ]);
    expect(totals).toEqual({
      documents: 2, approved: 1, open: 1, lastChangedAt: "2026-08-21T15:10:00Z",
    });
  });

  test("survives a package where nothing carries a date", () => {
    expect(documentTotals([file({ id: "a" })]).lastChangedAt).toBeUndefined();
  });
});

describe("byDocumentType", () => {
  test("counts by type, largest first, ties on label", () => {
    expect(
      byDocumentType([
        file({ id: "a", metadata: { enterprise: { losDocument: { documentType: "Appraisal" } } } }),
        file({ id: "b", metadata: { enterprise: { losDocument: { documentType: "Financial Statement" } } } }),
        file({ id: "c", metadata: { enterprise: { losDocument: { documentType: "Financial Statement" } } } }),
      ]),
    ).toEqual([
      { label: "Financial Statement", value: 2 },
      { label: "Appraisal", value: 1 },
    ]);
  });

  test("names an untagged file rather than dropping it from its own breakdown", () => {
    expect(byDocumentType([file({ id: "a" })])).toEqual([{ label: "Unclassified", value: 1 }]);
  });
});
