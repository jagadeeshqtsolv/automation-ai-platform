import {
  executionConfigSchema,
  executionProviderLabel,
  type ExecutionConfig,
} from "@automation-ai/shared";
import { decryptSecret, encryptSecret } from "@/lib/secret-crypto";

export type StoredExecutionSecrets = {
  saucelabsAccessKeyEnc?: string | null;
  browserstackAccessKeyEnc?: string | null;
  lambdatestAccessKeyEnc?: string | null;
};

export type ExecutionConfigDocument = {
  config: ExecutionConfig;
  secrets: StoredExecutionSecrets;
};

export const DEFAULT_EXECUTION_CONFIG: ExecutionConfig = {
  provider: "local",
};

export function parseExecutionConfigJson(raw: string | null | undefined): ExecutionConfig {
  if (raw === null || raw === undefined || raw.trim().length === 0) {
    return DEFAULT_EXECUTION_CONFIG;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    const result = executionConfigSchema.safeParse(parsed);
    return result.success ? result.data : DEFAULT_EXECUTION_CONFIG;
  } catch {
    return DEFAULT_EXECUTION_CONFIG;
  }
}

export function parseExecutionConfigDocument(raw: string | null | undefined): ExecutionConfigDocument {
  if (raw === null || raw === undefined || raw.trim().length === 0) {
    return { config: DEFAULT_EXECUTION_CONFIG, secrets: {} };
  }
  try {
    const parsed = JSON.parse(raw) as {
      config?: unknown;
      secrets?: StoredExecutionSecrets;
    };
    const config = executionConfigSchema.safeParse(parsed.config ?? parsed);
    return {
      config: config.success ? config.data : DEFAULT_EXECUTION_CONFIG,
      secrets: parsed.secrets ?? {},
    };
  } catch {
    return { config: DEFAULT_EXECUTION_CONFIG, secrets: {} };
  }
}

export function serializeExecutionConfigDocument(doc: ExecutionConfigDocument): string {
  return JSON.stringify(doc);
}

export function decryptAccessKey(enc: string | null | undefined): string | null {
  if (enc === null || enc === undefined || enc.length === 0) {
    return null;
  }
  return decryptSecret(enc);
}

export function encryptAccessKey(plain: string | null | undefined): string | null {
  if (plain === null || plain === undefined || plain.trim().length === 0) {
    return null;
  }
  return encryptSecret(plain.trim());
}

export function sauceHubHostname(region: string): string {
  if (region === "eu-central-1") {
    return "ondemand.eu-central-1.saucelabs.com";
  }
  if (region === "apac-southeast-1") {
    return "ondemand.apac-southeast-1.saucelabs.com";
  }
  return "ondemand.us-west-1.saucelabs.com";
}

export function providerLabel(provider: ExecutionConfig["provider"]): string {
  return executionProviderLabel(provider);
}
