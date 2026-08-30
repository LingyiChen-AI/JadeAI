<div align="center">

# JadeAI

**AI 驱动的智能简历生成器**

拖拽编辑、实时 AI 优化、50 套专业模板、多格式导出，轻松打造高质量简历。

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61dafb)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6)](https://www.typescriptlang.org/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ed)](https://hub.docker.com/r/twwch/jadeai)
[![Powered by OrcaRouter](https://img.shields.io/badge/Powered_by-OrcaRouter-2563eb)](https://www.orcarouter.ai/ref/ref_1f47b025a90949564e17)

[English](./README.md)

</div>

---

## 交流群

扫码加入交流群，获取使用帮助与最新动态：

[![Linux.do](https://img.shields.io/badge/Linux.do-社区-blue)](https://linux.do/)


加入飞书群

![lark-chat](images/lark.png)


---

## 最近更新

### v0.5.0 · 桌面客户端首发
- **[桌面客户端](#桌面客户端)** 正式发布：macOS（Apple Silicon / Intel）与 Windows x64
  安装包，零配置、无需账号、数据全在本机
- 客户端内置更新提示，可直接下载对应架构的安装包
- Web 与客户端统一发版：同一个 tag 同时产出 Docker 镜像与三平台安装包
- 修复导出功能在容器中运行一段时间后失效（#95）
- 简历子项支持上移 / 下移 / 在上方插入（#89，感谢 @Silas-Zhu）

### v0.3.4 · 主题色系统与配色切换
- 引入语义化 `--brand-*` CSS token，下线全站 60+ 文件硬编码 `pink-*`
- 用户菜单新增主题色切换器，三套预设：**薄荷**（默认）、**经典蓝**、**玫粉**
- SSR 安全的防闪烁初始化；老版本 `localStorage` 值自动迁移
- 简历主题编辑器新增「薄荷」预设
- 导出通道（PDF / HTML / DOCX）统一读取 `src/lib/brand-constants.ts`

### v0.3.3 · 移动端体验 & 面试报告稳定性
- 模板预览及预览/分享页新增移动端底部操作栏
- 修复移动端滚动：画布/预览根节点改用 `h-full`
- 面试报告生成稳定性提升

### v0.3.2 · 运行时环境变量
- 移除所有 `NEXT_PUBLIC_*` 构建时变量，改为运行时读取

### v0.3.1 · 认证运行时开关
- `NEXT_PUBLIC_AUTH_ENABLED` 改为运行时变量 `AUTH_ENABLED`

---

## 截图展示

| 模板画廊 | 简历编辑器 |
|:---:|:---:|
| ![模板画廊](images/template-list.png) | ![简历编辑器](images/resume-edit.png) |

| AI 填充简历 | AI 图片简历解析 |
|:---:|:---:|
| ![AI 填充简历](images/AI%20填充简历.gif) | ![AI 图片简历解析](images/图片简历解析.gif) |

| AI 优化 | AI 语法检查 |
|:---:|:---:|
| ![AI 优化](images/ai%20优化.png) | ![AI 语法检查](images/AI%20语法检查.png) |

| 语法一键修复 | JD 匹配分析 |
|:---:|:---:|
| ![语法一键修复](images/AI%20语法检查一键修复.png) | ![JD 匹配分析](images/JD%20匹配分析.png) |

| 多格式导出 | 创建分享链接 |
|:---:|:---:|
| ![多格式导出](images/多项导出.png) | ![创建分享链接](images/创建分享链接.png) |

| 简历分享页 | AI 职业照生成 |
|:---:|:---:|
| ![简历分享页](images/简历分享页.png) | ![AI 职业照生成](images/职业照生成.png) |

| 二维码模块 |
|:---:|
| ![二维码模块](images/二维码.png) |

| 新建面试 | 模拟面试 |
|:---:|:---:|
| ![新建面试](images/新建面试.png) | ![模拟面试](images/模拟面试.png) |

| 面试列表 | 面试报告 |
|:---:|:---:|
| ![面试列表](images/面试列表.png) | ![面试报告](images/面试报告.png) |

## 部署视频

在 Bilibili 观看完整部署教程：

[![部署视频](https://i0.hdslb.com/bfs/archive/deployment-preview.jpg)](https://www.bilibili.com/video/BV1h7wQzSEYe/)

> [前往 Bilibili 观看 →](https://www.bilibili.com/video/BV1h7wQzSEYe/)

## 功能特性

### 简历编辑

- **拖拽编辑器** — 可视化拖拽排列简历模块与条目
- **行内编辑** — 点击任意字段，直接在画布上编辑
- **50 套专业模板** — 经典、现代、极简、创意、ATS 友好、时间线、北欧风、瑞士风等多种风格
- **主题定制** — 颜色、字体、间距、页边距实时预览调整
- **撤销 / 重做** — 完整编辑历史（最多 50 步）
- **自动保存** — 可配置保存间隔（0.3s–5s），支持手动保存
- **Markdown 支持** — 在文本字段中使用 Markdown 语法排版内容（例如 `**加粗**` 可显示**粗体文字**）

### Markdown 格式支持

以下简历模块支持 Markdown 语法：

| 模块 | 支持字段 |
|------|---------|
| 个人简介（Summary） | 正文内容 |
| 工作经历 | 描述、亮点（Highlights） |
| 教育背景 | 亮点（Highlights） |
| 项目经历 | 描述、亮点（Highlights） |
| 自定义模块 | 描述 |
| 语言能力 | 描述 |
| GitHub | 描述 |

**支持的语法：**

```
**加粗文字**    → 粗体
`代码文字`      → 行内代码
- 列表项        → 无序列表
```

> 技能、证书、个人信息等字段暂不支持 Markdown。

### AI 能力

- **AI 聊天助手** — 编辑器内集成对话式 AI，支持多会话和持久化历史
- **AI 一键生成简历** — 输入职位、经验、技能，自动生成完整简历
- **简历解析** — 上传已有 PDF 或图片，AI 自动提取全部内容
- **JD 匹配分析** — 对比简历与职位描述：关键词匹配、ATS 评分、改进建议
- **求职信生成** — 基于简历和 JD 的 AI 定制求职信，可选语气（正式 / 友好 / 自信）
- **语法与写作检查** — 检测弱动词、模糊描述和语法问题，返回质量评分
- **多语言翻译** — 支持 10 种语言互译，保留专业术语原文
- **灵活 AI 供应商** — 支持 OpenAI、Anthropic 及任意兼容 OpenAI 的 API 端点（例如 [OrcaRouter](https://www.orcarouter.ai/ref/ref_1f47b025a90949564e17)，一个 Key 即可调用 200+ 模型）；用户在应用内自行配置密钥

### 模拟面试

- **JD 岗位面试模拟** — 粘贴 JD，AI 按顺序扮演不同面试官进行模拟面试
- **6 种预设面试官** — HR 面、技术面、场景面、行为面、项目深挖、Leader 面，各有独特性格和提问风格
- **自定义面试官** — 创建自定义面试官，设定考察维度和风格
- **智能追问** — AI 根据回答质量自适应追问，回答不到位会深入追问
- **面试控制** — 跳过问题、请求提示、标记复习、暂停/继续
- **详细报告** — 逐题评分、能力雷达图、改进建议与推荐资源
- **历史对比** — 追踪评分趋势和能力维度变化
- **报告导出** — 支持 PDF 和 Markdown 格式导出

### 导出与分享

- **多格式导出** — PDF（Puppeteer + Chromium）、智能一页 PDF（自动适配单页）、DOCX、HTML、TXT、JSON
- **JSON 导入** — 导入之前导出的 JSON 文件还原或创建简历；编辑器内覆盖当前简历，仪表盘创建新简历
- **链接分享** — 基于 Token 的分享链接，支持密码保护
- **浏览统计** — 追踪分享简历的查看次数

### 简历管理

- **多简历仪表盘** — 网格和列表视图、搜索、排序（按日期、名称）
- **JSON 导入创建** — 在仪表盘直接通过 JSON 文件创建新简历
- **复制与重命名** — 快捷简历管理操作
- **新手引导** — 交互式分步引导，帮助新用户快速上手

### 其他

- **双语界面** — 完整的中文（zh）和英文（en）界面
- **暗色模式** — 浅色、深色、跟随系统三种主题
- **灵活认证** — Google OAuth 或浏览器指纹（零配置即用）
- **本地 SQLite 存储** — 零配置的文件型数据库

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Next.js 16 (App Router, Turbopack) |
| UI | React 19, Tailwind CSS 4, shadcn/ui, Radix UI |
| 拖拽 | @dnd-kit |
| 状态管理 | Zustand |
| 数据库 | Drizzle ORM (SQLite) |
| 认证 | NextAuth.js v5 + FingerprintJS |
| AI | Vercel AI SDK v6 + OpenAI / Anthropic |
| PDF | Puppeteer Core + @sparticuz/chromium |
| 国际化 | next-intl |
| 数据校验 | Zod v4 |

## 桌面客户端

**欢迎试用桌面客户端** —— 不用部署、不用注册、不用联网，下载装上就能写简历。

[![下载客户端](https://img.shields.io/badge/下载客户端-macOS%20%7C%20Windows-2ea44f?style=for-the-badge)](https://github.com/LingyiChen-AI/JadeAI/releases/latest)

它跑的是和 Web 版**完全相同**的应用——50 套模板、AI 润色、JD 匹配、模拟面试、
多格式导出，一个都不少。区别只在于服务跑在你自己的电脑上：

- **零配置** —— 装完打开就能用，不需要 Docker、不需要数据库、不需要 `AUTH_SECRET`
- **不需要账号** —— 本机单用户，没有登录，没有指纹识别
- **数据只在本机** —— 简历存在你电脑上的一个 SQLite 文件里，不经过任何服务器
- **AI 用你自己的 Key** —— 在应用内「设置 → AI」里填，请求直连你配置的服务商
- **自动提示更新** —— 有新版时右下角弹个小条，点一下就下载好对应你机器的安装包

> 唯一的对外网络请求是启动时问 GitHub 有没有新版本，可以关掉（见下文「更新」）。

### 下载

从 **[最新 Release](https://github.com/LingyiChen-AI/JadeAI/releases/latest)** 下载对应你系统的包：

| 平台 | 文件 |
|---|---|
| macOS（Apple Silicon，M 系列芯片） | `JadeAI-*-mac-arm64.dmg` |
| macOS（Intel） | `JadeAI-*-mac-x64.dmg` |
| Windows（x64） | `JadeAI-*-win-x64-setup.exe` |

### 首次打开

安装包带的是 **ad-hoc 签名**——有效，但匿名。没有 Apple Developer ID，也没有公证，
所以系统会拦下第一次启动。这是预期行为。

**macOS。** 在终端跑一次这条，然后正常双击打开：

```bash
xattr -dr com.apple.quarantine /Applications/JadeAI.app
```

也可以走图形界面：被拦下后打开 **系统设置 → 隐私与安全性**，拉到底点**仍要打开**。

> 不要依赖"右键 → 打开"。macOS 15 起 Apple 移除了这个绕过方式，对未公证的应用不再生效。

如果提示的是 **"JadeAI 已损坏，无法打开"** 而不是"无法验证"，说明下载不完整或文件被
改动过，重新下载即可。正常构建的版本提示的是"无法验证"，那个是可以放行的。

**Windows。** SmartScreen 提示时点**更多信息 → 仍要运行**。

### 数据存在哪

| 平台 | 路径 |
|---|---|
| macOS | `~/Library/Application Support/JadeAI/` |
| Windows | `%APPDATA%\JadeAI\` |

`jade.db` 是 SQLite 数据库，`jade-settings.json` 存窗口状态和偏好。**卸载应用不会删除
它们**，要清空数据请手动删除该目录。

### 更新

启动时应用会向 GitHub 查一次有没有新版本。有的话会在窗口右下角出现一个
小提示条——不是弹窗——点「立即下载」它会**自动下载匹配你这台机器的那个安装包**，
不用在三个文件里挑。进度显示在提示条里，下完可以直接打开安装包或在文件夹中显示。
提示条可以收起、关闭，或者对这个版本不再提示。

到此为止：安装仍需你手动完成（拖进「应用程序」，或运行 `.exe`）。静默安装要走 Squirrel，
而它不接受 ad-hoc 签名的应用。更新不影响本机数据。

**这是本应用唯一的对外网络请求。** 想关掉的话，在上面那个目录的 `jade-settings.json`
里设 `"updateCheckEnabled": false`，然后重启。

## 快速开始

### Docker 部署（推荐）

```bash
# 先生成一个密钥
openssl rand -base64 32

docker run -d -p 3000:3000 \
  -e AUTH_SECRET=<你生成的密钥> \
  -v jadeai-data:/app/data \
  twwch/jadeai:latest
```

打开 [http://localhost:3000](http://localhost:3000)。首次启动自动完成数据库迁移和数据初始化。

> **`AUTH_SECRET`** 为必填项，用于会话加密。通过 `openssl rand -base64 32` 生成。

> **AI 配置：** 无需服务端 AI 环境变量。每位用户在应用内的 **设置 > AI** 中自行配置 API Key、Base URL 和模型。还没有模型密钥的话，[OrcaRouter](https://www.orcarouter.ai/ref/ref_1f47b025a90949564e17) 一个 Key 就能调用 200+ 模型，详见 [AI 模型配置](#ai-模型配置)。

<details>
<summary>使用 Google OAuth 登录</summary>

```bash
docker run -d -p 3000:3000 \
  -e AUTH_ENABLED=true \
  -e AUTH_SECRET=your-secret \
  -e GOOGLE_CLIENT_ID=xxx \
  -e GOOGLE_CLIENT_SECRET=xxx \
  -v jadeai-data:/app/data \
  twwch/jadeai:latest
```

</details>

### 本地开发

#### 环境要求

- Node.js 18+
- pnpm 9+

#### 安装

```bash
git clone https://github.com/twwch/JadeAI.git
cd JadeAI

pnpm install
cp .env.example .env.local
```

#### 配置环境变量

编辑 `.env.local`：

```bash
# 认证（默认指纹模式，无需额外配置）
AUTH_ENABLED=false
```

> **AI 配置：** 无需服务端环境变量。每位用户在应用内的 **设置 > AI** 中自行配置 API Key、Base URL 和模型。用 [OrcaRouter](https://www.orcarouter.ai/ref/ref_1f47b025a90949564e17) 一个 Key 调用 200+ 模型的方式见 [AI 模型配置](#ai-模型配置)。

查看 `.env.example` 了解所有可用选项（Google OAuth、自定义 SQLite 路径等）。

#### 初始化数据库并启动

```bash
# 生成并执行迁移
pnpm db:generate
pnpm db:migrate

# （可选）填充示例数据
pnpm db:seed

# 启动开发服务器
pnpm dev
```

打开 [http://localhost:3000](http://localhost:3000)。

## AI 模型配置

所有 AI 功能（对话、简历生成、JD 匹配、模拟面试、翻译……）都需要一个 API Key。JadeAI 不在服务端保存密钥——你在应用内的 **设置 > AI** 中填写，密钥只存在浏览器的 localStorage 里。

任何兼容 OpenAI 协议的端点都能用：OpenAI、Anthropic、自建网关，或者模型路由服务。

### 使用 OrcaRouter（一个 Key 调用 200+ 模型）

[OrcaRouter](https://www.orcarouter.ai/ref/ref_1f47b025a90949564e17) 是一个兼容 OpenAI 协议的 AI 网关：一个 Key 即可调用 200+ 模型（OpenAI、Anthropic、Gemini、DeepSeek、Qwen 等），按供应商原价计费、不加价，并在供应商故障时自动切换。适合不想逐家注册、或者想在 JadeAI 里随时换模型又不用换 Key 的场景。

1. 在 [orcarouter.ai](https://www.orcarouter.ai/ref/ref_1f47b025a90949564e17) 注册（有免费额度，无需信用卡），创建一个 API Key。
2. 打开 JadeAI 的 **设置 > AI**，填写：

| 配置项 | 填写内容 |
|--------|----------|
| Base URL | `https://api.orcarouter.ai/v1` |
| API Key | 你的 OrcaRouter 密钥（`sk-...`） |
| 模型 | [模型列表](https://www.orcarouter.ai/models)中的任意模型 ID |

3. 保存后即可在编辑器里使用所有 AI 功能。

如果想直连 OpenAI 或 Anthropic，在同一个面板里换成对应的 Base URL、Key 和模型 ID 即可。

## 环境变量

| 变量 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `AUTH_SECRET` | 是 | — | 会话加密密钥 |
| `SQLITE_PATH` | 否 | `./data/jade.db` | SQLite 数据库文件路径 |
| `AUTH_ENABLED` | 否 | `false` | 启用 Google OAuth（`true`）或使用指纹模式（`false`） |
| `JADE_RUNTIME` | 否 | — | 设为 `desktop` 时切换到单本地用户模式（跳过指纹与 NextAuth，数据库只有一个 id 为 `local` 的用户） |
| `GOOGLE_CLIENT_ID` | OAuth 时 | — | Google OAuth 客户端 ID |
| `GOOGLE_CLIENT_SECRET` | OAuth 时 | — | Google OAuth 客户端密钥 |
| `APP_NAME` | 否 | `JadeAI` | 应用显示名称 |
| `DEFAULT_LOCALE` | 否 | `zh` | 默认语言：`zh` 或 `en` |

## 常用命令

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 启动开发服务器（Turbopack） |
| `pnpm build` | 生产构建 |
| `pnpm start` | 启动生产服务器 |
| `pnpm lint` | 运行 ESLint 检查 |
| `pnpm type-check` | TypeScript 类型检查 |
| `pnpm db:generate` | 生成 Drizzle 迁移文件 |
| `pnpm db:migrate` | 执行数据库迁移 |
| `pnpm db:studio` | 打开 Drizzle Studio（数据库 GUI） |
| `pnpm db:seed` | 填充示例数据 |

## 项目结构

```
src/
├── app/                        # Next.js App Router
│   ├── [locale]/               # 国际化路由 (/zh/..., /en/...)
│   │   ├── dashboard/          # 简历列表与管理
│   │   ├── editor/[id]/        # 简历编辑器
│   │   ├── preview/[id]/       # 全屏预览
│   │   ├── templates/          # 模板画廊
│   │   └── share/[token]/      # 公开分享简历查看
│   └── api/
│       ├── ai/                 # AI 接口
│       │   ├── chat/           #   流式对话 + 工具调用
│       │   ├── generate-resume/#   AI 生成简历
│       │   ├── jd-analysis/    #   JD 匹配分析
│       │   ├── grammar-check/  #   语法与写作检查
│       │   ├── cover-letter/   #   求职信生成
│       │   ├── translate/      #   简历翻译
│       │   └── models/         #   可用 AI 模型列表
│       ├── resume/             # 简历 CRUD、导出、解析、分享
│       ├── share/              # 公开分享访问
│       ├── user/               # 用户信息与设置
│       └── auth/               # NextAuth 认证
├── components/
│   ├── ui/                     # shadcn/ui 基础组件
│   ├── editor/                 # 编辑器画布、区块、字段、弹窗
│   ├── ai/                     # AI 对话面板与气泡
│   ├── preview/templates/      # 50 套简历模板
│   ├── dashboard/              # 仪表盘卡片、网格、弹窗
│   └── layout/                 # 头部、主题、语言切换
├── lib/
│   ├── db/                     # Schema、仓库、迁移、适配器
│   ├── auth/                   # 认证配置
│   └── ai/                     # AI 提示词、工具、模型配置
├── hooks/                      # 自定义 React Hooks（7 个）
├── stores/                     # Zustand 状态仓库（简历、编辑器、设置、UI、引导）
└── types/                      # TypeScript 类型定义
```

## 模板列表

JadeAI 内置 **50 套专业设计模板**，覆盖多种风格和行业需求：

<details>
<summary>查看全部 50 套模板</summary>

| # | 模板 | # | 模板 | # | 模板 |
|---|------|---|------|---|------|
| 1 | Classic | 18 | Clean | 35 | Material |
| 2 | Modern | 19 | Bold | 36 | Medical |
| 3 | Minimal | 20 | Timeline | 37 | Luxe |
| 4 | Professional | 21 | Nordic | 38 | Retro |
| 5 | Two-Column | 22 | Gradient | 39 | Card |
| 6 | ATS | 23 | Magazine | 40 | Rose |
| 7 | Academic | 24 | Corporate | 41 | Teacher |
| 8 | Creative | 25 | Consultant | 42 | Coder |
| 9 | Elegant | 26 | Swiss | 43 | Zigzag |
| 10 | Executive | 27 | Metro | 44 | Neon |
| 11 | Developer | 28 | Architect | 45 | Scientist |
| 12 | Designer | 29 | Japanese | 46 | Blocks |
| 13 | Startup | 30 | Artistic | 47 | Ribbon |
| 14 | Formal | 31 | Sidebar | 48 | Engineer |
| 15 | Infographic | 32 | Finance | 49 | Watercolor |
| 16 | Compact | 33 | Berlin | 50 | Mosaic |
| 17 | Euro | 34 | Legal | | |

</details>

## API 参考

<details>
<summary>查看全部 API 端点</summary>

### 简历

| 方法 | 端点 | 说明 |
|------|------|------|
| `GET` | `/api/resume` | 获取当前用户的简历列表 |
| `POST` | `/api/resume` | 创建新简历 |
| `GET` | `/api/resume/[id]` | 获取简历详情（含所有模块） |
| `PUT` | `/api/resume/[id]` | 更新简历元信息或模块 |
| `DELETE` | `/api/resume/[id]` | 删除简历 |
| `POST` | `/api/resume/[id]/duplicate` | 复制简历 |
| `GET` | `/api/resume/[id]/export` | 导出简历（pdf、docx、html、txt、json） |
| `POST` | `/api/resume/parse` | 解析上传的 PDF 或图片简历 |
| `POST` | `/api/resume/[id]/share` | 创建分享链接 |
| `GET` | `/api/resume/[id]/share` | 获取分享设置 |
| `DELETE` | `/api/resume/[id]/share` | 取消分享 |

### 分享

| 方法 | 端点 | 说明 |
|------|------|------|
| `GET` | `/api/share/[token]` | 访问公开分享的简历 |

### AI

| 方法 | 端点 | 说明 |
|------|------|------|
| `POST` | `/api/ai/chat` | 流式 AI 对话（带简历上下文） |
| `GET` | `/api/ai/chat/sessions` | 获取简历的对话会话列表 |
| `POST` | `/api/ai/chat/sessions` | 创建新对话会话 |
| `GET` | `/api/ai/chat/sessions/[id]` | 获取会话的分页消息 |
| `DELETE` | `/api/ai/chat/sessions/[id]` | 删除对话会话 |
| `POST` | `/api/ai/generate-resume` | AI 生成简历 |
| `POST` | `/api/ai/jd-analysis` | JD 匹配分析 |
| `POST` | `/api/ai/grammar-check` | 语法与写作检查 |
| `POST` | `/api/ai/cover-letter` | 生成求职信 |
| `POST` | `/api/ai/translate` | 翻译简历内容 |
| `GET` | `/api/ai/models` | 获取可用 AI 模型列表 |

### 用户

| 方法 | 端点 | 说明 |
|------|------|------|
| `GET` | `/api/user` | 获取当前用户信息 |
| `PUT` | `/api/user` | 更新用户信息 |
| `GET` | `/api/user/settings` | 获取用户设置 |
| `PUT` | `/api/user/settings` | 更新用户设置 |

</details>

## 参与贡献

欢迎贡献代码！请按照以下步骤：

1. Fork 本仓库
2. 创建功能分支：`git checkout -b feat/your-feature`
3. 提交更改：`git commit -m 'feat: add your feature'`
4. 推送分支：`git push origin feat/your-feature`
5. 提交 Pull Request

## 常见问题

<details>
<summary><b>AI 配置是如何工作的？</b></summary>

JadeAI 不需要在服务端配置 AI API 密钥。每位用户在应用内的 **设置 > AI** 中自行配置 AI 供应商（OpenAI、Anthropic 或任意兼容 OpenAI 协议的端点）、API Key 和模型。API 密钥仅存储在浏览器的 localStorage 中，不会发送到服务端存储。

想用一个 Key 覆盖 200+ 模型，可以用 [OrcaRouter](https://www.orcarouter.ai/ref/ref_1f47b025a90949564e17)，Base URL 填 `https://api.orcarouter.ai/v1`。完整步骤见 [AI 模型配置](#ai-模型配置)。

</details>

<details>
<summary><b>不使用 OAuth 时认证如何工作？</b></summary>

当 `AUTH_ENABLED=false`（默认）时，JadeAI 使用 FingerprintJS 进行浏览器指纹识别。系统为每个浏览器生成唯一的指纹 ID 作为用户标识。无需登录界面 — 用户可以直接开始创建简历。

</details>

<details>
<summary><b>PDF 导出是如何实现的？</b></summary>

PDF 导出使用 Puppeteer Core + @sparticuz/chromium。50 套模板各有独立的服务端导出处理器，将简历渲染为高保真 PDF。同时支持 DOCX、HTML、TXT 和 JSON 格式导出。

</details>

## Star History

<a href="https://www.star-history.com/?repos=LingyiChen-AI%2FJadeAI&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=LingyiChen-AI/JadeAI&type=date&theme=dark&legend=top-left&sealed_token=LemjPqjrjM3gQ-PUAAFWkzoN8CiA06qE0dBVrf0gWA53oH1U0deeDwrP9rzreUm25934qefo8M1gzGe0kYTl1nrj60_Y_NLxCg4rXOXKtduiRyu2LO1qZA" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=LingyiChen-AI/JadeAI&type=date&legend=top-left&sealed_token=LemjPqjrjM3gQ-PUAAFWkzoN8CiA06qE0dBVrf0gWA53oH1U0deeDwrP9rzreUm25934qefo8M1gzGe0kYTl1nrj60_Y_NLxCg4rXOXKtduiRyu2LO1qZA" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=LingyiChen-AI/JadeAI&type=date&legend=top-left&sealed_token=LemjPqjrjM3gQ-PUAAFWkzoN8CiA06qE0dBVrf0gWA53oH1U0deeDwrP9rzreUm25934qefo8M1gzGe0kYTl1nrj60_Y_NLxCg4rXOXKtduiRyu2LO1qZA" />
 </picture>
</a>

## 许可证

[Apache License 2.0](LICENSE)
