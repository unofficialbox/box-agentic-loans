import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { DevTools } from "./DevTools";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DevTools />
  </StrictMode>
);
