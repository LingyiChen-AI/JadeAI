# JadeAI - 架构设计文档

## 1. 项目概述

**JadeAI** 是一款 AI 驱动的智能简历生成器，用户可通过拖拉拽方式可视化创建简历，通过 AI 对话优化简历内容，支持 PDF 导出、多份简历管理、多语言界面（中文/英文）。基于 Next.js 全栈框架开发。

### 1.1 核心功能

| 功能 | 说明 |
|------|------|
| 拖拉拽简历编辑器 | 可视化拖拽模块构建简历，支持拖拽排序、新增、删除 |
| AI 简历优化 | 基于对话的 AI 助手，实时优化简历内容 |
| PDF 导出 | 高保真 PDF 生成与下载 |
| 多简历管理 | 新建、复制、删除、切换多份简历 |
| 灵活认证 | 可插拔认证：Google 登录 / 浏览器指纹 fallback |
| 数据存储 | 本地 SQLite，零配置 |
| 国际化 (i18n) | 支持中文和英文界面切换 |

### 1.2 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Next.js 16 (App Router) |
| 语言 | TypeScript |
| UI 库 | React 19 |
| 样式 | Tailwind CSS 4 + shadcn/ui |
| 拖拽 | dnd-kit |
| 状态管理 | Zustand |
| 数据库 ORM | Drizzle ORM |
| 认证 | NextAuth.js (Auth.js v5) |
| AI | Vercel AI SDK + OpenAI / Anthropic API |
| PDF 生成 | @react-pdf/renderer |
| 浏览器指纹 | FingerprintJS |
| 国际化 | next-intl |
| 数据校验 | Zod |
| 包管理器 | pnpm |

---

## 2. 目录结构

```
jade-ai/
├── .env.local                          # 环境变量（本地）
├── .env.example                        # 环境变量模板
├── next.config.ts                      # Next.js 配置
├── drizzle.config.ts                   # Drizzle ORM 配置
├── tailwind.config.ts                  # Tailwind CSS 配置
├── package.json
├── tsconfig.json
│
├── messages/                           # 国际化翻译文件
│   ├── en.json                         # 英文翻译
│   └── zh.json                         # 中文翻译
│
├── src/
│   ├── i18n/                           # 国际化配置
│   │   ├── config.ts                   # i18n 配置（支持语言列表、默认语言）
│   │   ├── request.ts                  # next-intl 请求配置
│   │   └── routing.ts                  # 路由国际化配置
│   │
│   ├── app/                            # Next.js App Router
│   │   ├── layout.tsx                  # 根布局
│   │   ├── globals.css                 # 全局样式
│   │   │
│   │   └── [locale]/                   # 国际化路由前缀 (/en/..., /zh/...)
│   │       ├── layout.tsx              # 语言布局（注入 NextIntlClientProvider）
│   │       ├── page.tsx                # 落地页 / 仪表盘
│   │       │
│   │       ├── (auth)/                 # 认证路由组
│   │       │   ├── login/
│   │       │   │   └── page.tsx        # 登录页
│   │       │   └── layout.tsx          # 认证布局
│   │       │
│   │       ├── dashboard/              # 仪表盘（简历列表）
│   │       │   ├── page.tsx
│   │       │   └── layout.tsx
│   │       │
│   │       ├── editor/                 # 简历编辑器
│   │       │   ├── [id]/
│   │       │   │   └── page.tsx        # 编辑器页面
│   │       │   └── layout.tsx
│   │       │
│   │       └── preview/                # 简历预览
│   │           └── [id]/
│   │               └── page.tsx
│   │
│   ├── app/api/                        # API 路由（不需要国际化前缀）
│   │   ├── auth/
│   │   │   └── [...nextauth]/
│   │   │       └── route.ts            # NextAuth API 路由
│   │   ├── resume/
│   │   │   ├── route.ts               # GET（列表）/ POST（创建）
│   │   │   └── [id]/
│   │   │       ├── route.ts           # GET / PUT / DELETE
│   │   │       ├── duplicate/
│   │   │       │   └── route.ts       # POST 复制简历
│   │   │       └── export/
│   │   │           └── route.ts       # GET 导出 PDF
│   │   ├── ai/
│   │   │   └── chat/
│   │   │       └── route.ts           # POST AI 对话（流式）
│   │   └── user/
│   │       └── route.ts               # GET / PUT 用户信息
│   │
│   ├── components/                     # React 组件
│   │   ├── ui/                         # shadcn/ui 基础组件
│   │   │   ├── button.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── dropdown-menu.tsx
│   │   │   ├── input.tsx
│   │   │   ├── textarea.tsx
│   │   │   ├── card.tsx
│   │   │   ├── avatar.tsx
│   │   │   ├── toast.tsx
│   │   │   └── ...
│   │   │
│   │   ├── editor/                     # 编辑器相关组件
│   │   │   ├── editor-canvas.tsx       # 主拖拽画布
│   │   │   ├── editor-sidebar.tsx      # 左侧栏（模块列表）
│   │   │   ├── editor-toolbar.tsx      # 顶部工具栏（操作按钮）
│   │   │   ├── section-wrapper.tsx     # 可拖拽模块容器
│   │   │   ├── sections/              # 简历模块组件
│   │   │   │   ├── personal-info.tsx   # 个人信息
│   │   │   │   ├── work-experience.tsx # 工作经历
│   │   │   │   ├── education.tsx       # 教育背景
│   │   │   │   ├── skills.tsx          # 技能特长
│   │   │   │   ├── projects.tsx        # 项目经历
│   │   │   │   ├── certifications.tsx  # 资格证书
│   │   │   │   ├── languages.tsx       # 语言能力
│   │   │   │   ├── summary.tsx         # 个人简介
│   │   │   │   └── custom-section.tsx  # 自定义模块
│   │   │   ├── fields/               # 字段级编辑组件
│   │   │   │   ├── editable-text.tsx
│   │   │   │   ├── editable-date.tsx
│   │   │   │   ├── editable-list.tsx
│   │   │   │   ├── editable-rich-text.tsx
│   │   │   │   └── field-wrapper.tsx
│   │   │   └── dnd/                   # 拖拽工具组件
│   │   │       ├── sortable-section.tsx
│   │   │       ├── sortable-item.tsx
│   │   │       └── drag-overlay.tsx
│   │   │
│   │   ├── preview/                    # 简历预览组件
│   │   │   ├── resume-preview.tsx      # 实时预览渲染器
│   │   │   └── templates/             # 简历模板
│   │   │       ├── classic.tsx
│   │   │       ├── modern.tsx
│   │   │       └── minimal.tsx
│   │   │
│   │   ├── ai/                         # AI 对话组件
│   │   │   ├── ai-chat-panel.tsx       # 对话面板（右侧栏）
│   │   │   ├── ai-message.tsx          # 单条消息气泡
│   │   │   ├── ai-suggestion.tsx       # AI 建议卡片
│   │   │   └── ai-input.tsx            # 对话输入框
│   │   │
│   │   ├── dashboard/                  # 仪表盘组件
│   │   │   ├── resume-card.tsx         # 简历卡片
│   │   │   ├── resume-grid.tsx         # 简历网格视图
│   │   │   └── create-resume-dialog.tsx
│   │   │
│   │   ├── layout/                     # 布局组件
│   │   │   ├── header.tsx
│   │   │   ├── footer.tsx
│   │   │   ├── sidebar.tsx
│   │   │   ├── user-menu.tsx
│   │   │   └── locale-switcher.tsx     # 语言切换器
│   │   │
│   │   └── auth/                       # 认证组件
│   │       ├── login-button.tsx
│   │       ├── user-avatar.tsx
│   │       └── auth-guard.tsx
│   │
│   ├── lib/                            # 核心库
│   │   ├── db/                         # 数据库层
│   │   │   ├── index.ts               # 数据库入口（导出当前适配器实例）
│   │   │   ├── schema.ts             # Drizzle Schema 定义（唯一数据源）
│   │   │   ├── migrate.ts            # 迁移执行器
│   │   │   ├── seed.ts               # 种子数据（可选）
│   │   │   ├── adapter.ts            # 数据库适配器接口
│   │   │   ├── adapters/
│   │   │   │   └── sqlite.ts         # SQLite 适配器
│   │   │   └── repositories/         # 数据访问仓库
│   │   │       ├── user.repository.ts
│   │   │       ├── resume.repository.ts
│   │   │       └── chat.repository.ts
│   │   │
│   │   ├── auth/                       # 认证层
│   │   │   ├── index.ts               # 认证入口
│   │   │   ├── config.ts             # NextAuth 配置
│   │   │   ├── provider.ts           # 认证提供者接口
│   │   │   ├── providers/
│   │   │   │   ├── google.ts         # Google OAuth 提供者
│   │   │   │   └── fingerprint.ts    # 浏览器指纹提供者
│   │   │   └── helpers.ts            # 认证工具函数
│   │   │
│   │   ├── ai/                         # AI 层
│   │   │   ├── index.ts
│   │   │   ├── prompts.ts            # 系统提示词（简历优化）
│   │   │   ├── actions.ts            # AI Server Actions
│   │   │   └── tools.ts              # AI 工具定义
│   │   │
│   │   ├── pdf/                        # PDF 生成
│   │   │   ├── generator.ts           # PDF 生成逻辑
│   │   │   └── templates/
│   │   │       ├── classic.tsx        # PDF 模板 - 经典
│   │   │       ├── modern.tsx         # PDF 模板 - 现代
│   │   │       └── minimal.tsx        # PDF 模板 - 极简
│   │   │
│   │   ├── config.ts                  # 应用配置（功能开关）
│   │   ├── utils.ts                   # 通用工具函数
│   │   └── constants.ts               # 常量定义
│   │
│   ├── hooks/                          # 自定义 React Hooks
│   │   ├── use-resume.ts              # 简历 CRUD 操作
│   │   ├── use-editor.ts             # 编辑器状态管理
│   │   ├── use-ai-chat.ts            # AI 对话交互
│   │   ├── use-pdf-export.ts         # PDF 导出逻辑
│   │   ├── use-fingerprint.ts        # 浏览器指纹
│   │   └── use-auth.ts               # 认证状态
│   │
│   ├── stores/                         # Zustand 状态仓库
│   │   ├── editor-store.ts            # 编辑器状态（选区、布局、选中项）
│   │   ├── resume-store.ts            # 简历数据仓库
│   │   └── ui-store.ts               # UI 状态（面板、弹窗）
│   │
│   ├── types/                          # TypeScript 类型定义
│   │   ├── resume.ts                  # 简历相关类型
│   │   ├── editor.ts                  # 编辑器相关类型
│   │   ├── ai.ts                      # AI 相关类型
│   │   ├── auth.ts                    # 认证相关类型
│   │   └── db.ts                      # 数据库相关类型
│   │
│   └── middleware.ts                   # Next.js 中间件（认证校验 + 国际化路由）
│
├── public/
│   ├── templates/                      # 模板缩略图
│   └── icons/
│
├── drizzle/                            # Drizzle 迁移文件（自动生成）
│   └── migrations/
│
└── ARCHITECTURE.md                     # 本文档
```

