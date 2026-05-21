import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type RichMessageProps = {
  content: string;
};

export function RichMessage({ content }: RichMessageProps) {
  return (
    <div className="rich-content">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
