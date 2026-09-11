import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { Workspace } from "./Workspace";

const { grant } = vi.hoisted(() => ({ grant: vi.fn() }));
vi.mock("./lib/box", async importOriginal => ({
  ...await importOriginal<typeof import("./lib/box")>(), fetchDownscopedBoxToken: grant,
}));
vi.mock("./lib/useLoans", () => ({ useLoans: () => ({ loans: [], loading: false, error: "", reload: () => {} }) }));
vi.mock("./components/BoxWorkspace", () => ({
  BoxWorkspace: ({ onUpload }: { onUpload: () => void }) => <button onClick={onUpload}>Upload test document</button>,
}));
vi.mock("./components/ApplicationForm", () => ({
  ApplicationForm: ({ onCreated }: { onCreated: (loan: object) => void }) => <button onClick={() => onCreated({recordId:"new-loan",loanId:"LN-NEW",boxFolderId:"stale-copy"})}>Create test loan</button>,
}));
vi.mock("./components/UploadDialog", () => ({
  UploadDialog: ({folderId,tokenProvider}: {folderId:string;tokenProvider:()=>string}) => <div data-testid="upload-target">{folderId}:{tokenProvider()}</div>,
}));
beforeEach(() => {
  window.history.replaceState({}, "", "/?recordId=old-loan&folderId=old-folder");
  grant.mockReset();
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({isGuest:false,name:"Borrower"}))));
});

test("new application upload resolves its record mapping instead of old or denormalized folders", async () => {
  render(<Workspace />);
  fireEvent.click(screen.getByRole("button", {name:"Start an application"}));
  fireEvent.click(await screen.findByRole("button", {name:"Create test loan"}));
  grant.mockResolvedValue({ok:true,value:{folderId:"new-mapped-folder",accessToken:"example-new-token"}});
  fireEvent.click(screen.getByRole("button", {name:"Upload test document"}));
  expect(await screen.findByTestId("upload-target")).toHaveTextContent("new-mapped-folder:example-new-token");
  expect(grant).toHaveBeenCalledWith(expect.objectContaining({salesforceRecordId:"new-loan"}));
});

test("late upload grant cannot reopen the uploader after navigation", async () => {
  let resolve!: (value: unknown) => void;
  grant.mockReturnValue(new Promise(r => {resolve=r;}));
  render(<Workspace />);
  fireEvent.click(screen.getByRole("button", {name:"Upload test document"}));
  fireEvent.click(screen.getByRole("button", {name:"Start an application"}));
  await act(async () => resolve({ok:true,value:{folderId:"old-folder",accessToken:"example-old-token"}}));
  expect(screen.queryByTestId("upload-target")).not.toBeInTheDocument();
});

test("failed destination lookup does not open an uploader using cached credentials", async () => {
  grant.mockResolvedValue({ok:false,error:"Folder lookup failed"});
  render(<Workspace />);
  fireEvent.click(screen.getByRole("button", {name:"Upload test document"}));
  expect(await screen.findByText("Folder lookup failed")).toBeVisible();
  expect(screen.queryByTestId("upload-target")).not.toBeInTheDocument();
});
