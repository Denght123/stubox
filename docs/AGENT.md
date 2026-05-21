# 开发 Agent 规范

## 1. 代码质量目标

- 前后端分离，模块职责清晰，避免把模型调用逻辑泄漏到前端。
- 后端保持极简：核心路由、配置、Prompt 读取、模型流式调用、主备容灾。
- 前端保持轻量：不引入重型组件库，不做登录、多会话、数据库持久化。
- 所有用户可见错误都要可理解，不泄露 API Key、完整上游响应或服务商内部细节。

## 2. 大型修改后的审查机制

每次大型功能或代码修改后，用 subagent 功能分出一个子 agent，监督与审查代码的正确性和速度性，重点检查：

- 后端 SSE 是否真正流式输出。
- 主模型失败时是否自动切换备用模型。
- API Key 是否只存在后端。
- 前端状态机是否会卡在 streaming。
- 移动端布局是否存在遮挡、横向滚动或触控目标过小。
- 首屏是否避免不必要依赖和大包。

## 3. 前端设计规范

前端页面采用先进的设计类 skill：`ui-ux-pro-max`。设计必须严格参考：

- `G:\codex_projects\stubox\fronted\imgs\gemini_mobile.jpg`
- `G:\codex_projects\stubox\fronted\imgs\gemini_pc.png`

设计方向：

- 仿照 Gemini 页面风格：浅色、极简、大留白、蓝白渐变光感。
- 参考学校素材：
  - `G:\codex_projects\stubox\fronted\imgs\R-C.jpg`
  - `G:\codex_projects\stubox\fronted\imgs\name.png`
- 学校 logo 和校名要融入页面，但不能太抢眼。
- 移动端以底部圆角输入托盘为核心，PC 端以左侧轻量品牌栏和居中聊天区为核心。

## 4. 后端逻辑规范

- 每次请求热读取根目录 `agent.md`。
- 只接受 `user` 和 `assistant` 历史消息；前端传来的 system 消息必须忽略。
- 调用 OpenAI 兼容 `/chat/completions`，并设置 `stream: true`。
- 主备模型名称来自后端配置，不允许前端覆盖。
- 主模型未输出 token 前失败时自动重试备用模型。
- 已输出 token 后中断时返回错误事件，避免重复生成造成语义混乱。

## 5. 验证规范

- 后端至少执行 Python 编译检查。
- 前端至少执行 TypeScript 编译和 Vite 构建。
- 若启动开发服务器，应给出本地访问地址。
- UI 修改后优先检查 375px 移动端和桌面端布局。
