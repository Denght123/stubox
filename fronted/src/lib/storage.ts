import type { ChatMessage } from "../types";

const STORAGE_KEY = "hbwe-admissions-ai:messages";

export function loadMessages(): ChatMessage[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((item): item is ChatMessage => {
      return (
        item &&
        (item.role === "user" || item.role === "assistant") &&
        typeof item.content === "string" &&
        typeof item.id === "string"
      );
    });
  } catch {
    return [];
  }
}

export function saveMessages(messages: ChatMessage[]): void {
  const stableMessages = messages.map((message) => ({
    ...message,
    status: message.status === "streaming" ? "done" : message.status
  }));
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stableMessages));
}

export function clearMessages(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}