---

## 3. 架构设计

### 3.1 总体架构图

```
┌─────────────────────────────────────────────────────────────────────┐
│                          客户端（浏览器）                             │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │  仪表盘       │  │  编辑器      │  │  AI 对话     │              │
│  │ （简历列表）  │  │（拖拉拽）    │  │（流式响应）  │              │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘              │
│         │                 │                  │                      │
│  ┌──────┴─────────────────┴──────────────────┴───────┐              │
│  │              Zustand 状态管理                       │              │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ │              │
│  │  │ resume-store│ │ editor-store│ │   ui-store  │ │              │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ │              │
│  └──────────────────────┬────────────────────────────┘              │
│                         │                                           │
│  ┌──────────────────────┴────────────────────────────┐              │
│  │        next-intl (国际化) + FingerprintJS          │              │
│  └───────────────────────────────────────────────────┘              │
└────────────────────────────┬────────────────────────────────────────┘
                             │ HTTP / SSE
┌────────────────────────────┴────────────────────────────────────────┐
│                        Next.js 服务端                                │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────┐        │
│  │                    中间件层                               │        │
│  │     （认证校验 / 指纹检查 / 国际化路由重定向）            │        │
│  └─────────────────────────┬───────────────────────────────┘        │
│                            │                                        │
│  ┌─────────────────────────┴───────────────────────────────┐        │
│  │                     API 路由                             │        │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐  │        │
│  │  │ /api/    │  │ /api/    │  │ /api/    │  │ /api/  │  │        │
│  │  │ resume/* │  │  ai/*   │  │  auth/* │  │ user/* │  │        │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘  └───┬────┘  │        │
│  └───────┼──────────────┼──────────────┼───────────┼───────┘        │
│          │              │              │           │                 │
│  ┌───────┴──────────────┴──────────────┴───────────┴───────┐        │
│  │                   服务层 (Service)                       │        │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │        │
│  │  │ResumeService │  │  AIService   │  │  AuthService │   │        │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘   │        │
│  └─────────┼─────────────────┼─────────────────┼───────────┘        │
│            │                 │                  │                    │
│  ┌─────────┴─────────────────┴──────────────────┴───────────┐       │
│  │                 数据仓库层 (Repository)                    │       │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │       │
│  │  │UserRepository│  │ResumeRepo    │  │ChatRepository│    │       │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘    │       │
│  └─────────┼─────────────────┼─────────────────┼────────────┘       │
│            │                 │                  │                    │
│  ┌─────────┴─────────────────┴──────────────────┴───────────┐       │
│  │              数据库适配器（抽象层）                         │       │
│  │              ┌─────────────────────┐                      │       │
│  │              │   SQLite 适配器     │                      │       │
│  │              │ (drizzle-orm/sqlite)│                      │       │
│  │              └─────────┬───────────┘                      │       │
│  └────────────────────────┼────────────────────────────────┘       │
│                            │                                        │
│                     ┌──────┴──────┐                                 │
│                     │   SQLite    │                                 │
│                     └─────────────┘                                 │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 各模块职责

#### 3.2.1 编辑器模块（拖拉拽）

编辑器是系统核心模块，使用 **dnd-kit** 实现拖拉拽功能。

```
编辑器页面布局:
┌──────────────────────────────────────────────────────────────┐
│  工具栏（模板切换、撤销/重做、导出、设置、语言切换）          │
├────────────┬─────────────────────────────┬───────────────────┤
│            │                             │                   │
│  模块侧栏  │     编辑画布                │   AI 对话面板     │
│            │     （拖拉拽）              │   （可折叠）      │
│            │                             │                   │
│  - 个人信息│  ┌───────────────────────┐  │  ┌─────────────┐  │
│  - 个人简介│  │  个人信息             │  │  │ AI 消息     │  │
│  - 工作经历│  ├───────────────────────┤  │  ├─────────────┤  │
│  - 教育背景│  │  个人简介             │  │  │ AI 消息     │  │
│  - 技能特长│  ├───────────────────────┤  │  ├─────────────┤  │
│  - 项目经历│  │  工作经历             │  │  │ AI 建议     │  │
│  - 自定义  │  ├───────────────────────┤  │  ├─────────────┤  │
│            │  │  教育背景             │  │  │             │  │
│  [+ 添加]  │  ├───────────────────────┤  │  │  [输入框]   │  │
│            │  │  技能特长             │  │  │  [发送]     │  │
│            │  └───────────────────────┘  │  └─────────────┘  │
├────────────┴─────────────────────────────┴───────────────────┤
│  实时预览面板（可切换显示/隐藏，实时渲染简历效果）             │
└──────────────────────────────────────────────────────────────┘
```

**编辑器状态流转:**

```
用户操作（拖拽 / 编辑 / 添加）
       │
       ▼
