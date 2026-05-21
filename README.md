# 河北水利电力学院招生 AI 问答系统

轻量、极速、免登录的高校招生 AI 问答系统，面向 **河北水利电力学院** 招生咨询场景。项目采用前后端分离架构：后端使用 FastAPI 对接 OpenAI 兼容模型接口，前端使用 Vite + React 构建 Gemini 风格的流式聊天界面。

## 功能概览

- **免登录使用**：用户打开网页即可咨询，不需要注册账号。
- **单会话聊天**：对话历史保存在浏览器本地会话中，不依赖数据库。
- **SSE 流式输出**：AI 回复逐步渲染，降低等待感。
- **主备模型容灾**：主模型失败时自动切换备用模型。
- **Agent 提示词热读**：后端每次请求读取根目录 `agent.md`，便于快速调整助手边界和口吻。
- **联网官方检索**：招生、专业、校园等问题会优先检索学校官方域名资料，并在页面显示“联网搜索中”。
- **移动端适配**：PC 与手机均保持问答式布局。

## 项目结构

```text
stubox/
├─ agent.md                         # AI 助手系统提示词，可直接修改
├─ README.md
├─ docs/
│  ├─ PRD.md
│  ├─ TECHNICAL_DESIGN.md
│  └─ AGENT.md
├─ backend/
│  ├─ .env                          # 后端运行配置，模型和密钥在这里改
│  ├─ .env.example                  # 配置模板
│  ├─ requirements.txt
│  └─ app/
│     ├─ main.py                    # FastAPI 入口与 SSE 路由
│     ├─ config.py                  # 环境变量读取
│     ├─ schemas.py                 # 请求数据结构
│     ├─ agent_prompt.py            # agent.md 加载逻辑
│     ├─ openai_client.py           # OpenAI 兼容流式调用与主备切换
│     └─ web_search.py              # 官方站点联网检索
└─ fronted/
   ├─ imgs/                         # 学校 logo、校名图等素材
   ├─ public/
   ├─ src/
   │  ├─ App.tsx                    # 前端主状态与流式事件处理
   │  ├─ components/                # 聊天、侧栏、输入框、富文本组件
   │  ├─ lib/                       # stream/storage 等工具
   │  └─ styles.css                 # 全局 UI 样式
   ├─ package.json
   └─ vite.config.ts                # 本地开发代理配置
```

## 环境要求

- Python 3.10+
- Node.js 18+
- npm 9+

## 后端配置

复制配置模板。

Windows PowerShell：

```powershell
cd backend
Copy-Item .env.example .env
```

macOS / Linux：

```bash
cp backend/.env.example backend/.env
```

然后编辑 `backend/.env`。

### 在哪里修改模型

主模型和备用模型都在 [backend/.env](backend/.env) 中修改：

```env
OPENAI_BASE_URL=https://api.deepseek.com
OPENAI_API_KEY=sk-your-api-key

PRIMARY_MODEL=deepseek-v4-flash
BACKUP_MODEL=deepseek-v4-pro
```

说明：

- `OPENAI_BASE_URL`：OpenAI 兼容接口地址，例如 `https://api.openai.com/v1` 或 `https://api.deepseek.com`。
- `OPENAI_API_KEY`：模型服务商密钥，只放在后端，不会暴露给前端。
- `PRIMARY_MODEL`：默认优先调用的主模型。
- `BACKUP_MODEL`：主模型超时、限流、4xx/5xx 或流式失败前无输出时自动切换的备用模型。
- `MODEL_REASONING_EFFORT`：模型支持时可调思考强度；不需要时留空。
- `MAX_COMPLETION_TOKENS`：限制单次回复最大长度。

### 联网搜索配置

联网搜索也在 [backend/.env](backend/.env) 中控制：

```env
WEB_SEARCH_ENABLED=true
WEB_SEARCH_PROVIDER=bing
WEB_SEARCH_OFFICIAL_DOMAINS=hbwe.edu.cn,zsb.hbwe.edu.cn
WEB_SEARCH_MAX_RESULTS=4
WEB_SEARCH_TIMEOUT_SECONDS=8
WEB_FETCH_TIMEOUT_SECONDS=9
```

默认只检索学校官方域名，避免混入论坛、百科、自媒体等不可靠来源。

### 在哪里修改 Agent 提示词

系统提示词在项目根目录的 [agent.md](agent.md)。

后端会在每次请求时读取它，因此修改后通常不需要重新构建前端。你可以在这里调整：

- 助手身份与回答边界
- 是否只回答招生相关问题
- 输出格式和语气
- 联网资料引用规则
- 禁止展示思考过程等安全约束

## 本地运行

### 1. 启动后端

```bash
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

健康检查：

```bash
curl http://127.0.0.1:8000/health
```

### 2. 启动前端

另开一个终端：

```bash
cd fronted
npm install
npm run dev
```

访问：

```text
http://127.0.0.1:5173/
```

本地开发时，`fronted/vite.config.ts` 会把 `/api` 和 `/health` 代理到 `http://127.0.0.1:8000`。

## 生产构建

前端构建：

```bash
cd fronted
npm install
npm run build
```

构建产物位于：

```text
fronted/dist/
```

后端安装依赖并启动：

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Windows 服务器可将 `source .venv/bin/activate` 替换为：

```powershell
.\.venv\Scripts\activate
```

## 部署建议

推荐部署方式：

1. 使用 Nginx 或同类 Web 服务器托管 `fronted/dist/`。
2. 使用 `systemd`、Supervisor、PM2 或 Windows 服务管理后端 FastAPI 进程。
3. 将前端同域名下的 `/api/*` 和 `/health` 反向代理到后端 `127.0.0.1:8000`。

Nginx 示例：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    root /path/to/stubox/fronted/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8000/api/;
        proxy_http_version 1.1;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 120s;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /health {
        proxy_pass http://127.0.0.1:8000/health;
    }
}
```

如果前端和后端不同域名部署，需要在 `backend/.env` 中配置：

```env
CORS_ORIGINS=https://your-frontend-domain.com
```

## 常用维护点

| 需求 | 修改位置 |
| --- | --- |
| 更换 API 服务商地址 | `backend/.env` 的 `OPENAI_BASE_URL` |
| 更换 API Key | `backend/.env` 的 `OPENAI_API_KEY` |
| 更换主模型 | `backend/.env` 的 `PRIMARY_MODEL` |
| 更换备用模型 | `backend/.env` 的 `BACKUP_MODEL` |
| 调整助手身份、边界和语气 | 根目录 `agent.md` |
| 开关联网搜索 | `backend/.env` 的 `WEB_SEARCH_ENABLED` |
| 调整官方检索域名 | `backend/.env` 的 `WEB_SEARCH_OFFICIAL_DOMAINS` |
| 修改前端视觉样式 | `fronted/src/styles.css` |
| 修改聊天状态逻辑 | `fronted/src/App.tsx` |

## 注意事项

- 不要把真实 `OPENAI_API_KEY` 提交到公开仓库。
- 涉及招生政策、分数线、计划数、学费、报到时间等时效信息时，应以学校官网、招生信息网和当年官方通知为准。
- 当前项目不使用数据库；如果后续需要多会话、用户账号或后台管理，需要另行设计存储层。
- SSE 流式响应对代理配置敏感，生产环境务必关闭 `/api/` 的代理缓冲。
