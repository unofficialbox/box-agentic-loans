/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Loan agent backend (for example a Strands agent). Unset runs the offline demo script. */
  readonly VITE_AGENT_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
