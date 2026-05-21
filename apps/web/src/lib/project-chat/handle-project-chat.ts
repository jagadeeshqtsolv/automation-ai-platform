import { executeChatIntent } from "@/lib/project-chat/execute-chat-intent";
import { parseChatIntent } from "@/lib/project-chat/parse-chat-intent";
import type { ChatReply } from "@/lib/project-chat/types";

export async function handleProjectChatMessage(params: {
  projectId: string;
  message: string;
}): Promise<ChatReply> {
  const trimmed = params.message.trim();
  if (trimmed.length === 0) {
    return {
      message: "Type a command. Say **help** for available commands.",
      intent: "unknown",
    };
  }

  const intent = parseChatIntent(trimmed);

  if (intent === "unknown") {
    return {
      message: `I didn't recognize that command. Say **help** for a list of commands.`,
      intent: "unknown",
    };
  }

  return executeChatIntent(params.projectId, intent, trimmed);
}
