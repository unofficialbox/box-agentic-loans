/**
 * TypeSafe Orchestrator
 *
 * Intelligent decision layer between AI harnesses and Box/Salesforce MCPs.
 * Makes routing, validation, and scoring decisions while MCPs handle data operations.
 */

import { TypeSafeClient, choice, noul, score } from 'typesafe-sdk';
import {
  TypeSafeConfig,
  DEFAULT_CONFIG,
  validateConfig
} from './config.js';
import {
  ConfidenceLevel,
  ConfidenceDecision,
  IntentRoute,
  UserIntent,
  ClassificationValidation,
  LoanContext,
  RiskScore,
  LoanData,
  DocumentMetadata,
  PolicyValidation,
  PolicyCriteria,
  ConsistencyValidation,
  PortfolioAnalysis,
  PortfolioLoan,
  MCPToolCall,
  ConfigurationError,
  APIError
} from './types.js';

export class TypeSafeOrchestrator {
  private client: TypeSafeClient;
  private config: Required<TypeSafeConfig>;

  constructor(config: TypeSafeConfig) {
    // Merge with defaults
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      thresholds: {
        ...DEFAULT_CONFIG.thresholds!,
        ...config.thresholds
      }
    } as Required<TypeSafeConfig>;

    // Validate configuration
    validateConfig(this.config);

