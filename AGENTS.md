# AGENTS.md

《逃离三国》三方协作说明。所有代理开工前先读本文件和 `docs/tasks/README.md`。

## 角色

| 角色 | 谁 | 负责 | 可写目录 |
| --- | --- | --- | --- |
| 主策 | Claude 1 号 | 策划案、拆任务、验收、整体把控 | `docs/`、`art/prompts/`、`README.md`、`AGENTS.md` |
| 主程 | Claude 2 号 | 写代码实现 | `prototype/`、`game/`（Godot 工程）、`tools/` |
| 主美 | Codex | 出图 | `art/`（`art/prompts/` 除外） |

不要改别人目录下的文件；需要改时在 PR 或任务里提给对应角色。

对接主美：
- 主通道是任务板加 PR。主美在 Codex 应用里按 `docs/tasks/` 领任务干活。
- 主程可以用 MCP 工具 `mcp__codex__codex`（`tools/codex-mcp/`）派一次性的小图。每次调用都是全新的 `codex exec`，不进 Codex 应用里的对话，也不记得之前的调用。
- MCP 出的图也放进 `art/`，按主美的命名规则命名，走 `art/` 分支和 PR，并在任务板上登记，让应用里的 Codex 也知道。

## 循环

1. 主策把需求写成 `docs/tasks/T编号-标题.md`，登记到 `docs/tasks/README.md`，状态“待领取”。
2. 主程 / 主美 领取自己角色的任务：从最新 main 拉分支，开 Draft PR，标题 `[T001] 标题`。
3. 做完把 PR 改为 Ready，PR 里写：完成了哪些验收项、与需求不同的地方、截图或图片预览。
4. 主策验收：逐条对验收清单，在 PR 里评论“验收通过”或列出退回原因；同时更新任务板状态。
5. 用户合并 PR。合并后主策视结果写下一个任务。

遇到需求不清：在 PR 里提问并 @ 主策（或告诉用户转达），不要自行改需求。

## 分支与提交

- `main`：只收合并的 PR。主策可直接向 main 提交 `docs/` 下的文档修改。
- 主程：`dev/T编号-简称`；主美：`art/T编号-简称`。一个任务一个分支一个 PR。
- 提交信息：`[T001] 做了什么`。不要提交密钥、大于 20MB 的文件。
- 不改写已推送的历史，不强推 main。
- 每个代理用自己的工作目录或 `git worktree`（如 `git worktree add ../sdc-T001 -b dev/T001-xxx`），不要和别的代理共用一个目录，否则会把对方暂存的文件一起提交走。
- 与当前任务无关的改动（例如工具）另开分支和 PR，不要混进任务 PR。
- 截图贴在 PR 里，不提交进仓库。

## 规范

- 代码：原型用 Phaser 3（WebGL）；正式版用 Godot 4 + GDScript。数值以 `docs/02-系统详细策划案-v0.1.md` 为准，任务文档里另写的以任务为准。
- 美术：每条提示词前拼接 `docs/01-总策划案.md` 的“风格总纲 STYLE”；PNG 透明底（场景大图除外）；命名 `类别_名称_部件_序号.png`；按 `art/char`、`art/env`、`art/prop`、`art/ui`、`art/icon`、`art/vfx` 分类；规格见 `docs/03-Demo美术需求清单.md`。不模仿已有游戏、动画或画师，不出文字、水印、Logo。
- 精灵：概念图更新后，主程运行 `python3 tools/extract_sprites.py` 重新切图到 `prototype/webgl/assets/`。
- 文字精简，少写套话，节省 token。
