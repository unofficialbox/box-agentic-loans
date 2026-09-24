import { describe, expect, it } from "vitest";
import { docGenProblem } from "../src/mcpTools.js";

describe("Doc Gen readiness problems", () => {
  it("reads a missing scope as a permission problem, with the fix", () => {
    const problem = docGenProblem(
      "template",
      "1",
      "Box get_docgen_template_by_id: Access denied. Please check your permissions and ensure you have the required scopes to perform this operation."
    );
    expect(problem).toMatchObject({ what: "template", ok: false });
    expect(problem.detail).toMatch(/^The Box sign-in isn't allowed to use Doc Gen \(Box: Access denied/);
    expect(problem.fix).toMatch(/docgen\.readwrite/);
  });

  it("reads not found as the template or folder not being visible to this user", () => {
    const template = docGenProblem("template", "2482573818840", "Box get_docgen_template_by_id: Item not found");
    expect(template.detail).toBe("Template 2482573818840 isn't a Doc Gen template the signed-in Box user can open (Box: Item not found).");
    expect(template.fix).toMatch(/LOS_DOCGEN_TEMPLATE_FILE_ID/);
    const folder = docGenProblem("folder", "414659140160", "Box get_folder_details: Item not found");
    expect(folder.detail).toMatch(/^The loan folder 414659140160 isn't visible/);
    expect(folder.fix).toMatch(/Editor/);
  });

  it("passes anything else through with Box's own words", () => {
    expect(docGenProblem("folder", "9", "Box get_folder_details: Internal Server Error").detail).toBe(
      "Box couldn't confirm the loan folder (Box: Internal Server Error)."
    );
  });
});
