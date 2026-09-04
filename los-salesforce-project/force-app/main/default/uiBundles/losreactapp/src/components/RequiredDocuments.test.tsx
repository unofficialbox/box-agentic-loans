import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import type { BoxFolderItem } from "../lib/box";
import { RequiredDocuments } from "./RequiredDocuments";

function file(id: string, documentType?: string): BoxFolderItem {
  return {
    id,
    name: `${id}.pdf`,
    type: "file",
    ...(documentType ? { metadata: { enterprise: { losDocument: { documentType } } } } : {}),
  };
}

describe("RequiredDocuments", () => {
  test("ticks what has arrived and offers an upload for what has not", () => {
    render(
      <RequiredDocuments
        loanType="Commercial Real Estate"
        files={[file("scan-0042", "Appraisal")]}
        canUpload
        onUpload={() => {}}
      />,
    );
    const rows = screen.getAllByTestId("required-document-row");
    expect(rows).toHaveLength(7);
    expect(rows.filter((row) => row.dataset.status === "received")).toHaveLength(1);
    expect(screen.getByText("1 of 7 received.")).toBeVisible();
    expect(screen.getAllByTestId("required-document-upload")).toHaveLength(6);
  });

  test("opens the uploader from a missing row, and waits for a token first", () => {
    const onUpload = vi.fn();
    const { rerender } = render(
      <RequiredDocuments loanType="Term Loan" files={[]} canUpload={false} onUpload={onUpload} />,
    );
    // No token yet means an upload has nowhere to land; the button says so by refusing.
    expect(screen.getAllByTestId("required-document-upload")[0]).toBeDisabled();

    rerender(<RequiredDocuments loanType="Term Loan" files={[]} canUpload onUpload={onUpload} />);
    fireEvent.click(screen.getAllByTestId("required-document-upload")[0]);
    expect(onUpload).toHaveBeenCalledTimes(1);
  });

  test("names an unclassified upload underneath rather than ticking a row", () => {
    render(<RequiredDocuments loanType="Term Loan" files={[file("just-uploaded")]} canUpload onUpload={() => {}} />);
    expect(screen.getByTestId("awaiting-classification")).toHaveTextContent(
      "just-uploaded.pdf has been received and is awaiting classification.",
    );
    expect(screen.getAllByTestId("required-document-row").every((row) => row.dataset.status === "missing")).toBe(true);
  });

  test("draws nothing until the folder has been listed, and nothing for an unknown loan type", () => {
    const { container, rerender } = render(
      <RequiredDocuments loanType="Term Loan" files={null} canUpload onUpload={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
    rerender(<RequiredDocuments loanType="Bridge Loan" files={[]} canUpload onUpload={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  test("says so when everything has arrived", () => {
    render(
      <RequiredDocuments
        loanType="Line of Credit"
        files={[file("a", "Application"), file("b", "Financial Statement"), file("c", "Bank Statement")]}
        canUpload
        onUpload={() => {}}
      />,
    );
    expect(screen.getByText(/Everything the bank asked for has been received/)).toBeVisible();
    expect(screen.queryByTestId("required-document-upload")).not.toBeInTheDocument();
  });
});
