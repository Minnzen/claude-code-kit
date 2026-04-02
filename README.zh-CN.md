[English](./README.md) | [中文](./README.zh-CN.md)

# claude-code-kit

一个基于 React 的终端 UI 工具包 (Terminal UI Toolkit)，用于构建功能丰富的 CLI 应用程序。灵感来源于 Claude Code 背后的架构。

使用熟悉的组件模型构建交互式 REPL、选择菜单、流式仪表盘和完整的终端界面 -- React 组件、通过 Yoga 实现的 Flexbox 布局，以及用于输入处理的 Hooks。

## 特性

- **React 组件模型** -- 像构建 Web UI 一样构建终端 UI。组件、Hooks、状态、副作用。
- **Flexbox 布局** -- 纯 TypeScript Yoga 布局引擎，无需原生绑定。
- **零闪烁渲染** -- 差量终端输出，只重写发生变化的区域。
- **丰富的组件库** -- REPL、Select、MultiSelect、PromptInput、Spinner、StreamingText、MessageList 等。
- **命令框架** -- 定义并注册斜杠命令，内置模糊匹配。
- **按键绑定系统** -- 声明式按键绑定，支持用户自定义配置。
- **流式优先** -- 专为实时数据设计：AI 响应、日志追踪、WebSocket 数据流。
- **跨平台** -- 支持 macOS、Linux 和 Windows 终端，兼容主流 ANSI 标准。

## 包结构

| 包名 | 描述 |
|------|------|
| `@claude-code-kit/shared` | Yoga 布局引擎（纯 TS 移植版）、文字测量、ANSI 工具 |
| `@claude-code-kit/ink-renderer` | 终端渲染引擎 -- React reconciler、布局、差量输出、输入处理 |
| `@claude-code-kit/ui` | UI 组件库 -- REPL、Select、Spinner、PromptInput 以及 20+ 个更多组件 |

## 快速开始

```bash
pnpm add @claude-code-kit/ui react
```

或者按需分别安装：

```bash
pnpm add @claude-code-kit/shared @claude-code-kit/ink-renderer @claude-code-kit/ui react
```

### 从源码运行

```bash
git clone https://github.com/Minnzen/claude-code-kit.git
cd claude-code-kit
pnpm install
pnpm build

# 运行交互式 demo
cd examples/hello-world
npx tsx index.tsx
```

### Hello World

```tsx
import { render, Box, Text } from "@claude-code-kit/ink-renderer";

function App() {
  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="green">Hello from claude-code-kit!</Text>
      <Text>Build terminal UIs like React apps.</Text>
    </Box>
  );
}

await render(<App />);
```

## 组件

### 渲染原语 (`@claude-code-kit/ink-renderer`)

| 组件 | 描述 |
|------|------|
| `Box` | 带 padding、margin、边框的 Flexbox 容器 |
| `Text` | 支持颜色、加粗、暗色、下划线、删除线的样式文本 |
| `Spacer` | 填充剩余空间的弹性间距 |
| `Newline` | 显式换行 |
| `Link` | 可点击的终端超链接 |
| `Button` | 支持点击处理的可聚焦按钮 |
| `ScrollBox` | 带 ref 控制的可滚动内容区域 |
| `AlternateScreen` | 切换到终端备用缓冲区 |
| `RawAnsi` | 渲染预格式化的 ANSI 转义序列 |
| `ErrorOverview` | 带堆栈跟踪的格式化错误显示 |

### UI 组件 (`@claude-code-kit/ui`)

| 组件 | 描述 |
|------|------|
| `REPL` | 完整的读取-求值-打印循环，支持消息历史、流式输出、斜杠命令 |
| `Select` | 带键盘导航和描述的单选选择器 |
| `MultiSelect` | 支持切换和确认的多选选择器 |
| `PromptInput` | 带历史记录、多行输入和补全的文本输入框 |
| `MessageList` | 可滚动的消息列表（支持 user/assistant/system 角色） |
| `StreamingText` | 逐字符渐进式文本显示 |
| `Spinner` | 带动词轮播和计时的动画加载指示器 |
| `ProgressBar` | 支持自定义填充和颜色的可视化进度条 |
| `StatusLine` | 带弹性分段的底部状态栏 |
| `StatusIcon` | 成功/警告/错误状态图标 |
| `Divider` | 带可选标题和颜色的水平分隔线 |
| `Markdown` | 终端 Markdown 渲染（加粗、代码、列表、标题） |
| `MarkdownTable` | 从 Markdown 渲染格式化表格 |

### 设计系统 (`@claude-code-kit/ui`)

