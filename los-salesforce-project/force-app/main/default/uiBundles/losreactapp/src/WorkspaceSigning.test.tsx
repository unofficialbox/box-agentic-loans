import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { Workspace } from "./Workspace";

const { useLoans } = vi.hoisted(() => ({ useLoans: vi.fn() }));
vi.mock("./lib/useLoans", () => ({ useLoans }));
vi.mock("./components/BoxWorkspace", () => ({ BoxWorkspace: () => <div /> }));
vi.mock("./components/BoxElements", () => ({ BoxElements: () => <div /> }));
const signed = { recordId: "loan-one", name: "First loan", signEmbedUrl: "https://app.box.com/embed/sign/document/one" };
const unsigned = { recordId: "loan-two", name: "Second loan" };

beforeEach(() => {
  window.history.replaceState({}, "", "/?recordId=loan-one");
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ isGuest: false, accountName: "Borrower", status: "viewed" }))));
  useLoans.mockReturnValue({ loans: [signed, unsigned], loading: false, error: "", reload: vi.fn() });
});

test("offers signing without mounting an iframe until clicked", async () => {
  useLoans.mockReturnValueOnce({ loans: [], loading: true, error: "", reload: vi.fn() });
  const { rerender } = render(<Workspace />);
  expect(screen.queryByTitle("Box Sign Document")).not.toBeInTheDocument();
  rerender(<Workspace />);
  expect(screen.queryByTitle("Box Sign Document")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Review and sign" }));
  expect(await screen.findByTitle("Box Sign Document")).toHaveAttribute("src", signed.signEmbedUrl);
  expect(screen.queryByTestId("workspace-metrics")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Back to documents" }));
  expect(screen.queryByTitle("Box Sign Document")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Review and sign" })).toBeVisible();
});

test("Back navigation to a loan without a request clears the signer frame", async () => {
  render(<Workspace />);
  fireEvent.click(screen.getByRole("button", { name: "Review and sign" }));
  expect(await screen.findByTitle("Box Sign Document")).toBeInTheDocument();
  window.history.replaceState({}, "", "/?recordId=loan-two");
  fireEvent.popState(window);
  expect(screen.queryByTitle("Box Sign Document")).not.toBeInTheDocument();
});

test("a completed request stays dismissed instead of reopening from the same loan", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ isGuest: false, status: "signed" }))));
  const { rerender } = render(<Workspace />);
  fireEvent.click(screen.getByRole("button", { name: "Review and sign" }));
  await waitFor(() => expect(screen.getByText("Document signed successfully.")).toBeVisible());
  rerender(<Workspace />);
  expect(screen.queryByTitle("Box Sign Document")).not.toBeInTheDocument();
  expect(screen.getByText("Document signed successfully.")).toBeVisible();
});
