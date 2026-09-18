#!/usr/bin/env node
/**
 * TypeSafe Orchestrator Benchmark Runner
 *
 * Usage:
 *   npm run benchmark                    # Run full benchmark suite
 *   npm run benchmark -- --quick         # Quick benchmark (fewer iterations)
 *   npm run benchmark -- --operation=routing  # Benchmark specific operation
 */

import { TypeSafeOrchestrator } from './src/orchestrator.js';
import { loadConfigFromEnv } from './src/config.js';
import { runFullBenchmark } from './src/benchmark.js';

async function main() {
  const args = process.argv.slice(2);
  const quick = args.includes('--quick');
  const operation = args.find(arg => arg.startsWith('--operation='))?.split('=')[1];

  console.log('\n🚀 TypeSafe Orchestrator Benchmark\n');

  // Load configuration
  const config = loadConfigFromEnv();
  if (!config.apiKey) {
    console.error('❌ Error: TYPESAFE_API_KEY environment variable not set');
    console.error('   Set it with: export TYPESAFE_API_KEY=your_key_here');
    process.exit(1);
  }

  // Create orchestrator
  const orchestrator = new TypeSafeOrchestrator(config);

  // Run benchmark
  try {
    if (operation) {
      console.log(`📊 Benchmarking specific operation: ${operation}\n`);
      // TODO: Add specific operation benchmarks
    } else {
      await runFullBenchmark(orchestrator);
    }
  } catch (error) {
    console.error('\n❌ Benchmark failed:');
    console.error(error);
    process.exit(1);
  }
}

main().catch(console.error);