| 组件 | 描述 |
|------|------|
| `ThemeProvider` | 用于一致样式的主题上下文 |
| `ThemedBox` / `ThemedText` | 主题感知的布局和文本 |
| `Dialog` | 模态对话框浮层 |
| `FuzzyPicker` | 模糊搜索选择器 |
| `Tabs` | 标签页导航 |
| `Pane` | 带标题的面板容器 |
| `ListItem` | 样式化列表行 |
| `LoadingState` | 加载占位符 |
| `KeyboardShortcutHint` | 内联快捷键提示 |

### Hooks

| Hook | 描述 |
|------|------|
| `useInput` | 原始键盘输入处理 |
| `useApp` | 应用生命周期（退出、stdin） |
| `useKeybinding` | 声明式按键绑定注册 |
| `useTerminalSize` | 响应式终端尺寸 |
| `useDoublePress` | 双击手势检测 |
| `useInterval` / `useAnimationTimer` | 定时更新 |
| `useAnimationFrame` | 帧同步动画 |
| `useTerminalTitle` | 设置终端窗口标题 |
| `useSelection` | 文本选择状态 |
| `useSearchHighlight` | 搜索匹配高亮 |

## 使用示例

### 交互式 REPL

```tsx
import { render, Box } from "@claude-code-kit/ink-renderer";
import { REPL, type Message } from "@claude-code-kit/ui";
import { useState, useCallback } from "react";

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = useCallback(async (text: string) => {
    setMessages((prev) => [...prev, { id: Date.now().toString(), role: "user", content: text }]);
    setIsLoading(true);

    // 调用 AI API、执行命令等
    const response = await getResponse(text);

    setMessages((prev) => [
      ...prev,
      { id: (Date.now() + 1).toString(), role: "assistant", content: response },
    ]);
    setIsLoading(false);
  }, []);

  return (
    <Box padding={1} flexDirection="column" flexGrow={1}>
      <REPL
        messages={messages}
        onSubmit={handleSubmit}
        isLoading={isLoading}
        commands={[
          { name: "clear", description: "Clear history", onExecute: () => setMessages([]) },
        ]}
        placeholder="Ask anything..."
      />
    </Box>
  );
}

await render(<App />);
```

### 选择菜单

```tsx
import { render, Box, Text, Newline } from "@claude-code-kit/ink-renderer";
import { Select } from "@claude-code-kit/ui";

function App() {
  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>Choose a framework:</Text>
      <Newline />
      <Select
        options={[
          { value: "next", label: "Next.js", description: "Full-stack React framework" },
          { value: "remix", label: "Remix", description: "Web standards focused" },
          { value: "astro", label: "Astro", description: "Content-driven websites" },
        ]}
        defaultValue="next"
        onChange={(value) => console.log("Selected:", value)}
      />
    </Box>
  );
}

await render(<App />);
```

### Spinner 与状态

```tsx
import { render, Box, Text } from "@claude-code-kit/ink-renderer";
import { Spinner, StatusIcon } from "@claude-code-kit/ui";

function App() {
  return (
    <Box flexDirection="column" gap={1} padding={1}>
      <Spinner verb="Installing" label="dependencies" color="cyan" />
      <Spinner verbs={["Thinking", "Analyzing", "Reasoning"]} />
      <Box gap={1}>
        <StatusIcon status="success" />
        <Text color="green">Build completed</Text>
      </Box>
    </Box>
  );
}

await render(<App />);
```

## 灵感来源：Claude Code

本项目的架构灵感来自 [Claude Code](https://claude.ai/code)，Anthropic 的 AI 编程助手。渲染引擎源自 Claude Code 的终端 UI 层，而 Claude Code 本身的思路又建立在 [Ink](https://github.com/vadimdemedes/ink) 之上。

与原版的主要区别：

- **所有 UI 组件均为全新实现** -- REPL、Select、PromptInput、Spinner 以及 `@claude-code-kit/ui` 中的其他组件均从零开始构建，专为本工具包打造，并非从 Claude Code 中提取。
- **渲染引擎 (`@claude-code-kit/ink-renderer`) 提取自** Claude Code 的源码，并为独立使用进行了适配，包括 React reconciler、Yoga 布局集成和终端输出差量算法。
- **Yoga 布局引擎 (`@claude-code-kit/shared`) 是纯 TypeScript 移植版** -- 无原生绑定，无 WASM，Node.js 能运行的地方都能用。

这是一个独立的社区项目，与 Anthropic 没有关联，也未获得 Anthropic 的背书。

## 开发

```bash
# 安装依赖
pnpm install

# 构建所有包
pnpm build

# 运行 demo
cd examples/hello-world
npx tsx index.tsx
```

本项目使用 [Turborepo](https://turbo.build) 进行构建，使用 [pnpm workspaces](https://pnpm.io/workspaces) 管理包。

## 许可证

MIT
