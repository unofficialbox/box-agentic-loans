import { beforeEach, expect, test, vi } from "vitest";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@salesforce/platform-sdk", () => ({
  createDataSDK: vi.fn(async () => ({ graphql: { query } })),
  gql: (strings: TemplateStringsArray) => strings.join(""),
}));
import { fetchLoansViaGraphql } from "./loansGraphql";

beforeEach(() => { query.mockReset(); });

test("requests and preserves the signing URL on the preferred GraphQL path", async () => {
  const signEmbedUrl = "https://app.box.com/embed/sign/document/test";
  query.mockResolvedValue({ data: { uiapi: { query: { LOS_Loan__c: { edges: [
    { node: { Id: "loan-1", Sign_Embed_URL__c: { value: signEmbedUrl } } },
    { node: { Id: "loan-2", Sign_Embed_URL__c: { value: null } } },
  ] } } } } });
  const loans = await fetchLoansViaGraphql();
  expect(query.mock.calls[0][0].query).toContain("Sign_Embed_URL__c { value }");
  expect(loans?.[0].signEmbedUrl).toBe(signEmbedUrl);
  expect(loans?.[1].signEmbedUrl).toBeUndefined();
});

test("keeps an authorized empty list distinct from an unavailable API", async () => {
  query.mockResolvedValue({ data: { uiapi: { query: { LOS_Loan__c: { edges: [] } } } } });
  expect(await fetchLoansViaGraphql()).toEqual([]);
  query.mockRejectedValue(new Error("unavailable"));
  expect(await fetchLoansViaGraphql()).toBeNull();
});