┌─────────────────┐     ┌─────────────────┐
│  editor-store   │────▶│  resume-store    │
│  (UI 状态:      │     │  (数据状态:      │
│   选中项,       │     │   模块列表,      │
│   拖拽状态,     │     │   内容数据,      │
│   面板开关)     │     │   元信息)        │
└─────────────────┘     └────────┬────────┘
                                 │
                    ┌────────────┼────────────┐
                    ▼            ▼            ▼
              自动保存      实时预览      AI 上下文
              (防抖 500ms   (实时         (传递给
               调用 API)    重新渲染)     对话)
```

**拖拽架构:**

```typescript
// 模块排序：DndContext 包裹整个画布
// 用户可以：
// 1. 重新排序模块（拖拽模块上下移动）
// 2. 添加新模块（从侧栏拖入画布）
// 3. 模块内排序（如：重排工作经历条目）
// 4. 删除模块（拖拽到回收区或点击按钮）

// dnd-kit 层级结构：
DndContext
├── SortableContext（模块级）
│   ├── SortableSection（个人信息）
│   ├── SortableSection（工作经历）
│   │   └── SortableContext（模块内条目）
│   │       ├── SortableItem（工作-1）
│   │       ├── SortableItem（工作-2）
│   │       └── SortableItem（工作-3）
│   ├── SortableSection（教育背景）
│   └── SortableSection（技能特长）
└── DragOverlay（拖拽时的视觉反馈）
```

#### 3.2.2 AI 模块

使用 Vercel AI SDK 实现带简历上下文的流式对话。

```
用户输入："帮我优化工作经历的描述"
       │
       ▼
┌─────────────────────────────────┐
│         AI 对话面板              │
│  (使用 Vercel AI SDK 的 useChat)│
└──────────────┬──────────────────┘
               │ POST /api/ai/chat
               │ Body: { messages, resumeContext }
               ▼
┌─────────────────────────────────┐
│        API 路由处理器            │
│  1. 提取当前简历数据             │
│  2. 构建系统提示词               │
│  3. 调用 LLM 并传入上下文       │
└──────────────┬──────────────────┘
               │ 流式响应
               ▼
┌─────────────────────────────────┐
│       AI 响应类型:               │
│  1. 文本建议                     │
│  2. 结构化修改建议               │
│     （可直接应用到简历）         │
│  3. 整段内容重写                 │
└─────────────────────────────────┘
```

**AI 工具定义:**

AI 可以调用工具直接修改简历内容：

| 工具 | 说明 |
|------|------|
| `updateSection` | 更新指定模块的内容 |
| `addSection` | 向简历添加新模块 |
| `rewriteText` | 重写指定文本字段以优化表达 |
| `suggestSkills` | 根据工作经历推荐相关技能 |
| `optimizeForATS` | 针对 ATS（简历筛选系统）优化简历 |

#### 3.2.3 认证模块

抽象化认证，支持可插拔的提供者。

```
┌─────────────────────────────────────────────┐
│              认证配置                         │
│   AUTH_ENABLED=true|false（环境变量）         │
└──────────────────┬──────────────────────────┘
                   │
          ┌────────┴────────┐
          │                 │
    AUTH_ENABLED=true  AUTH_ENABLED=false
          │                 │
          ▼                 ▼
┌─────────────────┐ ┌─────────────────┐
│   NextAuth.js   │ │  指纹提供者      │
│                 │ │                 │
│  提供者:        │ │  FingerprintJS  │
│  - Google OAuth │ │  生成稳定的     │
│  -（可扩展）    │ │  浏览器 ID      │
│                 │ │  作为 userId    │
│  存储:          │ │                 │
│  - OAuth ID     │ │  无需服务端     │
│  - 邮箱         │ │  Session        │
│  - 头像         │ │                 │
└────────┬────────┘ └────────┬────────┘
         │                   │
         └─────────┬─────────┘
                   │
                   ▼
         ┌─────────────────┐
         │  统一用户解析    │
         │                 │
         │  getUserId():   │
         │  - 认证会话     │
         │    → user.id    │
         │  - 指纹        │
         │    → fp_xxxx    │
         └─────────────────┘
```

**应用配置 (`src/lib/config.ts`):**

```typescript
// 通过环境变量控制的功能开关
export const config = {
  auth: {
    enabled: process.env.AUTH_ENABLED === 'true',
    providers: ['google'],  // 可扩展
  },
  runtime: {
    // true when running inside the Electron desktop shell
    desktop: process.env.JADE_RUNTIME === 'desktop',
  },
  ai: {
    provider: process.env.AI_PROVIDER as 'openai' | 'anthropic',
    model: process.env.AI_MODEL || 'gpt-4o',
  },
  i18n: {
    defaultLocale: 'zh',
    locales: ['zh', 'en'] as const,
  },
};
```

#### 3.2.4 PDF 导出模块

```
简历数据（Zustand Store）
       │
       ▼
┌─────────────────────────────┐
│  选择模板                    │
│  （经典 / 现代 / 极简）      │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│  @react-pdf/renderer        │
│                             │
│  React 组件映射到 PDF 原语: │
│  - Document                 │
│  - Page                     │
│  - View                     │
│  - Text                     │
│  - Link                     │
│  - Image                    │
└──────────────┬──────────────┘
               │
       ┌───────┴───────┐
       ▼               ▼
  客户端生成        服务端生成
  （浏览器内）     (/api/resume/[id]/export)
  快速预览         高保真 PDF
  blob URL         流式返回
```

---

## 4. 国际化 (i18n) 设计

### 4.1 方案选型：next-intl

选择 **next-intl** 作为国际化方案，原因：

| 考量 | next-intl | next-i18next | 自研 |
|------|-----------|-------------|------|
| App Router 支持 | 原生支持 | 需额外适配 | 手动处理 |
| Server Components | 完整支持 | 有限支持 | 手动处理 |
| 类型安全 | TypeScript 友好 | 中等 | 自定义 |
| 路由国际化 | 内置 `/zh/`, `/en/` | 需手动 | 手动处理 |
| 包体积 | 轻量 | 较重 | 最小 |
| 维护状态 | 活跃 | 活跃 | - |

### 4.2 国际化架构

```
┌────────────────────────────────────────────────────────┐
│                    国际化架构                            │
│                                                        │
│  ┌──────────────────────────────────────────────┐      │
│  │  messages/                                    │      │
│  │  ├── zh.json  （中文翻译，作为默认语言）       │      │
│  │  └── en.json  （英文翻译）                    │      │
│  └──────────────────────┬───────────────────────┘      │
│                         │                              │
│  ┌──────────────────────┴───────────────────────┐      │
│  │  src/i18n/                                    │      │
│  │  ├── config.ts     语言列表 + 默认语言        │      │
│  │  ├── request.ts    next-intl 服务端请求配置    │      │
│  │  └── routing.ts    路由国际化配置              │      │
│  └──────────────────────┬───────────────────────┘      │
│                         │                              │
│  ┌──────────────────────┴───────────────────────┐      │
│  │  middleware.ts                                 │      │
│  │  ├── 检测用户语言偏好（Accept-Language / Cookie）│    │
│  │  ├── 重定向到带语言前缀的路径                    │    │
│  │  └── /dashboard → /zh/dashboard 或 /en/dashboard │   │
│  └──────────────────────┬───────────────────────┘      │
│                         │                              │
│  ┌──────────────────────┴───────────────────────┐      │
│  │  app/[locale]/layout.tsx                      │      │
│  │  ├── 注入 NextIntlClientProvider              │      │
│  │  ├── 设置 <html lang={locale}>                │      │
│  │  └── 向所有子页面提供翻译上下文                │      │
│  └──────────────────────────────────────────────┘      │
└────────────────────────────────────────────────────────┘
```

### 4.3 路由结构

```
URL 结构:
  /zh/dashboard          → 中文仪表盘
  /en/dashboard          → 英文仪表盘
  /zh/editor/abc-123     → 中文编辑器
  /en/editor/abc-123     → 英文编辑器
  /api/resume            → API 不带语言前缀（语言无关）
  /api/ai/chat           → API 不带语言前缀

