/**
 * TypeSafe Orchestrator Configuration
 */

export interface TypeSafeConfig {
  /** TypeSafe API key */
  apiKey: string;

  /** Model to use (default: jev-latest) */
  model?: string;

  /** API endpoint URL */
  apiUrl?: string;

  /** Request timeout in milliseconds */
  timeoutMs?: number;

  /** Confidence thresholds for routing decisions */
  thresholds?: ConfidenceThresholds;
}

export interface ConfidenceThresholds {
  /** High confidence threshold (auto-process) - default 0.85 */
  high: number;

  /** Medium confidence threshold (flag for review) - default 0.50 */
  medium: number;
}

export const DEFAULT_CONFIG: Partial<TypeSafeConfig> = {
  model: 'jev-latest',
  apiUrl: 'https://api.typesafe.ai/v1/systemone',
  timeoutMs: 30000,
  thresholds: {
    high: 0.85,
    medium: 0.50
  }
};

/**
 * Load configuration from environment variables
 */
export function loadConfigFromEnv(): Partial<TypeSafeConfig> {
  return {
    apiKey: process.env.TYPESAFE_API_KEY,
    model: process.env.TYPESAFE_MODEL || DEFAULT_CONFIG.model,
    apiUrl: process.env.TYPESAFE_API_URL || DEFAULT_CONFIG.apiUrl,
    timeoutMs: process.env.TYPESAFE_TIMEOUT_MS
      ? parseInt(process.env.TYPESAFE_TIMEOUT_MS, 10)
      : DEFAULT_CONFIG.timeoutMs,
    thresholds: {
      high: process.env.TYPESAFE_HIGH_CONFIDENCE_THRESHOLD
        ? parseFloat(process.env.TYPESAFE_HIGH_CONFIDENCE_THRESHOLD)
        : DEFAULT_CONFIG.thresholds!.high,
      medium: process.env.TYPESAFE_MEDIUM_CONFIDENCE_THRESHOLD
        ? parseFloat(process.env.TYPESAFE_MEDIUM_CONFIDENCE_THRESHOLD)
        : DEFAULT_CONFIG.thresholds!.medium
    }
  };
}

/**
 * Validate configuration
 */
export function validateConfig(config: TypeSafeConfig): void {
  if (!config.apiKey) {
    throw new Error(
      'TypeSafe API key is required. Set TYPESAFE_API_KEY environment variable or pass apiKey in config.'
    );
  }

  if (config.thresholds) {
    if (config.thresholds.high < 0 || config.thresholds.high > 1) {
      throw new Error('High confidence threshold must be between 0 and 1');
    }
    if (config.thresholds.medium < 0 || config.thresholds.medium > 1) {
      throw new Error('Medium confidence threshold must be between 0 and 1');
    }
    if (config.thresholds.medium >= config.thresholds.high) {
      throw new Error('Medium threshold must be less than high threshold');
    }
  }
}
