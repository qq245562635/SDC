# T004 角色拆件与地面分层

分支 `art/T004-rig-parts`，PR #5。按主策[评论 6656771262](https://github.com/qq245562635/SDC/pull/5#issuecomment-6656771262)改为“底图＋透明贴花”，等待视觉复审和主程运行时确认，保持 Draft。

## 最新地面交付

- `art/env/env_ground_base_01.png` 至 `04.png`：4 张 **128×128** 素净干土底图，原生显示比例 1；灰褐色手绘土纹，不含草、石、车辙等主题图案，四种任意混铺。
- `art/env/env_decal_<category>_01.png / _02.png`：grass、stone、rut、footprint、mud、crack、ink 七类，各 2 个变体，共 **14 张透明贴花**。不规则软边，无方形土底。图像内保留原设计的局部碎石/草屑等细节。
- 旧的 `env_camp_tile01_01.png` 至 `env_camp_tile16_01.png` 完整保留为 4802d15 版本，供主程显式切换；此前整砖预览为已退回方案，不作为当前交付。
- [1280×720 房间预览](qa/ground_layered_room_1280x720.png)：素土混铺后，自由坐标随机散布 **40 个贴花**，不依赖格子中心；布局记录见 `qa/ground_layered_layout.json`。
- [纯底图铺开](qa/ground_bases_room.png)、[14 张贴花预览](qa/ground_decal_contact.png)、[本地预览页](preview.html)。

## 地面接入（主程）

元数据仍在 `assets.json` 的 `assets` 数组；`ground_surface` 给出新旧地面用途与文件列表。新资源 `display_scale=1`，不要套用角色的 0.5。
`role=ground_base` 用于连续铺地；`role=ground_decal` 用于独立地面物件，按 `origin_normalized` 定位。贴花的位置采用世界坐标，**禁止按格子中心摆放**。

每张贴花都含 `rotation_allowed`、`rotation_mode`、`allowed_rotation_degrees`、`scale_range`：
- grass、stone：none，保持原方向，以免草倒置、石头光源翻转。
- rut：discrete，允许 0° / 180° 两个方向。
- footprint、mud、crack、ink：free，允许 0°–360°。
- 缩放范围 0.75–1.25；`z=0` 为地面平面痕迹，`z=1` 为草、石；同层可按世界 y 排序。

当前仓库的旧同步入口若仍仅读取 T002 清单，需要主程将 T004 新资源纳入同步，并保留旋转字段供摆放逻辑读取。主美未修改 `tools/` 或游戏代码。新资源以 T004 清单为准。

四底图的 16 个有序组合已核对水平/垂直接边一致；底图外 8px 环与内 112×112 平均亮度最大相差约 0.30%（全像素、Rec.709 RGB 加权），不是整砖图案的筛选测量。数值见 `qa/ground_layered_validation.json`。
房间图只验证美术数据组合，尚不代表游戏内接入通过。

## 保持不变的角色交付

C01 主角 8 件、C02 联军兵三色各 7 件、C03 弓手 8 件，共 37 件 PNG 和关节记录保持 cbc868f 原样；主策已接受朝右 3/4 视角。未改 idle 参考图。
角色使用 `part / joint_pivot / attach / hand / grip / z`，坐标为最终 PNG 内像素，显示比例 0.5；远侧为 l，近侧为 r。
身体 attach 对齐子件 joint_pivot，武器 grip 对齐近侧手臂 hand；`rigs` 提供身体和背饰的落脚偏移。详见既有 `processing/verify_assembly.py` 及 [拼装图](qa/rig_complete_comparison.png)、[摆动/镜像](qa/rig_joint_stress.png)。
角色高度、轮廓和握点的既有自检记录保留；运行时 `rig.html` 仍由主程确认。

## 原画及复核

本轮使用内置 image_gen，18 条完整提示词在 `prompts/ground_layers/`，对应原画在 `sources/ground_layers/`。
从仓库根目录运行 `python art/delivery/T004/processing/build_ground_layers.py` 可重建新地面、清单及 40 贴花房间预览（固定种子 40043）。
旧的 `processing/rebuild_ground.py` 已停用，避免误导出已退回的整砖方案。
