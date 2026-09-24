import { useEffect } from "react";
import {
  applyDesignTokens,
  registerBoxDarkDesignSystem,
  registerBoxDefaultDesignSystem,
} from "@unofficialbox/box-open-elements/foundations/tokens";
import "./styles/base.css";

registerBoxDefaultDesignSystem({ setActive: true });
registerBoxDarkDesignSystem();

/** Box tokens on <html>, following the OS light/dark preference. */
export function useBoxTheme() {
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
