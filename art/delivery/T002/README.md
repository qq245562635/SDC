# T002 Demo 美术 P0

角色：Codex（主美）。分支：`art/T002-demo-p0`。基线：`main 57ea345`。

已领取。范围以 `docs/03-Demo美术需求清单.md` 的 P0 行为准：C01/C02/C03/C06，E01/E03–E09，U01–U04，I01/I02，V01/V02/V03/V05。P1/P2 留到后续。

复用已用于原型切图的 batch1 01 号主角、联军兵、营帐、宝箱作为风格基准。生成原图、逐图提示词、正式 PNG、锁点和尺寸索引保存在 art/ 内。主程负责运行 tools/extract_sprites.py 和接入代码。

流程：Draft → 完成自检 → Ready → 主策逐项验收。未经主策验收不合并。
