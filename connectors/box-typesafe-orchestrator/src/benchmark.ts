/**
 * TypeSafe Orchestrator Performance Benchmarking
 *
 * Measures performance of TypeSafe operations and compares against baseline.
 */

import { TypeSafeOrchestrator } from './orchestrator.js';
import type {
  LoanData,
  DocumentMetadata,
  LoanContext,
  PolicyCriteria,
  PortfolioLoan
} from './types.js';

export interface BenchmarkResult {
  operation: string;
  iterations: number;
  totalTime: number;
  avgTime: number;
  minTime: number;
  maxTime: number;
  p50Time: number;
  p95Time: number;
  p99Time: number;
  tokensUsed?: number;
  avgTokensPerOp?: number;
}

export interface ComparisonResult extends BenchmarkResult {
  baselineAvgTime: number;
  improvement: number;
  improvementPercent: number;
}

export class TypeSafeBenchmark {
  private orchestrator: TypeSafeOrchestrator;
  private results: BenchmarkResult[] = [];

  constructor(orchestrator: TypeSafeOrchestrator) {
    this.orchestrator = orchestrator;
  }

  /**
   * Run a benchmark test
   */
  async runBenchmark(
    name: string,
    operation: () => Promise<any>,
    iterations: number = 100
  ): Promise<BenchmarkResult> {
    const times: number[] = [];

    console.log(`\n🏃 Running benchmark: ${name} (${iterations} iterations)`);

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await operation();
      const end = performance.now();
      times.push(end - start);

      if ((i + 1) % 10 === 0) {
        process.stdout.write(`\r  Progress: ${i + 1}/${iterations}`);
      }
    }

    console.log(`\r  Progress: ${iterations}/${iterations} ✓`);

    times.sort((a, b) => a - b);

    const result: BenchmarkResult = {
      operation: name,
      iterations,
      totalTime: times.reduce((sum, t) => sum + t, 0),
      avgTime: times.reduce((sum, t) => sum + t, 0) / times.length,
      minTime: times[0],
      maxTime: times[times.length - 1],
      p50Time: times[Math.floor(times.length * 0.5)],
      p95Time: times[Math.floor(times.length * 0.95)],
      p99Time: times[Math.floor(times.length * 0.99)]
    };

