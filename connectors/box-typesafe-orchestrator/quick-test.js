#!/usr/bin/env node
/**
 * Quick TypeSafe API Test
 * Tests real API performance without TypeScript compilation
 */

import { fileURLToPath } from 'node:url';
import { TypeSafeClient, choice, noul, score } from 'typesafe-sdk';

// Load keys from the repo-root .env (gitignored; copy from .env.sample).
try {
  process.loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url)));
} catch {
  // No .env file; fall back to the shell environment.
}

const apiKey = process.env.TYPESAFE_API_KEY;
if (!apiKey) {
  console.error('❌ TYPESAFE_API_KEY not set. Add it to .env (see .env.sample).');
  process.exit(1);
}

async function runQuickBenchmark() {
  console.log('\n🚀 TypeSafe Real API Benchmark\n');
  console.log('Testing with REAL TypeSafe API calls...\n');

  const client = new TypeSafeClient({ apiKey });

  // Test 1: Intent Routing (10 iterations)
  console.log('📊 Test 1: Intent Routing (10 iterations)');
  const intentTimes = [];
  for (let i = 0; i < 10; i++) {
    const start = performance.now();
    const result = await client.systemOne({
      model: 'jev-latest',
      state: "What's the risk profile for this loan?",
      questions: {
        intent: choice({
          instructions: 'What operation should handle this?',
          criteria: {
            search_documents: 'Find loan documents',
            score_risk: 'Assess loan risk',
            validate_policy: 'Check policy'
          }
        })
      }
    });
    const end = performance.now();
    intentTimes.push(end - start);
    if ((i + 1) % 5 === 0) process.stdout.write(`  ${i + 1}/10 ✓\n`);
  }

  const intentAvg = intentTimes.reduce((a, b) => a + b) / intentTimes.length;
  console.log(`  Average: ${intentAvg.toFixed(0)}ms\n`);

  // Test 2: Classification Validation (10 iterations)
  console.log('📊 Test 2: Classification Validation (10 iterations)');
  const classificationTimes = [];
  for (let i = 0; i < 10; i++) {
    const start = performance.now();
    const result = await client.systemOne({
      model: 'jev-latest',
      state: {
        boxClassification: 'Term Sheet',
        loanType: 'Commercial Real Estate',
        loanStage: 'Underwriting'
      },
      questions: {
        confidence: score({
          instructions: 'How confident in Box classification?',
          criteria: ['High: Apply auto', 'Medium: Review', 'Low: Manual']
        }),
        appropriate: noul({
          instructions: 'Does this doc type make sense for this loan?'
        })
      }
    });
    const end = performance.now();
    classificationTimes.push(end - start);
    if ((i + 1) % 5 === 0) process.stdout.write(`  ${i + 1}/10 ✓\n`);
  }

  const classAvg = classificationTimes.reduce((a, b) => a + b) / classificationTimes.length;
  console.log(`  Average: ${classAvg.toFixed(0)}ms\n`);

  // Test 3: Risk Scoring (10 iterations)
  console.log('📊 Test 3: Risk Scoring (10 iterations)');
  const riskTimes = [];
  for (let i = 0; i < 10; i++) {
    const start = performance.now();
    const result = await client.systemOne({
      model: 'jev-latest',
      state: {
        loan: { amount: 4800000, ltv: 0.85, dscr: 1.12 }
      },
      questions: {
        creditRisk: score({
          instructions: 'Assess overall credit risk',
          criteria: ['Low', 'Medium', 'High', 'Critical']
        }),
        collateralRisk: score({
          instructions: 'Evaluate collateral adequacy',
          criteria: ['Excellent', 'Good', 'Fair', 'Poor']
        })
      }
    });
    const end = performance.now();
    riskTimes.push(end - start);
    if ((i + 1) % 5 === 0) process.stdout.write(`  ${i + 1}/10 ✓\n`);
  }

  const riskAvg = riskTimes.reduce((a, b) => a + b) / riskTimes.length;
  console.log(`  Average: ${riskAvg.toFixed(0)}ms\n`);

  // Summary
  console.log('=' .repeat(60));
  console.log('\n📈 REAL Performance Results:\n');
  console.log(`Intent Routing:          ${intentAvg.toFixed(0)}ms avg`);
  console.log(`Classification:          ${classAvg.toFixed(0)}ms avg`);
  console.log(`Risk Scoring:            ${riskAvg.toFixed(0)}ms avg`);
  console.log(`\n✓ All tests completed successfully!\n`);

  // Save results
  const results = {
    timestamp: new Date().toISOString(),
    results: {
      intentRouting: { avgMs: Math.round(intentAvg), times: intentTimes },
      classification: { avgMs: Math.round(classAvg), times: classificationTimes },
      riskScoring: { avgMs: Math.round(riskAvg), times: riskTimes }
    }
  };

  const fs = await import('fs');
  fs.writeFileSync('real-benchmark-results.json', JSON.stringify(results, null, 2));
  console.log('Results saved to: real-benchmark-results.json\n');
}

runQuickBenchmark().catch(console.error);
