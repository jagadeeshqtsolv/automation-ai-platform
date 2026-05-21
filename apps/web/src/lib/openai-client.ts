import OpenAI from "openai";
import {
  OPENAI_NOT_CONFIGURED_MESSAGE,
  resolveOpenAIConfig,
} from "@/lib/project-openai-config";

export async function resolveOpenAIClient(
  projectId: string,
): Promise<{ client: OpenAI; model: string }> {
  const config = await resolveOpenAIConfig(projectId);
  if (config.apiKey === null) {
    throw new Error(OPENAI_NOT_CONFIGURED_MESSAGE);
  }
  return {
    client: new OpenAI({ apiKey: config.apiKey }),
    model: config.model,
  };
}

export function normalizeOpenAITemperature(model: string, temperature: number): number {
  // Recent gpt-5 models only accept the default temperature of 1,
  // so do not send a custom value for those models.
  if (/^gpt-5(?:\.|$)/i.test(model)) {
    return 1;
  }
  return temperature;
}