    // Initialize TypeSafe client
    this.client = new TypeSafeClient({
      apiKey: this.config.apiKey,
      ...(this.config.apiUrl && { baseURL: this.config.apiUrl }),
      ...(this.config.timeoutMs && { timeout: this.config.timeoutMs })
    });
  }

  // ==========================================================================
  // Intent Routing
  // ==========================================================================

  /**
   * Route user intent to appropriate MCP operations
   */
  async routeIntent(
    userQuery: string,
    sessionContext?: Record<string, unknown>
  ): Promise<IntentRoute> {
    try {
      const response = await this.client.systemOne({
        model: this.config.model,
        state: {
          query: userQuery,
          ...(sessionContext && { context: sessionContext })
        },
        questions: {
          primaryIntent: choice({
            instructions: 'What operation should handle this user request?',
            criteria: {
              search_documents: 'Find or search for loan documents',
              extract_terms: 'Extract loan terms from documents',
              validate_policy: 'Check compliance with credit policy',
              score_risk: 'Assess loan or portfolio risk',
              generate_letter: 'Create commitment or other letters',
              prepare_signature: 'Send documents for signing',
              review_history: 'Compare with prior loans or analyze history',
              update_record: 'Modify loan record fields'
            }
          }),
          needsClarification: noul({
            instructions: 'Does this query require clarification before proceeding?'
          })
        }
      });

      const intent = response.answers.primaryIntent.choice as UserIntent;
      const confidence = response.answers.primaryIntent.confidence;
      const needsClarification = response.answers.needsClarification.noul > 0.5;

      // Build MCP tool sequence based on intent
      const mcpToolSequence = this.buildToolSequence(intent);

      return {
        intent,
        confidence,
        mcpToolSequence,
        requiresClarification: needsClarification
      };
    } catch (error) {
      throw new APIError('Failed to route user intent', {
        query: userQuery,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Build MCP tool call sequence for a given intent
   */
  private buildToolSequence(intent: UserIntent): MCPToolCall[] {
    const sequences: Record<UserIntent, MCPToolCall[]> = {
      search_documents: [
        {
          connector: 'box',
          tool: 'query_metadata',
          parameters: { template: 'losDocument' }
        }
      ],
      extract_terms: [
        {
          connector: 'salesforce',
          tool: 'getLoanPackage',
          parameters: {}
        },
        {
          connector: 'salesforce',
          tool: 'extractLoanTerms',
          parameters: {}
        }
      ],
      validate_policy: [
        {
          connector: 'salesforce',
          tool: 'getLoanPackage',
          parameters: {}
        },
        {
          connector: 'box',
          tool: 'box_ai_ask',
          parameters: { question: 'credit_policy_check' }
        }
      ],
      score_risk: [
        {
          connector: 'salesforce',
          tool: 'getLoanPackage',
          parameters: {}
        }
      ],
      generate_letter: [
        {
          connector: 'salesforce',
          tool: 'getLoanPackage',
          parameters: {}
        },
        {
          connector: 'box',
          tool: 'create_docgen_batch',
          parameters: {}
        }
      ],
      prepare_signature: [
        {
          connector: 'salesforce',
          tool: 'prepareSignatureRequest',
          parameters: {}
        }
      ],
      review_history: [
        {
          connector: 'salesforce',
          tool: 'listLoans',
          parameters: { status: 'Closed' }
        }
      ],
      update_record: [
        {
          connector: 'salesforce',
          tool: 'applyLoanTerms',
          parameters: { confirmed: true }
        }
      ]
    };

    return sequences[intent] || [];
  }

  // ==========================================================================
  // Document Classification Validation
  // ==========================================================================

  /**
   * Validate Box AI document classification with confidence and context
   */
  async validateClassification(
    boxClassification: string,
    loanContext: LoanContext
  ): Promise<ClassificationValidation> {
    try {
      const response = await this.client.systemOne({
        model: this.config.model,
        state: {
          boxClassification,
          loanType: loanContext.loanType,
          loanStage: loanContext.status,
          existingDocuments: loanContext.existingDocuments.map(d => d.type)
        },
        questions: {
          classificationConfidence: score({
            instructions: 'How confident should we be in Box\'s classification?',
            criteria: [
              'High: Clear match, apply automatically',
              'Medium: Reasonable match, flag for quick review',
              'Low: Uncertain, needs manual classification',
              'Wrong: Box misclassified, override needed'
            ]
          }),
          contextuallyAppropriate: noul({
            instructions: 'Does this document type make sense for this loan type and stage?'
          }),
          duplicateRisk: noul({
            instructions: 'Is this a duplicate of an existing document in the package?'
          })
        }
      });

      const confidenceScore = response.answers.classificationConfidence.score;
      const isAppropriate = response.answers.contextuallyAppropriate.noul;
      const isDuplicate = response.answers.duplicateRisk.noul;

      const confidence = this.evaluateConfidence(
        response.answers.classificationConfidence.confidence
      );

      // Determine recommendation
      let recommendation: ClassificationValidation['recommendation'];
      if (confidenceScore < 1.0 && isAppropriate > 0.85 && isDuplicate < 0.3) {
        recommendation = 'auto_apply';
      } else if (confidenceScore < 2.0) {
        recommendation = 'flag_for_review';
      } else {
        recommendation = 'manual_classification';
      }

      return {
        documentType: boxClassification as any,
        confidence,
        contextuallyAppropriate: isAppropriate > 0.7,
        duplicateRisk: isDuplicate,
        recommendation
      };
    } catch (error) {
      throw new APIError('Failed to validate document classification', {
        boxClassification,
        loanContext,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  // ==========================================================================
  // Loan Risk Scoring
  // ==========================================================================

  /**
   * Score loan risk across multiple dimensions
   */
  async scoreLoanRisk(
    loanData: LoanData,
    documents: DocumentMetadata[]
  ): Promise<RiskScore> {
    try {
      const response = await this.client.systemOne({
        model: this.config.model,
        state: {
          loan: {
            amount: loanData.amount,
            ltv: loanData.ltv,
            dscr: loanData.dscr,
            termMonths: loanData.termMonths,
            interestRate: loanData.interestRate,
            borrower: loanData.borrower
          },
          documents: {
            count: documents.length,
            types: documents.map(d => d.type),
            completeness: documents.filter(d => d.type !== 'Other').length / documents.length
          }
        },
        questions: {
          creditRisk: score({
            instructions: 'Assess overall credit risk',
            criteria: [
              'Low risk: Strong financials, conservative leverage',
              'Medium risk: Adequate financials, moderate leverage',
              'High risk: Weak financials, aggressive leverage',
              'Critical risk: Severe financial distress'
            ]
          }),
          collateralRisk: score({
            instructions: 'Evaluate collateral adequacy',
            criteria: [
              'Excellent: LTV <60%, high-quality assets',
              'Good: LTV 60-75%, standard assets',
              'Fair: LTV 75-85%, weaker assets',
              'Poor: LTV >85%, weak assets'
            ]
          })
        }
      });

      const creditScore = response.answers.creditRisk.score;
      const collateralScore = response.answers.collateralRisk.score;
      const compositeScore = creditScore * 0.7 + collateralScore * 0.3;

      let riskLevel: RiskScore['riskLevel'];
      if (compositeScore < 0.75) riskLevel = 'Low';
      else if (compositeScore < 1.5) riskLevel = 'Medium';
      else if (compositeScore < 2.5) riskLevel = 'High';
      else riskLevel = 'Critical';

      return {
        creditScore,
        collateralScore,
        compositeScore,
        riskLevel,
        confidence: response.answers.creditRisk.confidence,
        requiresSeniorReview: compositeScore > 2.0,
        breakdown: {
          ltv: { value: loanData.ltv, risk: collateralScore },
          dscr: { value: loanData.dscr, risk: creditScore },
          creditHistory: { risk: creditScore },
          collateralQuality: { risk: collateralScore }
        }
      };
    } catch (error) {
      throw new APIError('Failed to score loan risk', {
        loanId: loanData.id,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  // ==========================================================================
  // Policy Validation
  // ==========================================================================

  /**
   * Validate loan terms against credit policy
   */
  async validatePolicy(
    loanData: LoanData,
    policyCriteria: PolicyCriteria
  ): Promise<PolicyValidation> {
    try {
      const response = await this.client.systemOne({
        model: this.config.model,
        state: {
          loan: {
            amount: loanData.amount,
            ltv: loanData.ltv,
            dscr: loanData.dscr
          },
          policy: policyCriteria
        },
        questions: {
          ltvCompliant: noul({
            instructions: 'Does the LTV ratio comply with credit policy limits?'
          }),
          dscrCompliant: noul({
            instructions: 'Does the DSCR meet or exceed policy minimums?'
          }),
          collateralAcceptable: noul({
            instructions: 'Is the collateral type approved under policy?'
          }),
          guarantyAdequate: noul({
            instructions: 'Does the guaranty meet policy requirements?'
          })
        }
      });

      const checks: Record<string, { name: string; probability: number; passed: boolean }> = {
        ltv: {
          name: 'LTV Compliance',
          probability: response.answers.ltvCompliant.noul,
          passed: response.answers.ltvCompliant.noul >= 0.5
        },
        dscr: {
          name: 'DSCR Compliance',
          probability: response.answers.dscrCompliant.noul,
          passed: response.answers.dscrCompliant.noul >= 0.5
        },
        collateral: {
          name: 'Collateral Acceptance',
          probability: response.answers.collateralAcceptable.noul,
          passed: response.answers.collateralAcceptable.noul >= 0.5
        },
        guaranty: {
          name: 'Guaranty Adequacy',
          probability: response.answers.guarantyAdequate.noul,
          passed: response.answers.guarantyAdequate.noul >= 0.5
        }
      };

      const violations: string[] = [];
      for (const [key, check] of Object.entries(checks)) {
        if (!check.passed) {
          violations.push(`${check.name} (confidence: ${(check.probability * 100).toFixed(0)}%)`);
        }
      }

      const avgConfidence =
        Object.values(checks).reduce((sum, c) => sum + Math.abs(c.probability - 0.5) * 2, 0) /
        Object.keys(checks).length;

      return {
        compliant: violations.length === 0,
        checks,
        violations,
        exceptionRequired: violations.length > 0,
        confidence: avgConfidence
      };
    } catch (error) {
      throw new APIError('Failed to validate policy', {
        loanId: loanData.id,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  // ==========================================================================
  // Cross-System Validation
  // ==========================================================================

  /**
   * Validate consistency between Box documents and Salesforce records
   */
  async validateConsistency(
    salesforceRecord: Record<string, unknown>,
    boxDocumentContent: string
  ): Promise<ConsistencyValidation> {
    try {
      const response = await this.client.systemOne({
        model: this.config.model,
        state: {
          salesforceRecord,
          boxDocument: boxDocumentContent
        },
        questions: {
          amountMatches: noul({
            instructions: 'Does the loan amount in Salesforce match the Box document?'
          }),
          rateMatches: noul({
            instructions: 'Does the interest rate in Salesforce match the Box document?'
          }),
          ltvMatches: noul({
            instructions: 'Does the LTV in Salesforce match the Box document?'
          }),
          discrepancySeverity: score({
            instructions: 'If inconsistencies exist, how severe are they?',
            criteria: [
              'Minor: Formatting differences only',
              'Moderate: Small number differences',
              'Major: Material term differences',
              'Critical: Fundamental mismatch'
            ]
          })
        }
      });

      const fields: Record<string, any> = {
        amount: {
          field: 'Loan Amount',
          salesforceValue: salesforceRecord.amount,
          boxValue: 'extracted from document',
          matches: response.answers.amountMatches.noul > 0.95,
          matchProbability: response.answers.amountMatches.noul
        },
        rate: {
          field: 'Interest Rate',
          salesforceValue: salesforceRecord.interestRate,
          boxValue: 'extracted from document',
          matches: response.answers.rateMatches.noul > 0.95,
          matchProbability: response.answers.rateMatches.noul
        },
        ltv: {
          field: 'LTV',
          salesforceValue: salesforceRecord.ltv,
          boxValue: 'extracted from document',
          matches: response.answers.ltvMatches.noul > 0.95,
          matchProbability: response.answers.ltvMatches.noul
        }
      };

      const severityScore = response.answers.discrepancySeverity.score;
      let discrepancySeverity: ConsistencyValidation['discrepancySeverity'];
      if (severityScore < 0.75) discrepancySeverity = 'minor';
      else if (severityScore < 1.5) discrepancySeverity = 'moderate';
      else if (severityScore < 2.5) discrepancySeverity = 'major';
      else discrepancySeverity = 'critical';

      const allMatch = Object.values(fields).every(f => f.matches);

      let action: ConsistencyValidation['action'];
      if (allMatch) action = 'approve';
      else if (discrepancySeverity === 'critical') action = 'block';
      else if (discrepancySeverity === 'major') action = 'escalate';
      else action = 'flag';

      return {
        consistent: allMatch,
        fields,
        discrepancySeverity,
        confidence: response.answers.discrepancySeverity.confidence,
        action
      };
    } catch (error) {
      throw new APIError('Failed to validate cross-system consistency', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  // ==========================================================================
  // Portfolio Intelligence
  // ==========================================================================

  /**
   * Analyze patterns across multiple loans
   */
  async analyzePortfolio(loans: PortfolioLoan[]): Promise<PortfolioAnalysis> {
    try {
      const response = await this.client.systemOne({
        model: this.config.model,
        state: {
          portfolio: loans.map(loan => ({
            loanId: loan.loanId,
            borrower: loan.borrower,
            amount: loan.amount,
            ltv: loan.ltv,
            dscr: loan.dscr,
            riskRating: loan.riskRating,
            documentCount: loan.documentCount,
            documentTypes: loan.documentTypes
          }))
        },
        questions: {
          concentrationRisk: score({
            instructions: 'Assess borrower/industry concentration risk',
            criteria: [
              'Low: Well-diversified portfolio',
              'Moderate: Some concentration',
              'High: Heavy concentration',
              'Critical: Excessive concentration'
            ]
          }),
          documentationTrend: score({
            instructions: 'Overall trend in documentation completeness',
            criteria: [
              'Improving: Recent loans better documented',
              'Stable: Consistent quality',
              'Declining: Recent loans less complete',
              'Poor: Widespread gaps'
            ]
          }),
          portfolioHealth: score({
            instructions: 'Overall portfolio health assessment',
            criteria: ['Excellent', 'Good', 'Fair', 'Poor', 'Critical']
          })
        }
      });

      // Find outlier loans (simplified - would use probabilities in real implementation)
      const avgAmount = loans.reduce((sum, l) => sum + l.amount, 0) / loans.length;
      const outlierLoans = loans
        .filter(l => l.amount > avgAmount * 2 || l.ltv > 85 || l.dscr < 1.15)
        .map(l => l.loanId);

      const recommendations: string[] = [];
      if (response.answers.concentrationRisk.score > 2.0) {
        recommendations.push('Recommend diversification to reduce concentration risk');
      }
      if (response.answers.documentationTrend.score > 2.0) {
        recommendations.push('Address declining documentation quality trends');
      }
      if (outlierLoans.length > 0) {
        recommendations.push(`Review ${outlierLoans.length} outlier loan(s)`);
      }

      return {
        concentrationRisk: response.answers.concentrationRisk.score,
        documentationTrend: response.answers.documentationTrend.score,
        outlierLoans,
        portfolioHealth: response.answers.portfolioHealth.score,
        confidence: response.answers.portfolioHealth.confidence,
        recommendations
      };
    } catch (error) {
      throw new APIError('Failed to analyze portfolio', {
        loanCount: loans.length,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Evaluate confidence level from score
   */
  private evaluateConfidence(confidenceScore: number): ConfidenceDecision {
    let level: ConfidenceLevel;
    if (confidenceScore >= this.config.thresholds.high) {
      level = 'high';
    } else if (confidenceScore >= this.config.thresholds.medium) {
      level = 'medium';
    } else {
      level = 'low';
    }

    return {
      level,
      score: confidenceScore,
      autoProcess: level === 'high',
      flagForReview: level === 'medium',
      requiresHuman: level === 'low'
    };
  }

  /**
   * Get current configuration
   */
  getConfig(): Readonly<Required<TypeSafeConfig>> {
    return { ...this.config };
  }
}
