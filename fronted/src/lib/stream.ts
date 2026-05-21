import type { ApiMessage, StreamEvent } from "../types";

type StreamHandlers = {
  onEvent: (event: StreamEvent) => void;
};

function parseEvent(block: string): StreamEvent | null {
  const lines = block.split("\n");
  let event = "message";
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim();
    }

    if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trimStart());
    }
  }

  if (!event && dataLines.length === 0) {
    return null;
  }

  const rawData = dataLines.join("\n");
  let data: Record<string, unknown> | null = null;
  if (rawData) {
    try {
      data = JSON.parse(rawData);
    } catch {
      data = { content: rawData };
    }
  }

  return { event, data };
}

async function readEventStream(response: Response, handlers: StreamHandlers): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("当前浏览器不支持流式读取。");
  }

  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    buffer = buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const rawBlock = buffer.slice(0, boundary).trim();
      buffer = buffer.slice(boundary + 2);

      if (rawBlock) {
        const event = parseEvent(rawBlock);
        if (event) {
          handlers.onEvent(event);
        }
      }

      boundary = buffer.indexOf("\n\n");
    }
  }

  const tail = buffer.trim();
  if (tail) {
    const event = parseEvent(tail);
    if (event) {
      handlers.onEvent(event);
    }
  }
}

export async function streamChat(
  messages: ApiMessage[],
  handlers: StreamHandlers,
  signal: AbortSignal
): Promise<void> {
  const response = await fetch("/api/chat/stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream"
    },
    body: JSON.stringify({ messages, temperature: 0.3, web_search: "auto" }),
    signal
  });

  if (!response.ok) {
    throw new Error(`请求失败：${response.status}`);
  }

  await readEventStream(response, handlers);
}
