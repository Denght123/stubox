import { Bot, GraduationCap, UserRound } from "lucide-react";
import { useEffect, useRef } from "react";
import type { ChatMessage } from "../types";
import { RichMessage } from "./RichMessage";

type MessageListProps = {
  messages: ChatMessage[];
  suggestions: string[];
  isStreaming: boolean;
  onSuggestionClick: (value: string) => void;
};

export function MessageList({
  messages,
  suggestions,
  isStreaming,
  onSuggestionClick
}: MessageListProps) {
  const bubbleRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    const streamingAssistant = [...messages]
      .reverse()
      .find((message) => message.role === "assistant" && message.status === "streaming");
    if (!streamingAssistant) {
      return;
    }

    const bubble = bubbleRefs.current[streamingAssistant.id];
    if (bubble) {
      bubble.scrollTop = bubble.scrollHeight;
    }
  }, [messages]);

  if (messages.length === 0) {
    return (
      <section className="welcome" aria-label="招生咨询欢迎区">
        <div className="welcome__badge">
          <GraduationCap size={18} aria-hidden="true" />
          河北水利电力学院
        </div>
        <h1>
          你好，我是招生 AI 助手
          <span>需要我为你了解什么？</span>
        </h1>
        <div className="suggestions" aria-label="快捷问题">
          {suggestions.map((suggestion) => (
            <button
              className="suggestion"
              type="button"
              key={suggestion}
              onClick={() => onSuggestionClick(suggestion)}
            >
              {suggestion}
            </button>
          ))}
        </div>
      </section>
    );
  }

  return (
    <div className="messages" aria-live={isStreaming ? "polite" : "off"}>
      {messages.map((message) => (
        <article className={`message message--${message.role}`} key={message.id}>
          <div className="message__avatar" aria-hidden="true">
            {message.role === "assistant" ? <Bot size={18} /> : <UserRound size={18} />}
          </div>
          <div className="message__body">
            <div className="message__meta">
              {message.role === "assistant" ? "河北水利电力学院AI小助手" : "我"}
            </div>
            <div
              className="message__bubble"
              ref={(node) => {
                bubbleRefs.current[message.id] = node;
              }}
            >
              {message.content && message.role === "user" ? (
                <p className="plain-message">{message.content}</p>
              ) : message.content ? (
                <RichMessage content={message.content} />
              ) : (
                <div
                  className={`thinking${message.activity === "searching" ? " thinking--searching" : ""}`}
                  aria-label={message.activity === "searching" ? "联网搜索中" : "正在思考中"}
                >
                  <span className="thinking__spinner" aria-hidden="true" />
                  <span>{message.activity === "searching" ? "联网搜索中" : "正在思考中"}</span>
                </div>
              )}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
