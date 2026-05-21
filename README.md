# 河北水利电力学院招生 AI 问答系统

这是我为 **河北水利电力学院招生咨询场景** 做的一套轻量 AI 问答系统。我的目标很明确：让考生和家长打开页面后，不需要注册、不需要学习复杂操作，就能直接围绕招生政策、专业介绍、校园生活、报到入学等问题进行咨询。

整个项目采用前后端分离架构。后端负责模型调用、主备模型切换、Agent 提示词加载和学校官方资料检索；前端负责聊天交互、流式渲染、移动端适配和学校品牌视觉呈现。

## 项目亮点

- **打开即用**：没有登录注册流程，适合招生咨询这种高频、轻量、即时的使用场景。
- **回答更贴近学校业务**：根目录的 `agent.md` 统一约束助手身份、回答范围、语气和安全边界。
- **支持 OpenAI 兼容接口**：只要服务商兼容 `/chat/completions`，就可以在后端配置中切换。
- **主备模型自动容灾**：主模型不可用时，后端会尝试备用模型，减少咨询中断。
- **流式问答体验**：前端按流式内容逐步渲染，用户不需要一直等待整段回答生成完。
- **学校官方资料优先**：遇到专业、招生、校园相关问题时，后端会优先检索学校官方域名下的公开资料。
- **移动端友好**：手机端仍保留左问右答的聊天结构，适合考生直接在手机上使用。
- **无数据库依赖**：对话仅保存在浏览器会话中，部署和维护成本更低。

## 技术栈

| 模块 | 技术 |
| --- | --- |
| 后端 | Python、FastAPI、httpx、SSE |
| 前端 | Vite、React、TypeScript |
| 富文本渲染 | react-markdown、remark-gfm |
| 图标 | lucide-react |
| 模型接口 | OpenAI 兼容格式 |

## 项目结构

```text
stubox/
├─ agent.md                         # 招生 AI 助手的系统提示词
├─ README.md
├─ docs/
│  ├─ PRD.md                        # 产品需求文档
│  ├─ TECHNICAL_DESIGN.md           # 技术设计文档
│  └─ AGENT.md                      # 项目开发规范
├─ backend/
│  ├─ .env                          # 本地后端配置，默认不进入版本库
│  ├─ .env.example                  # 后端配置模板
│  ├─ requirements.txt
│  └─ app/
│     ├─ main.py                    # FastAPI 入口和流式接口
│     ├─ config.py                  # 配置读取
│     ├─ schemas.py                 # 请求结构
│     ├─ agent_prompt.py            # agent.md 加载
│     ├─ openai_client.py           # 模型调用与主备切换
│     └─ web_search.py              # 学校官方资料检索
└─ fronted/
   ├─ imgs/                         # 校徽、校名、参考图等素材
   ├─ public/
   ├─ src/
   │  ├─ App.tsx                    # 页面主逻辑
   │  ├─ components/                # 侧边栏、消息列表、输入框等组件
   │  ├─ lib/                       # 流式请求、本地会话存储
   │  └─ styles.css                 # 页面样式
   ├─ package.json
   └─ vite.config.ts                # 本地开发代理
```

## 快速开始

### 环境准备

建议使用：

- Python 3.10 或更高版本
- Node.js 18 或更高版本
- npm 9 或更高版本

### 1. 配置后端

先复制一份后端配置模板。

Windows PowerShell：

```powershell
cd backend
Copy-Item .env.example .env
```

macOS / Linux：

```bash
cp backend/.env.example backend/.env
```

然后打开 `backend/.env`，填写模型服务商信息：

```env
OPENAI_BASE_URL=https://api.deepseek.com
OPENAI_API_KEY=sk-your-api-key

PRIMARY_MODEL=deepseek-v4-flash
BACKUP_MODEL=deepseek-v4-pro
```

这里我把模型相关配置都放在后端，是为了让前端只负责使用体验，不接触服务商密钥。

### 2. 启动后端