中间件处理:
  / → 自动重定向到 /zh/（根据浏览器偏好或默认语言）
  /dashboard → 重定向到 /zh/dashboard
```

### 4.4 翻译文件结构

翻译文件采用扁平命名空间组织，按功能模块划分。

**`messages/zh.json`（中文 - 默认语言）:**

```json
{
  "common": {
    "appName": "JadeAI",
    "save": "保存",
    "cancel": "取消",
    "delete": "删除",
    "edit": "编辑",
    "create": "创建",
    "duplicate": "复制",
    "export": "导出",
    "loading": "加载中...",
    "confirm": "确认",
    "back": "返回",
    "search": "搜索",
    "noData": "暂无数据"
  },

  "auth": {
    "login": "登录",
    "logout": "退出登录",
    "loginWithGoogle": "使用 Google 登录",
    "welcomeBack": "欢迎回来",
    "loginDescription": "登录以管理你的简历"
  },

  "dashboard": {
    "title": "我的简历",
    "createResume": "新建简历",
    "createResumeDescription": "从空白模板开始创建新简历",
    "resumeCount": "共 {count} 份简历",
    "lastEdited": "最后编辑于 {date}",
    "deleteConfirm": "确定要删除「{title}」吗？此操作不可恢复。",
    "duplicateSuccess": "简历已复制",
    "noResumes": "还没有简历，点击上方按钮创建一份吧",
    "templateClassic": "经典",
    "templateModern": "现代",
    "templateMinimal": "极简"
  },

  "editor": {
    "toolbar": {
      "undo": "撤销",
      "redo": "重做",
      "preview": "预览",
      "export": "导出 PDF",
      "template": "切换模板",
      "settings": "设置",
      "autoSaved": "已自动保存",
      "saving": "保存中..."
    },
    "sidebar": {
      "sections": "简历模块",
      "addSection": "添加模块",
      "dragHint": "拖拽模块以调整顺序"
    },
    "sections": {
      "personalInfo": "个人信息",
      "summary": "个人简介",
      "workExperience": "工作经历",
      "education": "教育背景",
      "skills": "技能特长",
      "projects": "项目经历",
      "certifications": "资格证书",
      "languages": "语言能力",
      "awards": "获奖荣誉",
      "publications": "发表文章",
      "volunteer": "志愿服务",
      "references": "推荐人",
      "custom": "自定义模块"
    },
    "fields": {
      "fullName": "姓名",
      "jobTitle": "职位",
      "email": "邮箱",
      "phone": "电话",
      "location": "所在地",
      "website": "个人网站",
      "company": "公司",
      "position": "职位",
      "startDate": "开始时间",
      "endDate": "结束时间",
      "current": "至今",
      "description": "描述",
      "highlights": "亮点",
      "institution": "学校",
      "degree": "学位",
      "field": "专业",
      "gpa": "GPA",
      "skillCategory": "技能分类",
      "projectName": "项目名称",
      "technologies": "技术栈"
    }
  },

  "ai": {
    "panelTitle": "AI 助手",
    "placeholder": "描述你想优化的内容...",
    "send": "发送",
    "thinking": "AI 思考中...",
    "suggestion": "AI 建议",
    "applySuggestion": "应用建议",
    "dismissSuggestion": "忽略",
    "defaultGreeting": "你好！我是你的简历优化助手。告诉我你想改进简历的哪个部分？",
    "errorMessage": "出错了，请稍后重试"
  },

  "pdf": {
    "exporting": "正在生成 PDF...",
    "exportSuccess": "PDF 导出成功",
    "exportError": "PDF 导出失败，请重试",
    "selectTemplate": "选择导出模板"
  },

  "settings": {
    "title": "设置",
    "language": "界面语言",
    "theme": "主题",
    "themeLight": "浅色",
    "themeDark": "深色",
    "themeSystem": "跟随系统"
  }
}
```

**`messages/en.json`（英文）:**

```json
{
  "common": {
    "appName": "JadeAI",
    "save": "Save",
    "cancel": "Cancel",
    "delete": "Delete",
    "edit": "Edit",
    "create": "Create",
    "duplicate": "Duplicate",
    "export": "Export",
    "loading": "Loading...",
    "confirm": "Confirm",
    "back": "Back",
    "search": "Search",
    "noData": "No data"
  },

  "auth": {
    "login": "Log in",
    "logout": "Log out",
    "loginWithGoogle": "Sign in with Google",
    "welcomeBack": "Welcome back",
    "loginDescription": "Sign in to manage your resumes"
  },

  "dashboard": {
    "title": "My Resumes",
    "createResume": "New Resume",
    "createResumeDescription": "Start from a blank template",
    "resumeCount": "{count} resumes",
    "lastEdited": "Last edited {date}",
    "deleteConfirm": "Are you sure you want to delete \"{title}\"? This action cannot be undone.",
    "duplicateSuccess": "Resume duplicated",
    "noResumes": "No resumes yet. Click the button above to create one.",
    "templateClassic": "Classic",
    "templateModern": "Modern",
    "templateMinimal": "Minimal"
  },

  "editor": {
    "toolbar": {
      "undo": "Undo",
      "redo": "Redo",
      "preview": "Preview",
      "export": "Export PDF",
      "template": "Switch Template",
      "settings": "Settings",
      "autoSaved": "Auto-saved",
      "saving": "Saving..."
    },
    "sidebar": {
      "sections": "Sections",
      "addSection": "Add Section",
      "dragHint": "Drag sections to reorder"
    },
    "sections": {
      "personalInfo": "Personal Info",
      "summary": "Summary",
      "workExperience": "Work Experience",
      "education": "Education",
      "skills": "Skills",
      "projects": "Projects",
      "certifications": "Certifications",
      "languages": "Languages",
      "awards": "Awards",
      "publications": "Publications",
      "volunteer": "Volunteer",
      "references": "References",
      "custom": "Custom Section"
    },
    "fields": {
      "fullName": "Full Name",
      "jobTitle": "Job Title",
      "email": "Email",
      "phone": "Phone",
      "location": "Location",
      "website": "Website",
      "company": "Company",
      "position": "Position",
      "startDate": "Start Date",
      "endDate": "End Date",
      "current": "Present",
      "description": "Description",
      "highlights": "Highlights",
      "institution": "Institution",
      "degree": "Degree",
      "field": "Field of Study",
      "gpa": "GPA",
      "skillCategory": "Category",
      "projectName": "Project Name",
      "technologies": "Technologies"
    }
  },

  "ai": {
    "panelTitle": "AI Assistant",
    "placeholder": "Describe what you want to improve...",
    "send": "Send",
    "thinking": "AI is thinking...",
    "suggestion": "AI Suggestion",
    "applySuggestion": "Apply",
    "dismissSuggestion": "Dismiss",
    "defaultGreeting": "Hi! I'm your resume optimization assistant. Which part of your resume would you like to improve?",
    "errorMessage": "Something went wrong. Please try again."
  },

  "pdf": {
    "exporting": "Generating PDF...",
    "exportSuccess": "PDF exported successfully",
    "exportError": "PDF export failed. Please try again.",
    "selectTemplate": "Select export template"
  },

  "settings": {
    "title": "Settings",
    "language": "Language",
    "theme": "Theme",
    "themeLight": "Light",
    "themeDark": "Dark",
    "themeSystem": "System"
  }
}
```

### 4.5 i18n 核心配置

**`src/i18n/config.ts`:**

```typescript
export const locales = ['zh', 'en'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'zh';

export const localeNames: Record<Locale, string> = {
  zh: '中文',
  en: 'English',
};
```

**`src/i18n/request.ts`:**

```typescript
import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;
  if (!locale || !routing.locales.includes(locale as any)) {
    locale = routing.defaultLocale;
  }
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
```

**`src/i18n/routing.ts`:**

```typescript
import { defineRouting } from 'next-intl/routing';
import { locales, defaultLocale } from './config';

export const routing = defineRouting({
  locales,
  defaultLocale,
});
```

### 4.6 组件中使用示例

**Server Component（服务端组件）:**

```typescript
import { useTranslations } from 'next-intl';

export default function DashboardPage() {
  const t = useTranslations('dashboard');

  return (
    <div>
      <h1>{t('title')}</h1>
      <p>{t('resumeCount', { count: 3 })}</p>
    </div>
  );
}
```

**Client Component（客户端组件）:**

```typescript
'use client';
import { useTranslations } from 'next-intl';

export function CreateResumeButton() {
  const t = useTranslations('dashboard');

  return <button>{t('createResume')}</button>;
}
```

**语言切换器 (`locale-switcher.tsx`):**

```typescript
'use client';
import { useLocale } from 'next-intl';
import { useRouter, usePathname } from 'next/navigation';
import { locales, localeNames } from '@/i18n/config';

export function LocaleSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  function switchLocale(newLocale: string) {
    // 替换路径中的语言前缀
    const newPath = pathname.replace(`/${locale}`, `/${newLocale}`);
    router.replace(newPath);
  }

  return (
    <select value={locale} onChange={(e) => switchLocale(e.target.value)}>
      {locales.map((loc) => (
        <option key={loc} value={loc}>{localeNames[loc]}</option>
      ))}
    </select>
  );
}
```

### 4.7 国际化注意事项

| 场景 | 处理方式 |
|------|---------|
| **UI 界面文本** | 全部通过 `useTranslations` 获取，不硬编码 |
| **简历内容** | 不做翻译——这是用户自己填写的数据 |
| **简历模块标题默认值** | 创建简历时根据 `resume.language` 设置默认标题 |
| **AI 对话** | 根据用户界面语言选择系统提示词语言 |
| **日期格式** | 中文：`2024年3月`，英文：`Mar 2024`，通过 `Intl.DateTimeFormat` |
| **API 错误消息** | API 返回 error code，客户端根据当前语言翻译 |
| **PDF 导出** | PDF 内容语言跟随 `resume.language`，与 UI 语言独立 |

---

## 5. 数据库设计

### 5.1 数据库抽象架构

所有数据库操作通过 **Drizzle ORM** 统一抽象层进行。Schema 在 `src/lib/db/schema.ts` **唯一定义**，由 SQLite 适配器使用。数据库只有 SQLite 一条路径——桌面客户端定位下不需要连接远端数据库，适配器接口仍然保留，是为未来可能的存储后端预留扩展点，而非当前有多种实现可选。

```
┌────────────────────────────────────────────────┐
│         schema.ts（唯一数据源 / Single Source） │
│                                                │
│  定义所有表、字段、关系、索引                    │
│  使用 Drizzle 的 Schema API                    │
└──────────────────────┬─────────────────────────┘
                       │
                       ▼
