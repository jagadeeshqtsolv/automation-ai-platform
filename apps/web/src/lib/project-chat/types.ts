export type ChatIntent =
  | "help"
  | "status"
  | "list_specs"
  | "list_page_objects"
  | "run_all"
  | "stop"
  | "rerun_failures"
  | "navigate"
  | "unknown";

export type ChatAction =
  | { type: "navigate"; tab: string }
  | { type: "highlight_run"; runId: string };

export type ChatReply = {
  message: string;
  intent: ChatIntent;
  actions?: ChatAction[];
};
