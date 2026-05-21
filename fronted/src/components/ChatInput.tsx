import { SendHorizontal, Square, Sparkles } from "lucide-react";
import { FormEvent, KeyboardEvent, useEffect, useRef } from "react";

type ChatInputProps = {
  value: string;
  disabled?: boolean;
  isStreaming: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
};

export function ChatInput({
  value,
  disabled = false,
  isStreaming,
  onChange,
  onSubmit,
  onStop
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 156)}px`;
  }, [value]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (isStreaming) {
      onStop();
      return;
    }
    onSubmit();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSubmit();
    }
  };

  return (
    <form className="composer" onSubmit={handleSubmit}>
      <label className="sr-only" htmlFor="chat-input">
        招生咨询输入框
      </label>
      <div className="composer__inner">
        <Sparkles className="composer__spark" aria-hidden="true" size={22} />
        <textarea
          ref={textareaRef}
          id="chat-input"
          value={value}
          rows={1}
          placeholder="问问招生政策、专业方向、校园生活..."
          disabled={disabled && !isStreaming}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          className="icon-button icon-button--primary"
          type="submit"
          aria-label={isStreaming ? "停止生成" : "发送问题"}
          title={isStreaming ? "停止生成" : "发送问题"}
          disabled={!isStreaming && value.trim().length === 0}
        >
          {isStreaming ? <Square size={18} fill="currentColor" /> : <SendHorizontal size={20} />}
        </button>
      </div>
    </form>
  );
}
