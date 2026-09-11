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
    expect(screen.getAllByRole("columnheader").map(h => h.textContent)).toEqual(["Name", "Type", "Status", "Last modified", "Size"]);
    const rows = screen.getAllByTestId("required-document-row");
    expect(rows).toHaveLength(6);
    expect(rows.filter((row) => row.dataset.status === "received")).toHaveLength(1);
    expect(screen.getByText("1 of 6 received.")).toBeVisible();
    expect(screen.getAllByTestId("required-document-upload")).toHaveLength(1);
  });

  test("opens the uploader from the table header, and waits for a token first", () => {
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

  test("shows loading until the folder is listed, and nothing for an unknown loan type", () => {
    const { container, rerender } = render(
      <RequiredDocuments loanType="Term Loan" files={null} canUpload onUpload={() => {}} />,
    );
    const loading = screen.getByTestId("required-documents-loading");
    expect(loading).toBeVisible();
    expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
    expect(loading.querySelector(".panel-head p")).toBeNull();
    expect(loading.querySelectorAll(".skeleton-row")).toHaveLength(6);
    expect(loading.querySelector("[aria-busy]")).toHaveAttribute("aria-busy", "true");
    rerender(<RequiredDocuments loanType="Term Loan" files={[]} canUpload onUpload={() => {}} />);
    expect(screen.queryByTestId("required-documents-loading")).not.toBeInTheDocument();
    expect(screen.getByTestId("required-documents")).toBeVisible();
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
    expect(screen.getByTestId("required-document-upload")).toBeEnabled();
  });
});


test("shows document approval even when the version is Draft, and opens that file", () => {
  const onPreview = vi.fn();
  const approved = file("appraisal", "Appraisal");
  approved.metadata!.enterprise!.losDocument = {
    documentType: "Appraisal", versionStatus: "Draft", approvalStatus: "Approved",
  };
  render(<RequiredDocuments loanType="Commercial Real Estate" files={[approved]} canUpload onUpload={() => {}} onPreview={onPreview} />);
  expect(screen.getByText("Approved")).toHaveClass("doc-status-approved");
  expect(screen.queryByText("Draft")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "appraisal.pdf" }));
  expect(onPreview).toHaveBeenCalledWith(approved);
});

test("an uploaded file with no approval metadata is Received, not Missing", () => {
  render(<RequiredDocuments loanType="Commercial Real Estate" files={[file("appraisal", "Appraisal")]} canUpload onUpload={() => {}} />);
  const row = screen.getAllByTestId("required-document-row").find(r => r.dataset.documentType === "Appraisal");
  expect(row).toHaveTextContent("Received");
  expect(row).not.toHaveTextContent("Missing");
});