    this.results.push(result);
    return result;
  }

  /**
   * Benchmark intent routing
   */
  async benchmarkIntentRouting(queries: string[], iterations: number = 100): Promise<BenchmarkResult> {
    let queryIndex = 0;
    return this.runBenchmark(
      'Intent Routing',
      async () => {
        const query = queries[queryIndex % queries.length];
        queryIndex++;
        await this.orchestrator.routeIntent(query);
      },
      iterations
    );
  }

  /**
   * Benchmark classification validation
   */
  async benchmarkClassificationValidation(
    classifications: Array<{ type: string; context: LoanContext }>,
    iterations: number = 100
  ): Promise<BenchmarkResult> {
    let classIndex = 0;
    return this.runBenchmark(
      'Classification Validation',
      async () => {
        const item = classifications[classIndex % classifications.length];
        classIndex++;
        await this.orchestrator.validateClassification(item.type, item.context);
      },
      iterations
    );
  }

  /**
   * Benchmark risk scoring
   */
  async benchmarkRiskScoring(
    loans: Array<{ data: LoanData; documents: DocumentMetadata[] }>,
    iterations: number = 100
  ): Promise<BenchmarkResult> {
    let loanIndex = 0;
    return this.runBenchmark(
      'Risk Scoring',
      async () => {
        const loan = loans[loanIndex % loans.length];
        loanIndex++;
        await this.orchestrator.scoreLoanRisk(loan.data, loan.documents);
      },
      iterations
    );
  }

  /**
   * Benchmark policy validation
   */
  async benchmarkPolicyValidation(
    loans: Array<{ data: LoanData; criteria: PolicyCriteria }>,
    iterations: number = 100
  ): Promise<BenchmarkResult> {
    let loanIndex = 0;
    return this.runBenchmark(
      'Policy Validation',
      async () => {
        const loan = loans[loanIndex % loans.length];
        loanIndex++;
        await this.orchestrator.validatePolicy(loan.data, loan.criteria);
      },
      iterations
    );
  }

  /**
   * Benchmark portfolio analysis
   */
  async benchmarkPortfolioAnalysis(
    portfolios: PortfolioLoan[][],
    iterations: number = 50
  ): Promise<BenchmarkResult> {
    let portfolioIndex = 0;
    return this.runBenchmark(
      'Portfolio Analysis',
      async () => {
        const portfolio = portfolios[portfolioIndex % portfolios.length];
        portfolioIndex++;
        await this.orchestrator.analyzePortfolio(portfolio);
      },
      iterations
    );
  }

  /**
   * Compare with baseline
   */
  compareWithBaseline(
    result: BenchmarkResult,
    baselineAvgTime: number
  ): ComparisonResult {
    const improvement = baselineAvgTime / result.avgTime;
    const improvementPercent = ((baselineAvgTime - result.avgTime) / baselineAvgTime) * 100;

    return {
      ...result,
      baselineAvgTime,
      improvement,
      improvementPercent
    };
  }

  /**
   * Print results table
   */
  printResults(): void {
    console.log('\n📊 Benchmark Results:\n');
    console.log('┌─────────────────────────────┬──────────┬──────────┬──────────┬──────────┬──────────┐');
    console.log('│ Operation                   │ Avg (ms) │ P50 (ms) │ P95 (ms) │ P99 (ms) │ Min-Max  │');
    console.log('├─────────────────────────────┼──────────┼──────────┼──────────┼──────────┼──────────┤');

    for (const result of this.results) {
      const name = result.operation.padEnd(27);
      const avg = result.avgTime.toFixed(1).padStart(6);
      const p50 = result.p50Time.toFixed(1).padStart(6);
      const p95 = result.p95Time.toFixed(1).padStart(6);
      const p99 = result.p99Time.toFixed(1).padStart(6);
      const minMax = `${result.minTime.toFixed(0)}-${result.maxTime.toFixed(0)}`.padStart(8);

      console.log(`│ ${name} │ ${avg} │ ${p50} │ ${p95} │ ${p99} │ ${minMax} │`);
    }

    console.log('└─────────────────────────────┴──────────┴──────────┴──────────┴──────────┴──────────┘\n');
  }

  /**
   * Print comparison table
   */
  printComparison(comparisons: ComparisonResult[]): void {
    console.log('\n📈 Performance Comparison:\n');
    console.log('┌─────────────────────────────┬──────────────┬──────────────┬─────────────┬────────────┐');
    console.log('│ Operation                   │ TypeSafe (ms)│ Baseline (ms)│ Improvement │ Savings %  │');
    console.log('├─────────────────────────────┼──────────────┼──────────────┼─────────────┼────────────┤');

    for (const comp of comparisons) {
      const name = comp.operation.padEnd(27);
      const typesafe = comp.avgTime.toFixed(1).padStart(10);
      const baseline = comp.baselineAvgTime.toFixed(1).padStart(10);
      const improvement = `${comp.improvement.toFixed(1)}x`.padStart(9);
      const savings = `${comp.improvementPercent.toFixed(0)}%`.padStart(8);

      console.log(`│ ${name} │ ${typesafe} │ ${baseline} │ ${improvement} │ ${savings} │`);
    }

    console.log('└─────────────────────────────┴──────────────┴──────────────┴─────────────┴────────────┘\n');
  }

  /**
   * Export results as JSON
   */
  exportResults(filename: string): void {
    const fs = require('fs');
    fs.writeFileSync(
      filename,
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          results: this.results,
          summary: {
            totalOperations: this.results.reduce((sum, r) => sum + r.iterations, 0),
            avgLatency: this.results.reduce((sum, r) => sum + r.avgTime, 0) / this.results.length
          }
        },
        null,
        2
      )
    );
    console.log(`✓ Results exported to ${filename}`);
  }

  /**
   * Get all results
   */
  getResults(): BenchmarkResult[] {
    return [...this.results];
  }

  /**
   * Reset results
   */
  reset(): void {
    this.results = [];
  }
}

