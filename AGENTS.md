# AGENTS.md

给 Codex 等编码代理的说明。

## 先读

1. `README.md`：项目概况和已定决策。
2. `docs/02-系统详细策划案-v0.1.md`：写代码时以这里的规格和数值为准。
3. `docs/03-Demo美术需求清单.md`：出图时以这里的资源表、尺寸和命名为准。

## 出图任务

- 每条提示词前拼接 `docs/01-总策划案.md` 里“风格总纲 STYLE”段落。
- 输出 PNG 透明背景（场景大图除外），按 `类别_名称_部件_序号.png` 命名。
- 放在 `art/` 下对应目录：`art/char`、`art/env`、`art/prop`、`art/ui`、`art/icon`、`art/vfx`；定画风阶段的图放 `art/concept/batch1/`。
- 不要模仿任何已有游戏、动画或画师的角色和风格，不要出现文字、水印、Logo。
- 当前要做的是 `art/prompts/batch1-定画风.md`。

## 代码任务

- 引擎 Godot 4，GDScript。
- 先按 `docs/02-系统详细策划案-v0.1.md` 第 9 节的 MVP 清单实现，用灰盒子占位美术。
- `prototype/hulao-camp.html` 是布局和手感参考，不是正式代码。
