import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { EmbeddedSign } from "./EmbeddedSign";

const props = { recordId: "loan-one", embedUrl: "https://app.box.com/embed/sign/document/test" };
const reply = (status: string) => new Response(JSON.stringify({ status }));
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

test("checks persisted completion before loading a previously signed iframe", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply("signed")));
  const done = vi.fn();
  render(<EmbeddedSign {...props} onComplete={done} />);
  await waitFor(() => expect(done).toHaveBeenCalledOnce());
  expect(done).toHaveBeenCalledWith(false);
  expect(screen.queryByTitle("Box Sign Document")).not.toBeInTheDocument();
});

test("polls Box status and ignores forged completion messages", async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn().mockResolvedValueOnce(reply("viewed")).mockResolvedValueOnce(reply("signed"));
  vi.stubGlobal("fetch", fetcher);
  const done = vi.fn();
  await act(async () => { render(<EmbeddedSign {...props} onComplete={done} />); });
  const iframe = screen.getByTitle("Box Sign Document") as HTMLIFrameElement;
  fireEvent(window, new MessageEvent("message", {origin:"https://app.box.com",source:iframe.contentWindow,data:{type:"sign_completed"}}));
  expect(done).not.toHaveBeenCalled();
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(done).toHaveBeenCalledWith(true);
  expect(screen.getByTitle("Box Sign Document")).toBe(iframe);
});

test("retries failed status reads without claiming success", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", {status:502})));
  const done=vi.fn();render(<EmbeddedSign {...props} onComplete={done} />);
  await screen.findByRole("status");expect(done).not.toHaveBeenCalled();
  expect(screen.queryByTitle("Box Sign Document")).not.toBeInTheDocument();
});

test("unmount cancels pending completion", async () => {
  let resolve!: (response:Response)=>void;
  vi.stubGlobal("fetch", vi.fn(()=>new Promise<Response>(r=>{resolve=r;})));
  const done=vi.fn();const {unmount}=render(<EmbeddedSign {...props} onComplete={done} />);
  unmount();await act(async()=>{resolve(reply("signed"));});expect(done).not.toHaveBeenCalled();
});

test("background reconciliation never mounts a frame and waits through finalization", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(reply("finalizing")).mockResolvedValueOnce(reply("signed")));
  const done = vi.fn();
  await act(async () => { render(<EmbeddedSign {...props} background onComplete={done} />); });
  expect(screen.queryByTitle("Box Sign Document")).not.toBeInTheDocument();
  expect(done).not.toHaveBeenCalled();
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(done).toHaveBeenCalledWith(false);
  expect(screen.queryByTitle("Box Sign Document")).not.toBeInTheDocument();
});
