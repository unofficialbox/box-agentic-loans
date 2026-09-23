import { useEffect } from "react";
import "./App.css";
import { LoanCopilot } from "./components/LoanCopilot";
import {
  applyDesignTokens,
  registerBoxDarkDesignSystem,
  registerBoxDefaultDesignSystem,
} from "@unofficialbox/box-open-elements/foundations/tokens";

registerBoxDefaultDesignSystem({ setActive: true });
registerBoxDarkDesignSystem();

/** Box tokens on <html>, following the OS light/dark preference. */
function useBoxTheme() {
  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const theme = query.matches ? "box-dark" : "box-default";
      applyDesignTokens(document.documentElement, theme);
      document.documentElement.dataset.theme = query.matches ? "dark" : "light";
    };
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);
}

/** Loan from the URL (`?recordId=` or `?loan=`), if the page was opened on one. */
function loanFromUrl(): string | undefined {
  const params = new URLSearchParams(window.location.search);
  return params.get("recordId") ?? params.get("loan") ?? undefined;
}

export default function App() {
  useBoxTheme();
  return <LoanCopilot loan={loanFromUrl()} />;
}
