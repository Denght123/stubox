import { MessageCirclePlus, ShieldCheck } from "lucide-react";

import nameUrl from "../../imgs/name-black.png";

export type SidebarTopic = "admission" | "majors" | "campus" | "enrollment";

type SidebarProps = {
  canReset: boolean;
  onReset: () => void;
  onTopicSelect: (topic: SidebarTopic) => void;
};

const topics: Array<{ id: SidebarTopic; label: string }> = [
  { id: "admission", label: "招生政策" },
  { id: "majors", label: "专业介绍" },
  { id: "campus", label: "校园生活" },
  { id: "enrollment", label: "报到入学" }
];

export function Sidebar({ canReset, onReset, onTopicSelect }: SidebarProps) {
  return (
    <aside className="sidebar" aria-label="招生助手导航">
      <div className="brand">
        <img className="brand__wordmark" src={nameUrl} alt="河北水利电力学院" />
      </div>

      <button className="nav-action" type="button" onClick={onReset} disabled={!canReset}>
        <MessageCirclePlus size={19} aria-hidden="true" />
        开始新咨询
      </button>

      <div className="sidebar__section">
        <p>可咨询</p>
        {topics.map((topic) => (
          <button key={topic.id} type="button" onClick={() => onTopicSelect(topic.id)}>
            {topic.label}
          </button>
        ))}
      </div>

      <div className="sidebar__footer">
        <ShieldCheck size={18} aria-hidden="true" />
        <span>回答以学校官方最新通知为准</span>
      </div>
    </aside>
  );
}