```bash
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

启动后可以访问：

```text
http://127.0.0.1:8000/health
```

如果返回 `ok: true`，说明后端已经正常运行。

### 3. 启动前端

另开一个终端：

```bash
cd fronted
npm install
npm run dev
```

浏览器打开：

```text
http://127.0.0.1:5173/
```

本地开发时，Vite 会把 `/api` 和 `/health` 转发到后端服务。

## 使用教程

进入页面后可以直接输入招生相关问题，例如：

- 学校今年有哪些招生专业？
- 某个专业主要学什么？
- 学校住宿和校园生活怎么样？
- 新生报到一般需要关注哪些事项？

左侧导航栏里也提供了常用咨询入口，可以快速发起招生政策、专业介绍、校园生活、报到入学等主题咨询。

如果要清空当前对话，可以点击“开始新咨询”。当前项目没有做账号体系和数据库存储，因此刷新或开启新会话后，对话数据不会作为长期记录保存在服务器上。

## 常用配置位置

### 修改主模型和备用模型

文件位置：

```text
backend/.env
```

配置项：

```env
PRIMARY_MODEL=deepseek-v4-flash
BACKUP_MODEL=deepseek-v4-pro
```

主模型会优先使用；如果主模型请求失败，后端会尝试备用模型。

### 修改模型服务商地址和密钥

文件位置：

```text
backend/.env
```

配置项：

```env
OPENAI_BASE_URL=https://api.deepseek.com
OPENAI_API_KEY=sk-your-api-key
```

如果服务商要求 `/v1` 后缀，就把它保留在 `OPENAI_BASE_URL` 中。

### 修改 Agent 提示词

文件位置：

```text
agent.md
```

我把招生助手的身份、回答边界、语气、安全规则和资料引用要求都放在这里。后端会在请求时读取这个文件，所以调整提示词后，一般不需要重新打包前端。

### 修改联网检索范围

文件位置：

```text
backend/.env
```

配置项：

```env
WEB_SEARCH_ENABLED=true
WEB_SEARCH_PROVIDER=bing
WEB_SEARCH_OFFICIAL_DOMAINS=hbwe.edu.cn,zsb.hbwe.edu.cn
WEB_SEARCH_MAX_RESULTS=4
```

默认只检索学校相关官方域名，这样更适合招生咨询场景。

### 修改前端界面

常用文件：

```text
fronted/src/App.tsx
fronted/src/styles.css
fronted/src/components/
```

其中 `styles.css` 负责主要视觉样式，`App.tsx` 负责聊天状态、流式事件和主题咨询入口。

## 生产构建

前端构建：

```bash
cd fronted
npm install
npm run build
```

构建完成后，静态文件会生成在：

```text
fronted/dist/
```

后端生产启动示例：

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Windows 服务器可以使用：

```powershell
.\.venv\Scripts\activate
```

## 部署方式

我推荐的部署方式是：

1. 前端静态文件交给 Nginx 托管。
2. 后端 FastAPI 使用 `systemd`、Supervisor、PM2 或 Windows 服务常驻运行。
3. Nginx 把 `/api/` 和 `/health` 反向代理到后端。

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

如果前后端分开部署，需要在后端配置允许的前端域名：

```env
CORS_ORIGINS=https://your-frontend-domain.com
```

## 开发与维护建议

- `.env` 用来放本机或服务器上的运行配置，仓库中只保留 `.env.example` 作为模板。
- 招生政策、分数线、计划数、学费、报到时间等内容变化较快，回答时应以学校当年公开信息为准。
- 当前项目为了保持轻量，没有接入数据库；如果后续要做多会话、后台管理或数据分析，可以单独扩展存储层。
- 生产环境代理 `/api/` 时建议关闭缓冲，让流式响应保持顺畅。

## 我后续想继续完善的方向

- 增加后台可视化配置页，方便非开发人员调整提示词和模型。
- 增加更细粒度的学校官方知识库索引。
- 加入回答引用来源的可视化展示。
- 补充更多移动端交互细节，让咨询体验更接近原生应用。
