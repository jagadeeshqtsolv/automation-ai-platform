import type { ChatIntent } from "@/lib/project-chat/types";

function normalize(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Rule-based intent — no LLM cost. */
export function parseChatIntent(message: string): ChatIntent {
  const text = normalize(message);
  if (text.length === 0) {
    return "unknown";
  }

  if (/^(help|\?|commands|what can you do)/.test(text)) {
    return "help";
  }

  if (
    /^(status|last run|run status|test status)/.test(text) ||
    /what.*(last|latest) run/.test(text)
  ) {
    return "status";
  }

  if (/^(list specs|list tests|show specs|specs)$/.test(text) || /list.*spec/.test(text)) {
    return "list_specs";
  }

  if (/^(list pages|list page objects|page objects|pages)$/.test(text) || /list.*page object/.test(text)) {
    return "list_page_objects";
  }

  if (
    /^(run tests|run all|execute tests|start tests|run)$/.test(text) ||
    (/run/.test(text) && /test|spec/.test(text) && !/rerun|report|status/.test(text))
  ) {
    return "run_all";
  }

  if (/^(stop|cancel|stop run|stop tests|abort)/.test(text)) {
    return "stop";
  }

  if (/rerun.*fail|fail.*rerun|retry fail/.test(text)) {
    return "rerun_failures";
  }

  if (/^(open|go to|show)\s+(reports?|execution|setup|requirements|plans?|framework)/.test(text)) {
    return "navigate";
  }

  return "unknown";
}

export function parseNavigateTab(message: string): string {
  const text = normalize(message);
  if (/report/.test(text)) {
    return "test-reports";
  }
  if (/execution|run/.test(text)) {
    return "test-execution";
  }
  if (/setup|environment/.test(text)) {
    return "setup";
  }
  if (/requirement/.test(text)) {
    return "requirements";
  }
  if (/plan/.test(text)) {
    return "test-plans";
  }
  if (/framework|files/.test(text)) {
    return "framework";
  }
  return "overview";
}
