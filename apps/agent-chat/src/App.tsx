import { useEffect, useState } from "react";
import "./App.css";
import { AgentChatInterface } from "./components/AgentChatInterface";
import { registerBoxDefaultDesignSystem, applyDesignTokens } from "@unofficialbox/box-open-elements/foundations/tokens";

function App() {
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    // Initialize Box design tokens
    registerBoxDefaultDesignSystem({ setActive: true });
    applyDesignTokens(document.documentElement, "box-default");
    setInitialized(true);
  }, []);

  if (!initialized) {
    return <div className="loading">Initializing...</div>;
  }

  return (
    <div className="app">
      <AgentChatInterface />
    </div>
  );
}

export default App;
