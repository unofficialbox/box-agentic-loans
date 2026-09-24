import { BrandMark } from "../components/BrandMark";
import { useBoxTheme } from "../theme";
import { agentBaseUrl } from "../transport";
import { CallConsole } from "./CallConsole";
import "./DevTools.css";

/**
 * The copilot's developer tools, on a page of their own: the officer's page
 * carries no tooling, and whoever is building or demoing the agent keeps this
 * open beside it.
 */
export function DevTools() {
  useBoxTheme();
  const baseUrl = agentBaseUrl();
  return (
    <div className="devtools">
      <header className="devtools-bar">
        <a className="wordmark" href="./" title="Open the copilot">
          <BrandMark size={24} />
          <span className="wordmark-bank">Acme Bank</span>
          <span className="wordmark-product">Developer tools</span>
        </a>
        <h1 className="devtools-title">API calls</h1>
        {baseUrl && <code className="devtools-target">{baseUrl}</code>}
      </header>
      {baseUrl ? (
        <CallConsole baseUrl={baseUrl} />
      ) : (
        <p className="devtools-empty">
          The copilot is in demo mode, which makes no API calls. Set <code>VITE_AGENT_API_URL</code> in the repo-root{" "}
          <code>.env</code> to the loan agent (for example <code>http://localhost:8787</code>) and restart the dev server.
        </p>
      )}
    </div>
  );
}