/**
 * Run comprehensive benchmark suite
 */
export async function runFullBenchmark(orchestrator: TypeSafeOrchestrator): Promise<void> {
  const benchmark = new TypeSafeBenchmark(orchestrator);

  // Test data
  const queries = [
    "What's the risk profile for this loan?",
    "Find critical risk documents",
    "Extract loan terms from the term sheet",
    "Validate against credit policy",
    "Generate commitment letter"
  ];

  const classifications = [
    { type: "Term Sheet", context: { loanId: "LN-1", loanType: "CRE", status: "Underwriting", existingDocuments: [] } },
    { type: "Financial Statement", context: { loanId: "LN-2", loanType: "C&I", status: "Application", existingDocuments: [] } },
    { type: "Appraisal", context: { loanId: "LN-3", loanType: "CRE", status: "Credit Review", existingDocuments: [] } }
  ];

  const loans = [
    {
      data: { id: "1", amount: 4800000, ltv: 0.85, dscr: 1.12, termMonths: 84, interestRate: 7.25, borrower: "Test 1" },
      documents: []
    },
    {
      data: { id: "2", amount: 2500000, ltv: 0.70, dscr: 1.35, termMonths: 60, interestRate: 6.75, borrower: "Test 2" },
      documents: []
    }
  ];

  const policyLoans = [
    {
      data: { id: "1", amount: 4800000, ltv: 0.85, dscr: 1.12, termMonths: 84, interestRate: 7.25, borrower: "Test 1" },
      criteria: { maxLtv: 0.80, minDscr: 1.25, allowedCollateralTypes: ["Real Estate"], requiresGuaranty: true }
    }
  ];

  const portfolios = [
    [
      { loanId: "L1", borrower: "B1", amount: 1000000, ltv: 0.75, dscr: 1.3, riskRating: "Medium", documentCount: 8, documentTypes: [] },
      { loanId: "L2", borrower: "B2", amount: 2000000, ltv: 0.80, dscr: 1.2, riskRating: "High", documentCount: 6, documentTypes: [] }
    ]
  ];

  console.log('\n🎯 Starting TypeSafe Performance Benchmark Suite\n');
  console.log('=' .repeat(70));

  // Run benchmarks
  await benchmark.benchmarkIntentRouting(queries, 50);
  await benchmark.benchmarkClassificationValidation(classifications, 50);
  await benchmark.benchmarkRiskScoring(loans, 50);
  await benchmark.benchmarkPolicyValidation(policyLoans, 50);
  await benchmark.benchmarkPortfolioAnalysis(portfolios, 25);

  // Print results
  benchmark.printResults();

  // Compare with baseline (estimated from documentation)
  const comparisons = [
    benchmark.compareWithBaseline(benchmark.getResults()[0], 2500), // Intent routing: 2-4s baseline
    benchmark.compareWithBaseline(benchmark.getResults()[1], 2500), // Classification: 2-3s baseline
    benchmark.compareWithBaseline(benchmark.getResults()[2], 6500), // Risk scoring: 5-8s baseline
    benchmark.compareWithBaseline(benchmark.getResults()[3], 16000), // Policy validation: 12-20s baseline
    benchmark.compareWithBaseline(benchmark.getResults()[4], 12500) // Portfolio: 10-15s baseline
  ];

  benchmark.printComparison(comparisons);

  // Export
  benchmark.exportResults('benchmark-results.json');

  console.log('\n✓ Benchmark complete!\n');
}
