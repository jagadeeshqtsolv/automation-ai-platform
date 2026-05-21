import { OPENAI_NOT_CONFIGURED_MESSAGE } from "@/lib/project-openai-config";

export function openaiGenerationErrorStatus(message: string): number {
  if (
    message.includes(OPENAI_NOT_CONFIGURED_MESSAGE) ||
    message.includes("OpenAI API key is not configured")
  ) {
    return 503;
  }
  const lower = message.toLowerCase();
  if (
    lower.includes("incorrect api key") ||
    lower.includes("invalid api key") ||
    lower.includes("authentication") ||
    lower.includes("unauthorized")
  ) {
    return 401;
  }
  if (lower.includes("rate limit") || lower.includes("quota")) {
    return 429;
  }
  if (lower.includes("model") && (lower.includes("not found") || lower.includes("does not exist"))) {
    return 400;
  }
  return 500;
}
