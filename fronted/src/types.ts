export type ChatRole = "user" | "assistant";

export type MessageStatus = "streaming" | "done" | "error";

export type MessageActivity = "thinking" | "searching";

export type AppStatus = "idle" | "searching" | "streaming" | "error";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
  status?: MessageStatus;
  activity?: MessageActivity;
  model?: string;
};

export type ApiMessage = {
  role: ChatRole;
  content: string;
};

export type StreamEventName =
  | "model"
  | "fallback"
  | "search_start"
  | "search_done"
  | "search_error"
  | "delta"
  | "error"
  | "done";

export type StreamEvent = {
  event: StreamEventName | string;
  data: Record<string, unknown> | null;
};
