# T004 侧身拆件与地砖返工

分支 `art/T004-rig-parts`，PR #5。角色拆件已获主策预审认可；地砖按评论 6655930274 二次返工，等待复审及主程确认 `rig.html`，此前保持 Draft。

## 交付

- C01 主角 8 件、C02 联军兵三色各 7 件、C03 弓手 8 件，共 37 件透明 PNG。朝右 3/4 视角（主策预审接受），朝左整体镜像。未修改 idle 参考图。
- 完整重绘各部件并补绘被遮挡的肩、髋覆盖区；主角箱体为侧背，去掉多余圆环。
- E01 共 16 块 256×256 地砖：重新生成整幅细土纹，移除旧版小块镜像拼贴和蜂窝边框。共享 24px 边带；草、石、车辙和泥坑绘面缩为 0.52 倍并错位，避免整块中心形成暗斑。
- [预览](preview.html)、[元数据](assets.json)、[拼装对照](qa/rig_complete_comparison.png)、[关节摆动与镜像](qa/rig_joint_stress.png)、[4×4 地面](qa/ground_4x4.png)、[8×8 随机混铺](qa/ground_8x8_random.png)、[cbc868f 与新版对比](qa/ground_before_after_grain.png)。

## 主程接入

`assets.json` 的 `assets` 为资产数组，字段按 T006：`part / joint_pivot / attach / hand / grip / z`。
坐标全部为导出 PNG 内的像素，显示比例 0.5；禁止再从通用模板推算。身体 `attach` 含 neck、shoulder_l/r、hip_l/r，手臂含 hand，武器含 grip。
`arm_l / leg_l` 是远侧，`arm_r / leg_r` 是近侧，`z` 按任务顺序为 0–7。

`rigs` 给出角色文件集合、原 idle、脚底参考点和 `body_rest_position`。后者是身体关节相对脚底的偏移；背饰用自身 `rest_position` 相对身体定位。
其他子件：身体 attach 对齐子件 joint_pivot；武器 grip 对齐近侧手臂 hand，随手臂旋转。详见独立拼装脚本 `processing/verify_assembly.py`。
重绘来源和裁切、缩放、配准过程保存在 `sources/`、`prompts/` 和 `processing/`；引擎直接读取最终 PNG 的 `joint_pivot`。

同步更新 T002 清单中相同文件的尺寸和哈希，供旧读取路径使用。T002 原 QA 图片与报告是当时交付快照；本次以 T004 QA 为准。

## 已验证与待验收

独立脚本只读最终 PNG 和 JSON 拼装，无手调偏移。源图高度：主角 276px、联军兵 273px、弓手 276px，与各自 idle 完全一致。
在 0.5 显示比例下，alpha>24 的双向边界最大距离（含内缘；idle 只取主体连通域，排除墨点）：
主角 9.85px；蓝兵 9.55px；黄兵 9.51px；红兵 9.01px；弓手 10.00px，均 ≤10px。

7 个角度（−20° 至 +20°）手臂 hand 与武器 grip 的数学对齐误差 <1e−8 源像素。
附 0°、±15°、镜像预览。此项只验证数据及有限角度的拼装，不代表游戏内动画通过。
16×16 个有序地砖组合的水平/垂直接边及 24px 同侧边带一致性已检查。

二次返工的亮度检查按全部像素计算，包含草、石、车辙及泥坑，不再筛选裸土：外侧 24px 环为边缘，其余 208×208 为中心；平均亮度采用 Rec.709 RGB 加权值。差值公式 abs(中心均值−边缘均值)/边缘均值，16 张最大 4.1024%，均 ≤5%。报告见 `qa/ground_validation.json`。

8×8 混铺使用固定种子 40042，16 个品种各出现 4 次后随机打乱，坐标表见 `qa/ground_8x8_layout.json`。已目视检查相框状网格和蜂窝边带；最终视觉验收由主策确认。

本轮使用内置 image_gen，提示词为 `prompts/ground_revision2_atlas.json`、`prompts/ground_revision2_soil.json`；最终消费文件仍在 `art/env/env_camp_tile01_01.png` 至 `env_camp_tile16_01.png`。

待主程按 T006 数据约定接入后，在 PR 确认 `rig.html` 无需手调并检查实际握持、遮挡，再交主策验收。尚未标记运行时验收通过。
