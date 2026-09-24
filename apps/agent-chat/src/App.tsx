import { LoanCopilot } from "./components/LoanCopilot";
import { useBoxTheme } from "./theme";

/** Loan from the URL (`?recordId=` or `?loan=`), if the page was opened on one. */
function loanFromUrl(): string | undefined {
  const params = new URLSearchParams(window.location.search);
  return params.get("recordId") ?? params.get("loan") ?? undefined;
}

export default function App() {
  useBoxTheme();
  return <LoanCopilot loan={loanFromUrl()} />;
}