┌────────────────────────────────────────────────┐
│              SQLite 适配器                       │
│                                                │
│  import { drizzle } from 'drizzle-orm/          │
│  better-sqlite3'                                │
│                                                │
│  连接方式: ./data/jade.db（SQLITE_PATH 可覆盖） │
└──────────────────────┬─────────────────────────┘
                       │
                       ▼
┌────────────────────────────────────────────────┐
│           数据库适配器接口                       │
│                                                │
│  export interface DatabaseAdapter {            │
│    db: DrizzleInstance;                         │
│    initialize(): Promise<void>;                │
│    migrate(): Promise<void>;                   │
│    close(): Promise<void>;                     │
│  }                                             │
└──────────────────────┬─────────────────────────┘
                       │
                       ▼
┌────────────────────────────────────────────────┐
│            数据仓库层 (Repository)               │
│                                                │
│  Repository 接收 db 实例，                      │
│  使用 Drizzle 查询构建器执行类型安全查询         │
│                                                │
│  - UserRepository                              │
│  - ResumeRepository                            │
│  - ChatRepository                              │
└────────────────────────────────────────────────┘
```

**数据库入口 (`src/lib/db/index.ts`):**

```typescript
// 本文件是数据库适配器的 **唯一** 实例化位置。
// 所有其他模块统一从此处导入 `db`。

import { SQLiteAdapter } from './adapters/sqlite';
import type { DatabaseAdapter } from './adapter';

const adapter: DatabaseAdapter = new SQLiteAdapter(
  process.env.SQLITE_PATH || './data/jade.db',
);

export const dbReady = adapter.initialize();

export const db = adapter.db;
export { adapter };
```

### 5.2 实体关系图 (ER Diagram)

```
┌─────────────────────┐       ┌──────────────────────┐
│       users          │       │   auth_accounts      │
│      （用户表）      │       │  （第三方账户表）     │
├─────────────────────┤       ├──────────────────────┤
│ id (PK, UUID)       │◄──┐   │ id (PK, UUID)        │
│ email（邮箱）       │   │   │ user_id (FK → users) │
│ name（名称）        │   ├───│ provider（提供者）    │
│ avatar_url（头像）  │   │   │ provider_account_id   │
│ fingerprint（指纹） │   │   │ access_token          │
│ auth_type（认证方式）│   │   │ refresh_token         │
│ created_at           │   │   │ expires_at            │
│ updated_at           │   │   │ created_at            │
└──────────┬──────────┘   │   └──────────────────────┘
           │              │
           │ 1:N          │
           ▼              │
┌─────────────────────┐   │   ┌──────────────────────┐
│      resumes         │   │   │   resume_sections    │
│     （简历表）       │   │   │  （简历模块表）      │
├─────────────────────┤   │   ├──────────────────────┤
│ id (PK, UUID)       │   │   │ id (PK, UUID)        │
│ user_id (FK → users)│───┘   │ resume_id (FK)       │
│ title（标题）       │◄─────│ type（模块类型）      │
│ template（模板）    │      │ title（模块标题）     │
│ theme_config (json)  │      │ sort_order（排序）    │
│ is_default（默认）  │      │ visible（是否可见）   │
│ language（语言）    │      │ content (jsonb)       │
│ created_at           │      │ created_at            │
│ updated_at           │      │ updated_at            │
└──────────┬──────────┘      └──────────────────────┘
           │
           │ 1:N
           ▼
┌─────────────────────┐
│   chat_sessions      │
│  （对话会话表）      │
├─────────────────────┤
│ id (PK, UUID)       │
│ resume_id (FK)      │
│ title（标题）       │
│ created_at           │
│ updated_at           │
└──────────┬──────────┘
           │
           │ 1:N
           ▼
