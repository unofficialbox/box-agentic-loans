import { createDataSDK, gql } from "@salesforce/platform-sdk";
import type { LosLoanSummary } from "./loans";

/**
 * Read loans through the GraphQL UI API instead of custom Apex.
 *
 * The projection deliberately omits Risk_Rating__c, LTV__c, DSCR__c and the underwriting
 * notes. They are the bank's own assessment of a loan rather than facts about it, and
 * this page faces the borrower -- the same reason the underwriting review queue went.
 * Leaving them out of the query is what lets the permission set withhold the fields: UI
 * API rejects the *whole* query when any selected field is hidden, so selecting a field
 * the reader cannot see returns nothing at all rather than a row with one blank column.
 * That failure is silent and looks exactly like "this borrower has no loans".
 *
 * This is the pattern the official React-on-Platform recipes use
 * (trailheadapps/multiframework-recipes). It runs as the logged-in user, so sharing and
 * field-level security are enforced by the platform rather than by a hand-written
 * projection -- which is why it is worth preferring over LosLoanListService once the
 * surface is authenticated.
 *
 * It returns nothing for the Experience Cloud guest user, which holds no records. That
 * is the whole point: the guest path needs a sharing rule that publishes loans to
 * anonymous visitors, and this path does not.
 */
const GET_LOS_LOANS = gql`
  query GetLosLoans {
    uiapi {
      query {
        LOS_Loan__c(first: 50, orderBy: { LastModifiedDate: { order: DESC } }) {
          edges {
            node {
              Id
              Name { value }
              Loan_ID__c { value }
              Borrower__c { value }
              Borrower_Entity__c { value }
              Loan_Type__c { value }
              Status__c { value }
              Loan_Amount__c { value }
              Term_Months__c { value }
              Maturity_Date__c { value }
              Box_Workspace_Folder_ID__c { value }
            }
          }
        }
      }
    }
  }
`;

interface FieldValue<T> {
  value: T | null;
}

interface LoanNode {
  Id: string;
  Name?: FieldValue<string>;
  Loan_ID__c?: FieldValue<string>;
  Borrower__c?: FieldValue<string>;
  Borrower_Entity__c?: FieldValue<string>;
  Loan_Type__c?: FieldValue<string>;
  Status__c?: FieldValue<string>;
  Loan_Amount__c?: FieldValue<number>;
  Term_Months__c?: FieldValue<number>;
  Maturity_Date__c?: FieldValue<string>;
  Box_Workspace_Folder_ID__c?: FieldValue<string>;
}

interface LoansQuery {
  uiapi?: {
    query?: {
      LOS_Loan__c?: { edges?: ({ node?: LoanNode } | null)[] | null } | null;
    };
  };
}

/**
 * Null means "this path is not available here" -- the SDK is absent or the surface does
 * not provide it -- which the caller uses to fall back to Apex. An empty array means the
 * query ran and the user can see no loans, which is a different answer and must not
 * trigger a fallback.
 */
export async function fetchLoansViaGraphql(): Promise<LosLoanSummary[] | null> {
  try {
    const sdk = await createDataSDK();
    if (!sdk?.graphql) {
      console.info("[LOS] Platform SDK has no GraphQL on this surface; using the Apex endpoint.");
      return null;
    }
    const result = await sdk.graphql.query<LoansQuery>({ query: GET_LOS_LOANS });
    const edges = result?.data?.uiapi?.query?.LOS_Loan__c?.edges;
    if (!edges) {
      console.info("[LOS] GraphQL returned no loan connection; using the Apex endpoint.");
      return null;
    }
    return edges.flatMap((edge) => {
      const node = edge?.node;
      if (!node) return [];
      return [{
        recordId: node.Id,
        name: node.Name?.value ?? undefined,
        loanId: node.Loan_ID__c?.value ?? undefined,
        borrower: node.Borrower__c?.value ?? undefined,
        borrowerEntity: node.Borrower_Entity__c?.value ?? undefined,
        loanType: node.Loan_Type__c?.value ?? undefined,
        status: node.Status__c?.value ?? undefined,
        loanAmount: node.Loan_Amount__c?.value ?? undefined,
        termMonths: node.Term_Months__c?.value ?? undefined,
        maturityDate: node.Maturity_Date__c?.value ?? undefined,
        boxFolderId: node.Box_Workspace_Folder_ID__c?.value ?? undefined,
      }];
    });
  } catch (error) {
    console.info("[LOS] Platform SDK unavailable here; using the Apex endpoint.", error);
    return null;
  }
}
