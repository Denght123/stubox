# 技术设计文档

## 1. 架构概览

项目采用前后端分离：

```text
stubox/
├── agent.md                  # 运行时大模型 system prompt
├── backend/                  # FastAPI SSE 代理服务
├── fronted/                  # Vite + React 前端
└── docs/                     # PRD、技术设计、开发规范
```

浏览器只访问前端和后端自有接口，不暴露大模型密钥。后端负责读取 `agent.md`、拼接 OpenAI 兼容请求、处理主备模型重试，并通过 SSE 把统一事件返回给前端。

## 2. 后端设计

### 2.1 技术选型

- FastAPI：轻量、异步、启动快。
- httpx：异步 HTTP 客户端，支持流式读取。
- Pydantic：请求体校验。
- 无数据库：聊天历史只从前端随请求传入。

### 2.2 API

#### `GET /health`

返回服务健康状态和已配置模型名称，不返回 API Key。

#### `POST /api/chat/stream`

请求体：

```json
{
  "messages": [
    { "role": "user", "content": "学校有哪些招生专业？" }
  ],
  "temperature": 0.3
}
```

响应类型：`text/event-stream`

事件：

- `model`：当前使用的模型。
- `fallback`：主模型失败后切换到备用模型。
- `delta`：增量文本。
- `error`：可展示错误。
- `done`：本次流结束。

### 2.3 主备容灾

模型顺序为：

1. `PRIMARY_MODEL`
2. `BACKUP_MODEL`

当主模型在输出任何 token 之前发生网络错误、超时、限流、4xx 或 5xx 时，后端自动切换备用模型重新发起请求。如果已经输出部分内容后连接中断，为避免重复答案，后端返回错误事件并结束当前流。

### 2.4 Prompt 热读取

每次 `POST /api/chat/stream` 都读取根目录 `agent.md`。招生工作人员修改文件后无需重启后端即可影响下一次请求。

## 3. 前端设计

### 3.1 技术选型

- Vite + React + TypeScript：开发快、首屏包小。
- 原生 Fetch + ReadableStream：不用重型 SSE/聊天组件库。
- SessionStorage：保存单会话历史。
- lucide-react：轻量图标库，用于按钮和导航图标。

### 3.2 状态机

前端保留一个单会话状态：

- `idle`：可输入。
- `streaming`：正在接收增量文本，可停止。
- `error`：上次请求失败，但允许继续输入。

消息结构：

```ts
type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  status?: "streaming" | "done" | "error";
  model?: string;
};
```

### 3.3 UI 设计

- PC：左侧轻量侧栏，主区居中聊天，底部悬浮输入框。
- Mobile：顶部品牌栏，欢迎语和快捷问题，底部大圆角输入托盘。
- 色彩：白色与浅灰为底，辅以 `#E8F0FE` 到白色的蓝白光感渐变，并加入校徽绿色作为极少量强调。
- 可访问性：按钮有 `aria-label`，触控区域大于 44px，文本可换行。

## 4. 安全与边界

- API Key 仅在后端配置。
- 前端不允许用户修改模型、供应商或 Key。
- 后端过滤前端传入的 `system` 消息，只接受 `user` 和 `assistant`。
- 系统提示词在 `agent.md` 中强约束招生范围。

## 5. 运行方式

后端：

```bash
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

前端：

```bash
cd fronted
npm install
npm run dev
```
