import { AI_NOT_CONFIGURED_MESSAGE } from "@/lib/project-ai-config";

export function aiGenerationErrorStatus(message: string): number {
  if (message.includes(AI_NOT_CONFIGURED_MESSAGE) || message.includes("not configured")) {
    return 503;
  }
  const lower = message.toLowerCase();
  if (
    lower.includes("incorrect api key") ||
    lower.includes("invalid api key") ||
    lower.includes("invalid x-api-key") ||
    lower.includes("authentication") ||
    lower.includes("unauthorized") ||
    lower.includes("permission denied")
  ) {
    return 401;
  }
  if (lower.includes("rate limit") || lower.includes("quota") || lower.includes("overloaded")) {
    return 429;
  }
  if (lower.includes("model") && (lower.includes("not found") || lower.includes("does not exist"))) {
    return 400;
  }
  return 500;
}
