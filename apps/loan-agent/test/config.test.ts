import { describe, expect, it } from "vitest";
import { ConfigError, readConfig, readTypeSafeConfig } from "../src/config.js";

const COMPLETE = {
  TYPESAFE_API_KEY: "example-key",
  TYPESAFE_API_URL: "https://api.example/systemone",
  TYPESAFE_MODEL: "jev-latest",
  TYPESAFE_TIMEOUT_MS: "30000",
  TYPESAFE_HIGH_CONFIDENCE_THRESHOLD: "0.85",
  TYPESAFE_MEDIUM_CONFIDENCE_THRESHOLD: "0.5",
  LOAN_AGENT_HOST: "127.0.0.1",
  LOAN_AGENT_PORT: "8787",
  LOAN_AGENT_ALLOWED_ORIGIN: "http://localhost:3003",
  LOS_MCP_URL: "https://api.salesforce.com/platform/mcp/v1/custom/LOSLoanTools",
  LOS_MCP_CLIENT_ID: "example-sf-client",
  LOS_MCP_CLIENT_SECRET: "example-sf-secret",
  BOX_MCP_URL: "https://mcp.box.com",
  BOX_MCP_CLIENT_ID: "example-box-client",
  BOX_MCP_CLIENT_SECRET: "example-box-secret",
  BOX_ENTERPRISE_ID: "12345",
  LOS_DOCGEN_TEMPLATE_FILE_ID: "700001",
};

describe("readConfig", () => {
  it("reads every setting from the environment, with no defaults", () => {
    const config = readConfig(COMPLETE);
    expect(config).toMatchObject({
      port: 8787,
      host: "127.0.0.1",
      fixtures: false,
      losMcp: {
        url: "https://api.salesforce.com/platform/mcp/v1/custom/LOSLoanTools",
        clientId: "example-sf-client",
        clientSecret: "example-sf-secret",
      },
      boxMcp: { url: "https://mcp.box.com", clientId: "example-box-client", clientSecret: "example-box-secret" },
      typesafe: { model: "jev-latest", timeoutMs: 30000, high: 0.85, medium: 0.5 },
      boxEnterpriseId: "12345",
    });
    expect(config.defaultSigner).toBeUndefined();
  });

  it("names every missing setting in one error", () => {
    const { TYPESAFE_MODEL: _model, LOAN_AGENT_PORT: _port, BOX_MCP_CLIENT_SECRET: _box, LOS_MCP_URL: _url, ...partial } = COMPLETE;
    expect(() => readConfig(partial)).toThrow(ConfigError);
    try {
      readConfig(partial);
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain("TYPESAFE_MODEL is not set");
      expect(message).toContain("LOAN_AGENT_PORT is not set");
      expect(message).toContain("BOX_MCP_CLIENT_SECRET is not set");
      expect(message).toContain("LOS_MCP_URL is not set");
    }
  });

  it("rejects a setting that is present but malformed", () => {
    expect(() => readConfig({ ...COMPLETE, TYPESAFE_TIMEOUT_MS: "soon" })).toThrow(/TYPESAFE_TIMEOUT_MS must be a number/);
  });

  it("does not ask for connector credentials in fixtures mode", () => {
    const rest = Object.fromEntries(Object.entries(COMPLETE).filter(([key]) => !/^(LOS|BOX)_MCP_/.test(key)));
    const config = readConfig({ ...rest, LOAN_AGENT_FIXTURES: "1" });
    expect(config.fixtures).toBe(true);
    expect(config.losMcp).toBeUndefined();
    expect(config.boxMcp).toBeUndefined();
  });
});

describe("readTypeSafeConfig", () => {
  it("needs only the TypeSafe settings", () => {
    const typesafe = Object.fromEntries(Object.entries(COMPLETE).filter(([key]) => key.startsWith("TYPESAFE_")));
    expect(readTypeSafeConfig(typesafe).apiUrl).toBe("https://api.example/systemone");
    expect(() => readTypeSafeConfig({})).toThrow(/TYPESAFE_API_KEY is not set/);
  });
});
