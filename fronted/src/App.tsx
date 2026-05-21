import { Menu, RotateCcw, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { ChatInput } from "./components/ChatInput";
import { MessageList } from "./components/MessageList";
import { Sidebar, type SidebarTopic } from "./components/Sidebar";
import { clearMessages, loadMessages, saveMessages } from "./lib/storage";
import { streamChat } from "./lib/stream";
import type { ApiMessage, AppStatus, ChatMessage, StreamEvent } from "./types";
import logoUrl from "../imgs/R-C.jpg";
import nameUrl from "../imgs/name-black.png";

const suggestions = [
  "学校今年招生专业有哪些？",
  "录取规则和调档比例怎么理解？",
  "宿舍、食堂和校园生活怎么样？",
  "水利电力类专业的就业方向有哪些？"
];

const SMOOTH_INITIAL_BUFFER_CHARS = 24;
const SMOOTH_INTERVAL_MS = 22;

const topicPrompts: Record<SidebarTopic, string> = {
  admission:
    "请基于河北水利电力学院官方招生信息网、信息公开网和当年招生章程，概括本科招生政策与录取规则。必须说明信息来源口径：学校招生信息网 zsb.hbwe.edu.cn、信息公开网 www.hbwe.edu.cn/xxgkw，以及当年官方招生章程；不要编造分数线、计划数或未公布政策。",
  majors:
    "请基于河北水利电力学院官方招生信息网、信息公开网公布的招生专业、选考科目要求和分省分专业招生计划，介绍学校专业设置与报考时应关注的要点。没有官方明确数据的地方请说明以招生信息网最新发布为准，不要编造专业名单或计划数。",
  campus:
    "请基于河北水利电力学院官网、招生章程和招生信息网公开信息，介绍校园生活相关内容，包括学校地址、住宿安排、住宿费官方口径、奖助政策等。未见官方明确说明的内容请提示以学校最新通知为准，不要编造宿舍人数、食堂数量等细节。",
  enrollment:
    "请基于河北水利电力学院官方招生信息网和新生报到相关通知，说明新生报到入学通常需要关注哪些事项。不要编造具体报到日期、地点或材料清单；涉及时间和流程必须提示以录取通知书、招生信息网和学校最新通知为准。"
};

function createId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function toApiMessages(messages: ChatMessage[]): ApiMessage[] {
  return messages
    .filter((message) => message.content.trim().length > 0)
    .slice(-24)
    .map((message) => ({
      role: message.role,
      content: message.content.trim()
    }));
}

function cleanAssistantContent(raw: string): string {
  let text = raw.replace(/\r\n/g, "\n");
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, "");

  if (/^\s*<think>/i.test(text) && !/<\/think>/i.test(text)) {
    return "";
  }

  const cjkMatch = text.match(/[\u3400-\u9fff]/);
  const firstCjkIndex = cjkMatch?.index ?? -1;
  const leading = firstCjkIndex > 0 ? text.slice(0, firstCjkIndex) : "";
  const looksLikeReasoning =
    /\*\*?\s*Responding as/i.test(leading) ||
    /The user|admissions assistant|I need to|I'll|I\u2019ll|Since I|It's all about/i.test(leading);

  if (looksLikeReasoning) {
    text = text.slice(firstCjkIndex);
  }

  return text
    .replace(/^\s*\*\*?\s*Responding as[^\n]*\*\*?\s*/i, "")
    .replace(/\|\s*$/g, "")
    .trimStart();
}

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadMessages());
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<AppStatus>("idle");
  const [notice, setNotice] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const submittingRef = useRef(false);
  const rawAssistantContentRef = useRef<Record<string, string>>({});
  const smoothTargetContentRef = useRef<Record<string, string>>({});
  const smoothVisibleContentRef = useRef<Record<string, string>>({});
  const smoothDoneRef = useRef<Record<string, boolean>>({});
  const smoothTimerRef = useRef<Record<string, number>>({});
  const assistantErrorRef = useRef<Record<string, boolean>>({});
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const lastScrollAtRef = useRef(0);

  const isStreaming = status === "streaming" || status === "searching";
  const canReset = useMemo(() => messages.length > 0 || input.trim().length > 0, [input, messages]);

  useEffect(() => {
    if (messages.some((message) => message.status === "streaming")) {
      return;
    }
    saveMessages(messages);
  }, [messages]);

  useEffect(() => {
    let favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!favicon) {
      favicon = document.createElement("link");
      favicon.rel = "icon";
      document.head.appendChild(favicon);
    }

    favicon.type = "image/jpeg";
    favicon.href = logoUrl;
    document.title = "河北水利电力学院招生 AI 助手";
  }, []);

  const scrollToBottom = (behavior: ScrollBehavior, force = false) => {
    const now = performance.now();
    if (!force && now - lastScrollAtRef.current < 90) {
      return;
    }

    lastScrollAtRef.current = now;
    const container = chatScrollRef.current;
    if (container) {
      container.scrollTo({ top: container.scrollHeight, behavior });
      return;
    }

    endRef.current?.scrollIntoView({ behavior, block: "end" });
  };

  useEffect(() => {
    const hasActiveMessage = messages.some((message) => message.status === "streaming");
    scrollToBottom(hasActiveMessage ? "auto" : "smooth", !hasActiveMessage);
  }, [messages, notice]);

  const patchAssistant = (id: string, updater: (message: ChatMessage) => ChatMessage) => {
    setMessages((current) => current.map((message) => (message.id === id ? updater(message) : message)));
  };

  const clearSmoothTimer = (id: string) => {
    const timer = smoothTimerRef.current[id];
    if (timer) {
      window.clearTimeout(timer);
      delete smoothTimerRef.current[id];
    }
  };

  const clearSmoothState = () => {
    Object.values(smoothTimerRef.current).forEach((timer) => window.clearTimeout(timer));
    rawAssistantContentRef.current = {};
    smoothTargetContentRef.current = {};
    smoothVisibleContentRef.current = {};
    smoothDoneRef.current = {};
    smoothTimerRef.current = {};
    assistantErrorRef.current = {};
  };

  const scheduleSmoothReveal = (assistantId: string, immediate = false) => {
    if (smoothTimerRef.current[assistantId]) {
      return;
    }

    const tick = () => {
      const target = smoothTargetContentRef.current[assistantId] ?? "";
      const visible = smoothVisibleContentRef.current[assistantId] ?? "";
      const isDone = Boolean(smoothDoneRef.current[assistantId]);
      const hasError = Boolean(assistantErrorRef.current[assistantId]);

      if (!isDone && visible.length === 0 && target.length < SMOOTH_INITIAL_BUFFER_CHARS) {
        smoothTimerRef.current[assistantId] = window.setTimeout(tick, 70);
        return;
      }

      const remaining = target.slice(visible.length);
      if (!remaining) {
        delete smoothTimerRef.current[assistantId];
        if (isDone) {
          patchAssistant(assistantId, (message) => ({
            ...message,
            status: message.status === "error" ? "error" : "done",
            activity: undefined
          }));
          setStatus(hasError ? "error" : "idle");
        }
        return;
      }

      const chunkSize = remaining.length > 240 ? 10 : remaining.length > 120 ? 7 : remaining.length > 48 ? 4 : 2;
      const nextVisible = visible + remaining.slice(0, chunkSize);
      smoothVisibleContentRef.current[assistantId] = nextVisible;

      patchAssistant(assistantId, (message) => ({
        ...message,
        content: nextVisible,
        status: hasError ? "error" : isDone && nextVisible.length >= target.length ? "done" : "streaming",
        activity: hasError ? undefined : message.activity
      }));

      if (nextVisible.length < target.length) {
        smoothTimerRef.current[assistantId] = window.setTimeout(tick, SMOOTH_INTERVAL_MS);
      } else {
        delete smoothTimerRef.current[assistantId];
        if (isDone) {
          patchAssistant(assistantId, (message) => ({
            ...message,
            status: message.status === "error" ? "error" : "done",
            activity: undefined
          }));
          setStatus(hasError ? "error" : "idle");
        }
      }
    };

    smoothTimerRef.current[assistantId] = window.setTimeout(tick, immediate ? 0 : 90);
  };

  const resetConversation = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    clearSmoothState();
    clearMessages();
    setMessages([]);
    setInput("");
    setNotice("");
    setStatus("idle");
    setMobileNavOpen(false);
  };

  const handleStreamEvent = (assistantId: string, event: StreamEvent) => {
    const data = event.data ?? {};

    if (event.event === "model") {
      return;
    }

    if (event.event === "fallback") {
      const to = typeof data.to === "string" ? data.to : "备用模型";
      setNotice(`主模型暂不可用，已自动切换至 ${to}`);
      return;
    }

    if (event.event === "search_start") {
      setStatus("searching");
      patchAssistant(assistantId, (item) => ({
        ...item,
        activity: "searching",
        status: "streaming"
      }));
      return;
    }

    if (event.event === "search_done") {
      setStatus("streaming");
      const count = typeof data.count === "number" ? data.count : 0;
      if (count === 0) {
        const message =
          typeof data.message === "string"
            ? data.message
            : "未检索到可用的学校官方网页资料，将继续谨慎回答。";
        setNotice(message);
      }
      patchAssistant(assistantId, (item) => ({
        ...item,
        activity: "thinking",
        status: "streaming"
      }));
      return;
    }

    if (event.event === "search_error") {
      setStatus("streaming");
      const message = typeof data.message === "string" ? data.message : "联网搜索暂时不可用，继续为你生成回答。";
      setNotice(message);
      patchAssistant(assistantId, (item) => ({
        ...item,
        activity: "thinking",
        status: "streaming"
      }));
      return;
    }

    if (event.event === "delta") {
      const content = typeof data.content === "string" ? data.content : "";
      if (!content) {
        return;
      }

      const rawContent = (rawAssistantContentRef.current[assistantId] ?? "") + content;
      rawAssistantContentRef.current[assistantId] = rawContent;
      smoothTargetContentRef.current[assistantId] = cleanAssistantContent(rawContent);
      if (rawContent === content) {
        setStatus("streaming");
        patchAssistant(assistantId, (item) => ({
          ...item,
          activity: "thinking",
          status: "streaming"
        }));
      }
      scheduleSmoothReveal(assistantId);
      return;
    }

    if (event.event === "error") {
      const message = typeof data.message === "string" ? data.message : "请求暂时失败，请稍后再试。";
      clearSmoothTimer(assistantId);
      assistantErrorRef.current[assistantId] = true;
      setStatus("error");
      patchAssistant(assistantId, (item) => ({
        ...item,
        content: item.content || message,
        status: "error",
        activity: undefined
      }));
      return;
    }

    if (event.event === "done") {
      if (assistantErrorRef.current[assistantId]) {
        smoothDoneRef.current[assistantId] = true;
        if (!smoothTimerRef.current[assistantId]) {
          setStatus("error");
        }
        return;
      }

      const finalContent = cleanAssistantContent(rawAssistantContentRef.current[assistantId] ?? "");
      if (!finalContent) {
        clearSmoothTimer(assistantId);
        patchAssistant(assistantId, (message) => ({
          ...message,
          content: message.status === "error" ? message.content : "未收到有效中文回复，请稍后重试。",
          status: message.status === "error" ? "error" : "done",
          activity: undefined
        }));
        setStatus("error");
        return;
      }

      smoothTargetContentRef.current[assistantId] = finalContent;
      smoothDoneRef.current[assistantId] = true;
      scheduleSmoothReveal(assistantId, true);
    }
  };

  const submitQuestion = async (override?: string) => {
    const content = (override ?? input).trim();
    if (!content || isStreaming || submittingRef.current) {
      return;
    }

    submittingRef.current = true;

    const userMessage: ChatMessage = {
      id: createId(),
      role: "user",
      content,
      createdAt: Date.now(),
      status: "done"
    };

    const assistantMessage: ChatMessage = {
      id: createId(),
      role: "assistant",
      content: "",
      createdAt: Date.now(),
      status: "streaming",
      activity: "thinking"
    };

    const nextMessages = [...messages, userMessage, assistantMessage];
    const payloadMessages = toApiMessages([...messages, userMessage]);
    rawAssistantContentRef.current[assistantMessage.id] = "";
    smoothTargetContentRef.current[assistantMessage.id] = "";
    smoothVisibleContentRef.current[assistantMessage.id] = "";
    smoothDoneRef.current[assistantMessage.id] = false;
    assistantErrorRef.current[assistantMessage.id] = false;

    setMessages(nextMessages);
    setInput("");
    setNotice("");
    setStatus("streaming");

    const controller = new AbortController();
    abortRef.current = controller;
    let hadStreamError = false;
    let receivedDone = false;

    try {
      await streamChat(
        payloadMessages,
        {
          onEvent: (event) => {
            if (event.event === "error") {
              hadStreamError = true;
            }
            if (event.event === "done") {
              receivedDone = true;
            }
            handleStreamEvent(assistantMessage.id, event);
          }
        },
        controller.signal
      );

      if (!hadStreamError && !receivedDone) {
        const finalContent = cleanAssistantContent(rawAssistantContentRef.current[assistantMessage.id] ?? "");
        if (finalContent) {
          smoothTargetContentRef.current[assistantMessage.id] = finalContent;
          smoothDoneRef.current[assistantMessage.id] = true;
          scheduleSmoothReveal(assistantMessage.id, true);
        } else {
          patchAssistant(assistantMessage.id, (message) => ({
            ...message,
            content: "未收到有效中文回复，请稍后重试。",
            status: "error",
            activity: undefined
          }));
          setStatus("error");
        }
      }
    } catch (error) {
      if (controller.signal.aborted) {
        clearSmoothTimer(assistantMessage.id);
        patchAssistant(assistantMessage.id, (message) => ({
          ...message,
          content: message.content || "已停止生成。",
          status: "done",
          activity: undefined
        }));
        setStatus("idle");
      } else {
        const message = error instanceof Error ? error.message : "请求暂时失败，请稍后再试。";
        clearSmoothTimer(assistantMessage.id);
        assistantErrorRef.current[assistantMessage.id] = true;
        patchAssistant(assistantMessage.id, (item) => ({
          ...item,
          content: item.content || message,
          status: "error",
          activity: undefined
        }));
        setStatus("error");
      }
    } finally {
      abortRef.current = null;
      submittingRef.current = false;
    }
  };

  const stopStreaming = () => {
    abortRef.current?.abort();
  };

  const handleTopicSelect = (topic: SidebarTopic) => {
    submitQuestion(topicPrompts[topic]);
    setMobileNavOpen(false);
  };

  return (
    <div className="app-shell">
      <Sidebar canReset={canReset} onReset={resetConversation} onTopicSelect={handleTopicSelect} />

      <header className="mobile-header">
        <button
          className="icon-button"
          type="button"
          aria-label={mobileNavOpen ? "关闭导航" : "打开导航"}
          onClick={() => setMobileNavOpen((open) => !open)}
        >
          {mobileNavOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
        <img className="mobile-header__name" src={nameUrl} alt="河北水利电力学院" />
        <button
          className="icon-button"
          type="button"
          aria-label="开始新咨询"
          onClick={resetConversation}
          disabled={!canReset}
        >
          <RotateCcw size={20} />
        </button>
      </header>

      {mobileNavOpen ? (
        <div className="mobile-sheet">
          <button className="nav-action" type="button" onClick={resetConversation} disabled={!canReset}>
            <RotateCcw size={18} aria-hidden="true" />
            开始新咨询
          </button>
          <button type="button" onClick={() => handleTopicSelect("admission")}>
            招生政策
          </button>
          <button type="button" onClick={() => handleTopicSelect("majors")}>
            专业介绍
          </button>
          <button type="button" onClick={() => handleTopicSelect("campus")}>
            校园生活
          </button>
        </div>
      ) : null}

      <main className="chat-main">
        <div className="chat-main__top">
          <div className="status-pill" data-status={status}>
            <span />
            {status === "searching" ? "联网搜索中" : isStreaming ? "正在生成" : "招生咨询"}
          </div>
        </div>

        <div className="chat-scroll" ref={chatScrollRef}>
          <MessageList
            messages={messages}
            suggestions={suggestions}
            isStreaming={isStreaming}
            onSuggestionClick={(value) => submitQuestion(value)}
          />
          {notice ? <div className="notice">{notice}</div> : null}
          <div ref={endRef} />
        </div>

        <div className="composer-wrap">
          <ChatInput
            value={input}
            isStreaming={isStreaming}
            onChange={setInput}
            onSubmit={() => submitQuestion()}
            onStop={stopStreaming}
          />
        </div>
      </main>
    </div>
  );
}
