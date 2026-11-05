# codex-mcp

把 `codex exec` 包成 MCP 工具，让主程在 Claude Code 里派一次性小图给 Codex。新版 Codex CLI 已没有 `mcp-server` 子命令，所以自己包一层。零依赖。

用法规则见 `AGENTS.md`“对接主美”。

## 安装

```sh
npm i -g @openai/codex   # 并用 codex login 登录
claude mcp add codex -- node <仓库绝对路径>/tools/codex-mcp/server.js
```

重开 Claude Code 会话后可用工具 `mcp__codex__codex`。

可选环境变量 `CODEX_JS`：指定 `@openai/codex/bin/codex.js` 路径；默认找 npm 全局目录，找不到就调 PATH 里的 `codex`。

## 参数

| 参数 | 说明 |
| --- | --- |
| `prompt` | 必填，给 Codex 的完整指令（出图要写尺寸、透明底、保存路径；按规范拼 STYLE） |
| `cwd` | 工作目录，默认项目根 |
| `sandbox` | `read-only` / `workspace-write`（默认） |
| `timeout_sec` | 默认 900 |

每次调用都是全新的 `codex exec`，没有上下文。成功返回 Codex 最终回复；失败 `isError: true` 并附日志末尾。
