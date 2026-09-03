import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { useIntl } from "react-intl";
import { UploadDialog } from "./UploadDialog";

/**
 * Stands in for ContentUploader, which is megabytes of lazy chunk and needs a live Box
 * token. What matters here is the one thing the real element does on mount and this
 * double reproduces exactly: it reads react-intl context, and throws "Could not find
 * required `intl` object" when nothing provides it.
 */
vi.mock("box-ui-elements/es/elements/content-uploader", () => ({
  default: function ContentUploaderDouble() {
    const intl = useIntl();
    return <div data-testid="uploader-double">{intl.locale}</div>;
  },
}));
vi.mock("box-ui-elements/dist/uploader.css", () => ({}));

describe("UploadDialog", () => {
  test("provides the intl context box-ui-elements mounts against", async () => {
    render(<UploadDialog folderId="0" tokenProvider={() => "t"} onClose={() => {}} />);
    // The dialog renders outside BoxElements, so it cannot inherit that provider. Losing
    // this one takes the uploader down at mount, not at upload.
    expect(await screen.findByTestId("uploader-double")).toBeVisible();
  });

  test("renders outside the app tree so nothing in the page can paint over it", async () => {
    // An ancestor in the workspace layout establishes a stacking context. Rendered in
    // place the dialog painted under the panels it covers, and no z-index could lift it
    // out. Only the body is guaranteed to be neither a stacking context nor a clip.
    const { container } = render(
      <UploadDialog folderId="0" tokenProvider={() => "t"} onClose={() => {}} />,
    );
    const dialog = await screen.findByTestId("upload-dialog");
    expect(dialog.parentElement).toBe(document.body);
    expect(container).not.toContainElement(dialog);
  });
});
