/**
 * TypeSafe Orchestrator Type Definitions
 */

// ============================================================================
// Routing & Confidence
// ============================================================================

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface ConfidenceDecision {
  level: ConfidenceLevel;
  score: number;
  autoProcess: boolean;
  flagForReview: boolean;
  requiresHuman: boolean;
}

// ============================================================================
// Intent Routing
// ============================================================================

export type UserIntent =
  | 'search_documents'
  | 'extract_terms'
  | 'validate_policy'
  | 'score_risk'
  | 'generate_letter'
  | 'prepare_signature'
  | 'review_history'
  | 'update_record';

export interface IntentRoute {
  intent: UserIntent;
  confidence: number;
  mcpToolSequence: MCPToolCall[];
  requiresClarification: boolean;
}

export interface MCPToolCall {
  connector: 'box' | 'salesforce';
  tool: string;
  parameters: Record<string, unknown>;
}

// ============================================================================
// Document Classification
// ============================================================================

export type DocumentType =
  | 'Loan Application'
  | 'Term Sheet'
  | 'Financial Statement'
  | 'Tax Return'
  | 'Appraisal'
  | 'Insurance'
  | 'Credit Memo'
  | 'Commitment Letter'
  | 'Executed Agreement'
  | 'Other';

export interface ClassificationValidation {
  documentType: DocumentType;
  confidence: ConfidenceDecision;
  contextuallyAppropriate: boolean;
  duplicateRisk: number;
  recommendation: 'auto_apply' | 'flag_for_review' | 'manual_classification';
}

export interface LoanContext {
  loanId: string;
  loanType: string;
  status: string;
  existingDocuments: Array<{ type: string; name: string }>;
}

// ============================================================================
// Risk Scoring
// ============================================================================

export type RiskLevel = 'Low' | 'Medium' | 'High' | 'Critical';

export interface RiskScore {
  creditScore: number;          // 0-3 weighted score
  collateralScore: number;      // 0-3 weighted score
  compositeScore: number;       // Weighted combination
  riskLevel: RiskLevel;
  confidence: number;
  requiresSeniorReview: boolean;
  breakdown: RiskBreakdown;
}

export interface RiskBreakdown {
  ltv: { value: number; risk: number };
  dscr: { value: number; risk: number };
  creditHistory: { risk: number };
  collateralQuality: { risk: number };
}

export interface LoanData {
  id: string;
  amount: number;
  ltv: number;
  dscr: number;
  termMonths: number;
  interestRate: number;
  borrower: string;
  [key: string]: unknown;
}

export interface DocumentMetadata {
  id: string;
  name: string;
  type: string;
  size: number;
  modifiedAt: string;
  versionCount: number;
  [key: string]: unknown;
}

// ============================================================================
// Policy Validation
// ============================================================================

export interface PolicyValidation {
  compliant: boolean;
  checks: Record<string, PolicyCheck>;
  violations: string[];
  exceptionRequired: boolean;
  confidence: number;
}

export interface PolicyCheck {
  name: string;
  probability: number;    // 0-1 compliance probability
  passed: boolean;        // True if prob > threshold
  details?: string;
}

export interface PolicyCriteria {
  maxLtv: number;
  minDscr: number;
  allowedCollateralTypes: string[];
  requiresGuaranty: boolean;
  [key: string]: unknown;
}

// ============================================================================
// Cross-System Validation
// ============================================================================

export interface ConsistencyValidation {
  consistent: boolean;
  fields: Record<string, FieldComparison>;
  discrepancySeverity: 'minor' | 'moderate' | 'major' | 'critical';
  confidence: number;
  action: 'approve' | 'flag' | 'escalate' | 'block';
}

export interface FieldComparison {
  field: string;
  salesforceValue: unknown;
  boxValue: unknown;
  matches: boolean;
  matchProbability: number;
}

// ============================================================================
// Portfolio Intelligence
// ============================================================================

export interface PortfolioAnalysis {
  concentrationRisk: number;     // 0-3 score
  documentationTrend: number;    // 0-3 score
  outlierLoans: string[];        // Loan IDs
  portfolioHealth: number;       // 0-4 score
  confidence: number;
  recommendations: string[];
}

export interface PortfolioLoan {
  loanId: string;
  borrower: string;
  amount: number;
  ltv: number;
  dscr: number;
  riskRating: string;
  documentCount: number;
  documentTypes: string[];
}

// ============================================================================
// Workflow Orchestration
// ============================================================================

export interface WorkflowResult {
  workflowId: string;
  success: boolean;
  steps: WorkflowStep[];
  finalState: Record<string, unknown>;
  confidence: number;
  duration: number;
}

export interface WorkflowStep {
  stepId: string;
  action: string;
  connector: 'box' | 'salesforce' | 'typesafe';
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  result?: unknown;
  confidence?: number;
  startedAt: Date;
  completedAt?: Date;
}

// ============================================================================
// Error Types
// ============================================================================

export class TypeSafeOrchestratorError extends Error {
  constructor(
    message: string,
    public code: string,
    public context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'TypeSafeOrchestratorError';
  }
}

export class ConfigurationError extends TypeSafeOrchestratorError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'CONFIGURATION_ERROR', context);
    this.name = 'ConfigurationError';
  }
}

export class ValidationError extends TypeSafeOrchestratorError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', context);
    this.name = 'ValidationError';
  }
}

export class APIError extends TypeSafeOrchestratorError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'API_ERROR', context);
    this.name = 'APIError';
  }
}