┌─────────────────────┐
│   chat_messages      │
│  （对话消息表）      │
├─────────────────────┤
│ id (PK, UUID)       │
│ session_id (FK)     │
│ role（角色）        │
│ content（内容）     │
│ metadata (jsonb)     │
│ created_at           │
└─────────────────────┘
```

### 5.3 表定义详情

#### 5.3.1 `users` 表（用户表）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | UUID | PK, DEFAULT uuid_generate_v4() | 用户唯一标识 |
| `email` | VARCHAR(255) | NULLABLE, UNIQUE | 邮箱（来自 OAuth） |
| `name` | VARCHAR(255) | NULLABLE | 显示名称 |
| `avatar_url` | TEXT | NULLABLE | 头像 URL |
| `fingerprint` | VARCHAR(255) | NULLABLE, UNIQUE | 浏览器指纹（匿名用户） |
| `auth_type` | ENUM('oauth', 'fingerprint') | NOT NULL | 认证方式 |
| `created_at` | TIMESTAMP | NOT NULL, DEFAULT NOW() | 创建时间 |
| `updated_at` | TIMESTAMP | NOT NULL, DEFAULT NOW() | 更新时间 |

**索引:**
- `idx_users_email` → `email`
- `idx_users_fingerprint` → `fingerprint`

#### 5.3.2 `auth_accounts` 表（第三方账户表）

存储第三方 OAuth 账户信息。一个用户可关联多个第三方账户。

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | UUID | PK, DEFAULT uuid_generate_v4() | 账户唯一标识 |
| `user_id` | UUID | FK → users.id, NOT NULL | 关联用户 |
| `provider` | VARCHAR(50) | NOT NULL | OAuth 提供者名称（如 'google'） |
| `provider_account_id` | VARCHAR(255) | NOT NULL | 提供者返回的唯一 ID |
| `access_token` | TEXT | NULLABLE | OAuth access token |
| `refresh_token` | TEXT | NULLABLE | OAuth refresh token |
| `token_type` | VARCHAR(50) | NULLABLE | Token 类型（如 'Bearer'） |
| `expires_at` | TIMESTAMP | NULLABLE | Token 过期时间 |
| `scope` | TEXT | NULLABLE | 授权范围 |
| `created_at` | TIMESTAMP | NOT NULL, DEFAULT NOW() | 创建时间 |

**索引:**
- `idx_auth_accounts_user_id` → `user_id`
- `uniq_auth_accounts_provider` → `(provider, provider_account_id)` UNIQUE

#### 5.3.3 `resumes` 表（简历表）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | UUID | PK, DEFAULT uuid_generate_v4() | 简历唯一标识 |
| `user_id` | UUID | FK → users.id, NOT NULL | 所属用户 |
| `title` | VARCHAR(255) | NOT NULL, DEFAULT '未命名简历' | 简历标题 |
| `template` | VARCHAR(50) | NOT NULL, DEFAULT 'classic' | 模板名称 |
| `theme_config` | JSONB | DEFAULT '{}' | 主题配置（颜色、字体、间距等） |
| `is_default` | BOOLEAN | NOT NULL, DEFAULT false | 是否为默认简历 |
| `language` | VARCHAR(10) | NOT NULL, DEFAULT 'zh' | 简历语言（'en' / 'zh'） |
| `created_at` | TIMESTAMP | NOT NULL, DEFAULT NOW() | 创建时间 |
| `updated_at` | TIMESTAMP | NOT NULL, DEFAULT NOW() | 更新时间 |

**索引:**
- `idx_resumes_user_id` → `user_id`

**`theme_config` JSON 结构:**
```json
{
  "primaryColor": "#1a1a1a",
  "accentColor": "#3b82f6",
  "fontFamily": "Inter",
  "fontSize": "medium",
  "lineSpacing": 1.5,
  "margin": { "top": 20, "right": 20, "bottom": 20, "left": 20 },
  "sectionSpacing": 16
}
```

#### 5.3.4 `resume_sections` 表（简历模块表）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | UUID | PK, DEFAULT uuid_generate_v4() | 模块唯一标识 |
| `resume_id` | UUID | FK → resumes.id, ON DELETE CASCADE, NOT NULL | 所属简历 |
| `type` | VARCHAR(50) | NOT NULL | 模块类型（见下方枚举） |
| `title` | VARCHAR(255) | NOT NULL | 模块显示标题 |
| `sort_order` | INTEGER | NOT NULL, DEFAULT 0 | 排序顺序 |
| `visible` | BOOLEAN | NOT NULL, DEFAULT true | 是否在简历中显示 |
| `content` | JSONB | NOT NULL, DEFAULT '{}' | 模块内容（结构因类型而异） |
| `created_at` | TIMESTAMP | NOT NULL, DEFAULT NOW() | 创建时间 |
| `updated_at` | TIMESTAMP | NOT NULL, DEFAULT NOW() | 更新时间 |

**索引:**
- `idx_resume_sections_resume_id` → `resume_id`
- `idx_resume_sections_sort` → `(resume_id, sort_order)`

**模块类型枚举:**

| 类型 | 说明 |
|------|------|
| `personal_info` | 姓名、邮箱、电话、所在地、链接 |
| `summary` | 个人简介 / 求职目标 |
| `work_experience` | 工作经历 |
| `education` | 教育背景 |
| `skills` | 技能特长 |
| `projects` | 项目经历 |
| `certifications` | 资格证书 |
| `languages` | 语言能力 |
| `awards` | 获奖荣誉 |
| `publications` | 发表文章 |
| `volunteer` | 志愿服务 |
| `references` | 推荐人 |
| `custom` | 自定义模块 |

**各模块 `content` JSON 结构:**

**personal_info（个人信息）:**
```json
{
  "fullName": "张三",
  "jobTitle": "高级软件工程师",
  "email": "zhangsan@example.com",
  "phone": "+86-138-0000-0000",
  "location": "上海市",
  "website": "https://zhangsan.dev",
  "linkedin": "https://linkedin.com/in/zhangsan",
  "github": "https://github.com/zhangsan",
  "customLinks": [
    { "label": "作品集", "url": "https://portfolio.zhangsan.dev" }
  ]
}
```

**summary（个人简介）:**
```json
{
  "text": "8年以上软件开发经验，专注于全栈 Web 开发..."
}
```

**work_experience（工作经历）:**
```json
{
  "items": [
    {
      "id": "uuid",
      "company": "字节跳动",
      "position": "高级前端工程师",
      "location": "北京市",
      "startDate": "2021-01",
      "endDate": null,
      "current": true,
      "description": "负责抖音 Web 端核心功能开发...",
      "highlights": [
        "将页面加载性能提升 40%",
        "带领 5 人团队完成技术架构升级"
      ]
    }
  ]
}
```

**education（教育背景）:**
```json
{
  "items": [
    {
      "id": "uuid",
      "institution": "清华大学",
      "degree": "硕士",
      "field": "计算机科学与技术",
      "location": "北京市",
      "startDate": "2015-09",
      "endDate": "2018-06",
      "gpa": "3.8/4.0",
      "highlights": ["优秀毕业生", "国家奖学金"]
    }
  ]
}
```

**skills（技能特长）:**
```json
{
  "categories": [
    {
      "id": "uuid",
      "name": "编程语言",
      "skills": ["TypeScript", "Python", "Go", "Rust"]
    },
    {
      "id": "uuid",
      "name": "框架",
      "skills": ["React", "Next.js", "FastAPI"]
    }
  ]
}
```

**projects（项目经历）:**
```json
{
  "items": [
    {
      "id": "uuid",
      "name": "JadeAI",
      "url": "https://github.com/...",
      "startDate": "2024-01",
      "endDate": "2024-06",
      "description": "AI 驱动的智能简历生成器...",
      "technologies": ["React", "Next.js", "AI SDK"],
      "highlights": ["10k+ 用户", "开源项目"]
    }
  ]
}
```

**custom（自定义模块）:**
```json
{
  "items": [
    {
      "id": "uuid",
      "title": "条目标题",
      "subtitle": "可选副标题",
      "date": "2024",
      "description": "描述文本..."
    }
  ]
}
```

#### 5.3.5 `chat_sessions` 表（对话会话表）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | UUID | PK, DEFAULT uuid_generate_v4() | 会话唯一标识 |
| `resume_id` | UUID | FK → resumes.id, ON DELETE CASCADE, NOT NULL | 关联简历 |
| `title` | VARCHAR(255) | NOT NULL, DEFAULT '新对话' | 对话标题 |
| `created_at` | TIMESTAMP | NOT NULL, DEFAULT NOW() | 创建时间 |
| `updated_at` | TIMESTAMP | NOT NULL, DEFAULT NOW() | 更新时间 |

**索引:**
- `idx_chat_sessions_resume_id` → `resume_id`

#### 5.3.6 `chat_messages` 表（对话消息表）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | UUID | PK, DEFAULT uuid_generate_v4() | 消息唯一标识 |
| `session_id` | UUID | FK → chat_sessions.id, ON DELETE CASCADE, NOT NULL | 所属会话 |
| `role` | VARCHAR(20) | NOT NULL | 角色：'user' / 'assistant' / 'system' |
| `content` | TEXT | NOT NULL | 消息内容 |
| `metadata` | JSONB | DEFAULT '{}' | 附加数据（工具调用、建议等） |
| `created_at` | TIMESTAMP | NOT NULL, DEFAULT NOW() | 消息时间 |

**索引:**
- `idx_chat_messages_session_id` → `session_id`
- `idx_chat_messages_created` → `(session_id, created_at)`

**`metadata` JSON 结构（AI 消息携带修改建议时）:**
```json
{
  "toolCalls": [
    {
      "tool": "updateSection",
      "args": {
        "sectionId": "uuid",
        "field": "highlights",
        "value": ["优化后的亮点 1", "优化后的亮点 2"]
      },
      "applied": false
    }
  ]
}
```

### 5.4 Drizzle Schema 定义

Schema 在 `src/lib/db/schema.ts` 中唯一定义，只服务于 SQLite 一个适配器。

```typescript
// 伪代码表示 Schema 定义（字段类型经过简化，完整定义以 schema.ts 为准）

// --- 表定义 ---
users = sqliteTable('users', {
  id:          text().primaryKey().$defaultFn(() => crypto.randomUUID()),
  email:       text().unique(),
  name:        text(),
  avatarUrl:   text(),
  fingerprint: text().unique(),
  authType:    text({ enum: ['oauth', 'fingerprint', 'local'] }).notNull(),
  createdAt:   integer({ mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt:   integer({ mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
})

authAccounts = sqliteTable('auth_accounts', {
  id:                text().primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId:            text().notNull().references(() => users.id),
  provider:          text().notNull(),
  providerAccountId: text().notNull(),
  accessToken:       text(),
  refreshToken:      text(),
  tokenType:         text(),
  expiresAt:         integer({ mode: 'timestamp' }),
  scope:             text(),
  createdAt:         integer({ mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (table) => ({
  uniqueProvider: uniqueIndex().on(table.provider, table.providerAccountId),
}))

resumes = sqliteTable('resumes', {
  id:          text().primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId:      text().notNull().references(() => users.id),
  title:       text().notNull().default('未命名简历'),
  template:    text().notNull().default('classic'),
  themeConfig: text({ mode: 'json' }).default('{}'),
  isDefault:   integer({ mode: 'boolean' }).notNull().default(false),
  language:    text().notNull().default('zh'),
  createdAt:   integer({ mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt:   integer({ mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
})

resumeSections = sqliteTable('resume_sections', {
  id:        text().primaryKey().$defaultFn(() => crypto.randomUUID()),
  resumeId:  text().notNull().references(() => resumes.id, { onDelete: 'cascade' }),
  type:      text().notNull(),
  title:     text().notNull(),
  sortOrder: integer().notNull().default(0),
  visible:   integer({ mode: 'boolean' }).notNull().default(true),
  content:   text({ mode: 'json' }).notNull().default('{}'),
  createdAt: integer({ mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer({ mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
})

chatSessions = sqliteTable('chat_sessions', {
  id:        text().primaryKey().$defaultFn(() => crypto.randomUUID()),
  resumeId:  text().notNull().references(() => resumes.id, { onDelete: 'cascade' }),
  title:     text().notNull().default('新对话'),
  createdAt: integer({ mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer({ mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
})

chatMessages = sqliteTable('chat_messages', {
  id:        text().primaryKey().$defaultFn(() => crypto.randomUUID()),
  sessionId: text().notNull().references(() => chatSessions.id, { onDelete: 'cascade' }),
  role:      text({ enum: ['user', 'assistant', 'system'] }).notNull(),
  content:   text().notNull(),
  metadata:  text({ mode: 'json' }).default('{}'),
  createdAt: integer({ mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
})
```

### 5.5 数据库初始化流程

数据库在应用启动时通过统一入口 **一次性** 初始化：

```
应用启动
       │
       ▼
┌─────────────────────────┐
│  实例化 SQLite 适配器    │
│  (SQLITE_PATH 可覆盖路径)│
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│  adapter.initialize()   │
│  - 建立连接              │
│  - 执行迁移              │
│  - 验证表是否存在        │
└─────────────────────────┘
             │
             ▼
┌─────────────────────────┐
│  导出 `db` 实例          │
│  （全应用共享）          │
└─────────────────────────┘
```

迁移使用 Drizzle Kit，从唯一的 `schema.ts` 文件生成：

```bash
# 生成迁移文件
pnpm drizzle-kit generate

# 执行迁移
pnpm drizzle-kit migrate

# 或通过代码调用 adapter.migrate()
```

---

## 6. API 设计

### 6.1 API 总览

所有 API 采用 RESTful 风格，返回 JSON。AI 对话使用 SSE 流式响应。API 路由不带语言前缀。

| 方法 | 端点 | 说明 |
|------|------|------|
| `GET` | `/api/resume` | 获取当前用户的简历列表 |
| `POST` | `/api/resume` | 创建新简历 |
| `GET` | `/api/resume/[id]` | 获取简历详情（含所有模块） |
| `PUT` | `/api/resume/[id]` | 更新简历元信息 |
| `DELETE` | `/api/resume/[id]` | 删除简历 |
| `POST` | `/api/resume/[id]/duplicate` | 复制简历 |
| `GET` | `/api/resume/[id]/export` | 导出简历为 PDF |
| `POST` | `/api/ai/chat` | 发送 AI 对话消息（流式） |
| `GET` | `/api/user` | 获取当前用户信息 |
| `PUT` | `/api/user` | 更新用户信息 |

### 6.2 核心 API 契约

**POST /api/resume**
```json
// 请求
{
  "title": "我的简历",
  "template": "modern",
  "language": "zh"
}

// 响应 (201)
{
  "id": "uuid",
  "title": "我的简历",
  "template": "modern",
  "language": "zh",
  "sections": [
    // 默认模块自动创建，标题根据 language 设置
    { "id": "uuid", "type": "personal_info", "title": "个人信息", "sortOrder": 0 },
    { "id": "uuid", "type": "summary", "title": "个人简介", "sortOrder": 1 },
    { "id": "uuid", "type": "work_experience", "title": "工作经历", "sortOrder": 2 },
    { "id": "uuid", "type": "education", "title": "教育背景", "sortOrder": 3 },
    { "id": "uuid", "type": "skills", "title": "技能特长", "sortOrder": 4 }
  ],
  "createdAt": "2025-01-01T00:00:00Z"
}
```

**POST /api/ai/chat**
```json
// 请求
{
  "messages": [
    { "role": "user", "content": "帮我优化工作经历的描述" }
  ],
  "resumeId": "uuid",
  "sessionId": "uuid"
}

// 响应：Server-Sent Events 流
// data: {"type":"text","content":"好的，我来帮你优化..."}
// data: {"type":"tool_call","tool":"updateSection","args":{...}}
// data: {"type":"done"}
```

---

## 7. 认证流程

### 7.1 OAuth 流程（AUTH_ENABLED=true）

```
┌──────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│客户端│     │ NextAuth  │     │  Google   │     │  数据库  │
└──┬───┘     └────┬─────┘     └────┬─────┘     └────┬─────┘
   │              │                │                 │
   │ 点击登录     │                │                 │
   ├─────────────▶│                │                 │
   │              │ 重定向到       │                 │
   │              │ Google OAuth   │                 │
   │              ├───────────────▶│                 │
   │              │                │                 │
   │              │   授权码       │                 │
   │              │◀───────────────┤                 │
   │              │                │                 │
   │              │ 交换 Token     │                 │
   │              ├───────────────▶│                 │
   │              │                │                 │
   │              │  Access Token  │                 │
   │              │  + 用户信息    │                 │
   │              │◀───────────────┤                 │
   │              │                                  │
   │              │ 创建/更新 user + auth_account    │
   │              ├─────────────────────────────────▶│
   │              │                                  │
   │              │          用户记录                 │
   │              │◀─────────────────────────────────┤
   │              │                                  │
   │  设置 Session│                                  │
   │◀─────────────┤                                  │
   │  (JWT/Cookie)│                                  │
```

### 7.2 浏览器指纹流程（AUTH_ENABLED=false）

```
┌──────┐                    ┌──────────────┐     ┌──────────┐
│客户端│                    │FingerprintJS │     │  数据库  │
└──┬───┘                    └──────┬───────┘     └────┬─────┘
   │                               │                  │
   │  页面加载                     │                  │
   │  初始化 FingerprintJS        │                  │
   ├──────────────────────────────▶│                  │
   │                               │                  │
   │  返回 visitorId              │                  │
   │◀──────────────────────────────┤                  │
   │                               │                  │
   │  API 请求携带                 │                  │
   │  X-Fingerprint: fp_xxx       │                  │
   ├──────────────────────────────────────────────────▶│
   │                                                   │
   │  创建/查找指纹用户                                │
   │  （不存在则创建）                                 │
   │◀──────────────────────────────────────────────────┤
   │                                                   │
   │  指纹存入 localStorage                            │
   │  作为后备                                         │
```

### 7.3 用户解析中间件

```typescript
// 中间件用户解析伪代码
async function resolveUser(request):
  if AUTH_ENABLED:
    session = await getServerSession()
    if session:
      return { userId: session.user.id, authType: 'oauth' }
    else:
      redirect('/login')
  else:
    fingerprint = request.headers.get('X-Fingerprint')
    if fingerprint:
      user = await upsertFingerprintUser(fingerprint)
      return { userId: user.id, authType: 'fingerprint' }
    else:
      return 401  // 需要指纹
```

---

## 8. 状态管理

### 8.1 Store 架构

```
┌─────────────────────────────────────────────────┐
│                  Zustand Stores                  │
│                                                  │
│  ┌─────────────────────────────────────────────┐ │
│  │  resume-store（简历数据仓库）               │ │
│  │  - currentResume: Resume | null             │ │
│  │  - sections: ResumeSection[]                │ │
│  │  - isDirty: boolean                         │ │
│  │  - isSaving: boolean                        │ │
│  │  - updateSection(id, data)                  │ │
│  │  - addSection(type)                         │ │
│  │  - removeSection(id)                        │ │
│  │  - reorderSections(activeId, overId)        │ │
│  │  - save()  // 防抖自动保存                  │ │
│  └─────────────────────────────────────────────┘ │
│                                                  │
│  ┌─────────────────────────────────────────────┐ │
│  │  editor-store（编辑器状态仓库）             │ │
│  │  - selectedSectionId: string | null         │ │
│  │  - selectedItemId: string | null            │ │
│  │  - isDragging: boolean                      │ │
│  │  - showPreview: boolean                     │ │
│  │  - showAiPanel: boolean                     │ │
│  │  - zoom: number                             │ │
│  │  - undoStack: ResumeSnapshot[]              │ │
│  │  - redoStack: ResumeSnapshot[]              │ │
│  │  - undo()                                   │ │
│  │  - redo()                                   │ │
│  └─────────────────────────────────────────────┘ │
│                                                  │
│  ┌─────────────────────────────────────────────┐ │
│  │  ui-store（UI 状态仓库）                    │ │
│  │  - sidebarOpen: boolean                     │ │
│  │  - activeModal: ModalType | null            │ │
│  │  - toasts: Toast[]                          │ │
│  │  - theme: 'light' | 'dark'                  │ │
│  └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

### 8.2 数据流转

```
用户编辑简历模块
         │
         ▼
resume-store.updateSection(sectionId, newData)
         │
         ├──▶ 更新本地状态（即时 UI 更新）
         │
         ├──▶ 压入撤销栈
         │
         ├──▶ 触发实时预览重新渲染
         │
         └──▶ 防抖自动保存（500ms）
                    │
                    ▼
              PUT /api/resume/[id]
              （提交更新后的模块数据）
                    │
                    ▼
              resume-store.isSaving = false
              resume-store.isDirty = false
```

---

## 9. 环境变量

```bash
# .env.example

# ===== 应用 =====
APP_NAME=JadeAI

# ===== 认证 =====
AUTH_ENABLED=true           # 设为 'false' 使用浏览器指纹模式
AUTH_SECRET=your-auth-secret-key        # NextAuth 密钥

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# ===== 数据库 =====
SQLITE_PATH=./data/jade.db

# ===== 运行时 =====
JADE_RUNTIME=desktop                     # 设为 'desktop' 时切换到单本地用户模式：
                                          # 跳过浏览器指纹与 NextAuth，数据库只有一个 id 为 'local' 的用户

# ===== AI =====
AI_PROVIDER=openai                       # 'openai' 或 'anthropic'
AI_MODEL=gpt-4o                          # 模型标识
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# ===== 国际化 =====
DEFAULT_LOCALE=zh            # 默认语言：'zh' 或 'en'
```

---

## 10. 关键设计决策

### 10.1 为什么选择 Drizzle ORM？

| 对比维度 | Drizzle | Prisma |
|----------|---------|--------|
| 多数据库支持 | 原生支持（pg、sqlite、mysql） | 每种数据库需独立 schema |
| 包体积 | 轻量（~30KB） | 较重（~2MB+ 引擎） |
| 类型安全 | 完整 TypeScript 推导 | 生成类型文件 |
| Schema 定义 | TypeScript 代码 | 自定义 DSL（.prisma） |
| 迁移 | 代码优先，生成 SQL 迁移 | 自有迁移引擎 |
| Edge Runtime | 支持 | 受限 |

Drizzle 允许在 TypeScript 中一次定义 Schema，并保留了未来切换到其它数据库适配器的可能性，同时对当前 SQLite-only 的桌面客户端定位保持轻量。

### 10.2 为什么选择 Zustand？

- 极少样板代码，不需要 Provider
- 内置计算值和订阅支持
- 便于按职责拆分多个 Store
- 出色的 TypeScript 支持
- 中间件支持（persist、devtools、immer）

### 10.3 为什么选择 dnd-kit？

- 一流的无障碍支持（键盘操作、屏幕阅读器）
- 精细的拖拽行为控制
- 支持嵌套 SortableContext（模块内排序）
- 轻量且支持 tree-shaking
- 维护活跃

### 10.4 模块内容使用 JSONB

将模块内容存储为 JSONB（而非为每种模块类型建独立表）的优势：

- **灵活性**：新增模块类型无需数据库迁移
- **性能**：单次查询即可获取完整模块内容
- **简洁**：模块内容自包含
- **权衡**：不便于字段级查询，但简历模块始终整体加载

### 10.5 为什么选择 next-intl？

- Next.js App Router 原生支持，Server Components 完整兼容
- 基于路由前缀 (`/zh/`, `/en/`) 的语言切换，SEO 友好
- TypeScript 类型安全
- 轻量，无额外运行时依赖
- 活跃维护，社区生态完善

---

## 11. 开发流程

```bash
# 1. 安装依赖
pnpm install

# 2. 配置环境变量
cp .env.example .env.local
# 编辑 .env.local 填入实际值

# 3. 初始化数据库
pnpm db:generate   # 从 schema 生成迁移文件
pnpm db:migrate    # 执行迁移

# 4. 启动开发服务器
pnpm dev

# 5. 其他命令
pnpm build         # 生产构建
pnpm lint          # ESLint 检查
pnpm type-check    # TypeScript 类型检查
pnpm db:studio     # 打开 Drizzle Studio（数据库 GUI）
```

### 11.1 `package.json` Scripts

```json
{
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "type-check": "tsc --noEmit",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:studio": "drizzle-kit studio",
    "db:seed": "tsx src/lib/db/seed.ts"
  }
}
```
