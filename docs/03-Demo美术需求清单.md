# 《逃离三国》Demo 美术需求清单

Nov 5, 2026 · @Aoi Ueda

Demo 范围：虎牢关第一、二阶段加 Boss 房、庄园 2 级、主界面和局内 HUD。共约 60 项资源，分三批交付。风格对比和场景布局先在[场景预览](../prototype/hulao-camp.html)里试玩，清单按风格 A 写。

## 1. 风格与交付规范

已定风格 A「水墨粗线卡通」（2026-11-05 确认）：深褐粗墨线、平涂加一档硬阴影、宣纸纹理。它在俯视角下最好读，AI 出图最容易统一，也最适合切片骨骼动画。风格 B 的夜战火光可以作为单独的“夜间战役”光照叠在 A 上，不需要重画素材。

| 项 | 规范 |
| --- | --- |
| 视角 | 斜 45 度三分之四俯视，光源固定左上 |
| 描边 | 深褐 #2B1D16，按 1080p 显示尺寸 3 到 4 像素（原图 2 倍就是 6 到 8 像素） |
| 角色显示高度 | 主角 140 像素，普通兵 140，精英 170，吕布 280 |
| 原图倍率 | 一律按显示尺寸 2 倍绘制 |
| 格式 | PNG，透明背景，sRGB；场景大图可用 JPG |
| 锁点 | 角色和物件的锁点放在脚底中心（用于 Y 轴排序） |
| 角色拆件 | 头、身体、左右臂、左右腿、武器、背饰各一张，重叠处多画 10 像素 |
| 命名 | 类别\_名称\_部件\_序号，例如 char\_hero\_head\_01.png |
| 目录 | art/char、art/env、art/prop、art/ui、art/icon、art/vfx |
| 色板 | 阵营色曹蓝 #2F5D8A、袁黄 #C9A23A、孙红 #B03A2E；时空青 #3EC6E0；修正力紫 #8E44AD |

## 2. 角色资源

| 编号 | 资源 | 内容 | 动作 / 差分 | 优先级 | 提示词 |
| --- | --- | --- | --- | --- | --- |
| C01 | 主角外卖骑手 | 三视图 + 拆件图 | 待机、跑、三段刀连招、重击、翻滚、搜刮、受击、倒地 | P0 | 总案 01 / 02 / 03 |
| C02 | 联军兵 | 一套造型，换色出曹、袁、孙三版 | 待机、走、前摇、刺击、受击、倒地 | P0 | D01 |
| C03 | 散兵弓手 | 一套造型 | 待机、走、拉弓、受击、倒地 | P0 | D02 |
| C04 | 西凉铁骑 | 骑兵整体一张 + 马、人拆件 | 待机、冲锋、撞墙眩晕、倒地 | P1 | D03 |
| C05 | 敌对穿越者 | 主角体型，换一套现代服装（快递员蓝外套） | 复用主角动作 | P1 | D04 |
| C06 | 吕布 | 三视图 + 拆件，步战和骑战两版 | 横扫、突刺、冲阵、回马戟、人中吕布、召唤、破阵、倒地 | P0 | 总案 06 |
| C07 | 赤兔 | 单独的马，可以被主角骑 | 待机、跑 | P1 | D05 |
| C08 | 貂蝉 | 局内精灵拆件 + 半身立绘 | 待机、跑、闭月舞、倒下；立绘 4 个表情差分 | P1 | D06 |
| C09 | 时空守卫 | 一套造型 | 待机、瞬移、斩击、倒地 | P1 | 总案 05 |
| C10 | 庄园 NPC | 铁匠、商人各一 | 仅待机 | P2 | D07 |

动作按切片骨骼在 Godot 里做，美术只交拆件和关键姿势参考，不需要逐帧画。先做左右两个朝向，镜像复用。

## 3. 场景与物件

场景预览里出现的每个物件都在这张表里，按预览的位置和比例替换即可。

| 编号 | 资源 | 规格（显示尺寸） | 变体 | 优先级 | 提示词 |
| --- | --- | --- | --- | --- | --- |
| E01 | 营地地砖集 | 128×128 无缝，干土、草地、车辙印、泥坑 | 16 块 | P0 | D08 |
| E02 | 关前战场地砖集 | 128×128，焦土、碎石、血迹淡化为暗褐色 | 16 块 | P1 | D09 |
| E03 | 木栅栏 | 单根 28×90，横栏、转角、开口 | 6 种 | P0 | D10 |
| E04 | 营帐 | 160×150，带门帘和阵营色边（游戏内按 1.5 倍显示，约 240×225） | 曹、袁、孙 3 色 + 破损版 | P0 | D11 |
| E05 | 帅旗 | 70×180，旗面可飘动（单独一层） | 曹、袁、孙 + 无字 | P0 | D12 |
| E06 | 辎重车 | 140×90，车上粮袋 | 满载、空载、翻倒 | P0 | D13 |
| E07 | 火盆 | 40×60，火焰用特效做 | 1 | P0 | D14 |
| E08 | 宝箱 | 44×36，关闭和打开两态（游戏内按 1.5 倍显示，约 66×54） | 木箱、铜箱、老宝箱三档 | P0 | D15 |
| E09 | 时空锚点 | 地面法阵 160×64 + 光柱 | 1 | P0 | D16 |
| E10 | 小物件包 | 石头、折断的枪、箭靶、水缸、兵器架、稻草堆 | 各 2 到 3 个 | P1 | D17 |
| E11 | 虎牢关关墙 | 分段素材，墙体高 192，含关门和箭楼 | 1 套 | P1 | D18 |
| E12 | 吕布 Boss 房 | 1920×1080 整图背景，地上有可撞的柱子 | 1 | P1 | D19 |
| E13 | 庄园 1 级和 2 级 | 整图 1920×1080 + 建筑单体（库房、铁匠铺、时空裂隙） | 2 张整图 + 6 栋单体 | P1 | 总案 09 / 10 |

## 4. UI、图标与特效

| 编号 | 资源 | 内容 | 优先级 | 提示词 |
| --- | --- | --- | --- | --- |
| U01 | 局内 HUD | 生命条、翻滚充能点、连击数、历史修正力条（含 25 / 50 / 75 刻度）、道具栏 | P0 | 总案 14 |
| U02 | 外卖箱背包面板 | 一格一件的网格背包（参考逃离鸭科夫），1/2/3 级背包图标，护心镜 2 格，宝驹 2–6 格，品质边框 6 色，物品信息栏 | P0 | D20 |
| U03 | 将魂三选一卡 | 卡面框、派系印章（先做蜀·五虎）、品级边框 3 档 | P0 | D21 |
| U04 | 房间门奖励图标 | 将魂、物资、危险、商人、历史节点、暗室，共 6 个 | P0 | D22 |
| U05 | 结算界面 | 撤离成功 / 阵亡两版，带印章和竹简框 | P1 | D23 |
| U06 | 主界面与 Logo | 《逃离三国》书法字 Logo、标题背景用宣传主视觉 | P1 | 总案 15 |
| I01 | 物品图标 | 首批 16 个，128×128 | P0 | 总案 13 |
| I02 | 现代道具图标 | 强光手电、防狼喷雾、鞭炮、望远镜、充电宝，带青色微光 | P0 | D24 |
| I03 | 将魂图标 | 蜀·五虎 10 个，圆形印章风 | P1 | D25 |
| V01 | 攻击刀光 | 三段各一张，第三段金色；墨迹飞溅 | P0 | D26 |
| V02 | 受击与破阵 | 墨滴溅射、“破”字印章 | P0 | D26 |
| V03 | 火焰 | 火盆和火墙共用，8 帧循环 | P0 | D26 |
| V04 | 时空特效 | 锚点光柱、裂纹、时空守卫瞬移 | P1 | D26 |
| V05 | 宝箱出货 | 按品质变色的光柱，红色传说有额外粒子 | P0 | D26 |

特效尽量用 Godot 粒子加少量贴图实现，AI 只出贴图（墨点、火苗、光斑、印章字）。

## 5. 分批交付

每批交完就替换进场景预览看效果，定了再进下一批，避免整批返工。

1. **第一批：定风格**。C01 主角三视图、C02 联军兵、E04 营帐、E08 宝箱、总案 15 宣传主视觉。目标是定线条、配色和比例，定下后把这 5 张作为后续所有提示词的参考图。
2. **第二批：营地可玩**。剩余所有 P0：主角拆件和动作参考、弓手、吕布、地砖、栅栏、帅旗、车、火盆、锚点、HUD、背包、将魂卡、图标、基础特效。完成后营地和吕布战都能用正式美术试玩。
3. **第三批：完整 Demo**。所有 P1：铁骑、赤兔、貂蝉、时空守卫、关墙、Boss 房、庄园、结算和主界面。P2 留到 Demo 之后。

## 6. 给 Codex 的提示词

每条前面拼上[总策划案](01-总策划案.md)里的 STYLE 段落和交付说明；第一批定稿后，再附上定稿图作参考。「总案 xx」指总策划案里的编号。

| 编号 | 对应 | 英文提示词（接在 STYLE 后） |
| --- | --- | --- |
| D01 | 联军兵 | Late Han dynasty coalition foot soldier, conical iron helmet, lamellar vest over tunic in faction color, holding a long spear, sturdy chibi build, turnaround front side back plus body parts laid out separately, three color variants blue yellow red, transparent background |
| D02 | 散兵弓手 | Light-armored Han archer, cloth headwrap, quiver on back, longbow, lean build, drawing-bow pose and idle pose, body parts laid out separately, transparent background |
| D03 | 西凉铁骑 | Heavy northwestern cavalryman on an armored brown horse, fur-trimmed helmet, lance, charging pose and idle pose, horse and rider as separate parts, top-down 3/4 view, transparent background |
| D04 | 敌对穿越者 | Rival modern time traveler, blue courier jacket with reflective stripes over improvised ancient armor, cyan wrist device, baseball cap, short sword, same proportions as the hero, transparent background |
| D05 | 赤兔 | Legendary red warhorse, glossy crimson coat, flowing dark mane, ornate Han saddle, proud stance, idle and gallop poses, top-down 3/4 view, transparent background |
| D06 | 貂蝉 | Original Late Han dancer heroine, modest layered quju robe in moon-white and deep red, crescent jade hairpin, holding a round silk fan, graceful and clever expression; half-body portrait 2:3 plus small chibi in-game sprite parts, tasteful, all-ages |
| D07 | 庄园 NPC | Two farmstead NPCs: burly blacksmith with leather apron and hammer, cheerful traveling merchant with a backpack of goods, idle poses, transparent background |
| D08 | 营地地砖 | Seamless 128x128 tileset for an ancient army camp ground: packed dirt, grass patches, wheel ruts, mud puddles, footprints, 16 tiles on a 4x4 grid, top-down |
| D09 | 战场地砖 | Seamless 128x128 tileset for a battlefield before a mountain pass: scorched earth, gravel, broken arrows, dark stains, trampled grass, 16 tiles on a 4x4 grid, top-down |
| D10 | 栅栏 | Wooden palisade pieces for a top-down 3/4 view: single sharpened log stake, horizontal rail section, corner piece, gate opening, damaged section, laid out separately, transparent background |
| D11 | 营帐 | Ancient Chinese army pyramid tent, canvas with a colored trim band, open door flap, small pennant on top, plus a torn damaged version, three trim colors blue yellow red, top-down 3/4 view, transparent background |
| D12 | 帅旗 | Tall war banner on a wooden pole, rectangular cloth flag with a blank center for a family name, flag and pole as separate layers, blue yellow red and blank variants, transparent background |
| D13 | 辎重车 | Wooden two-wheeled supply cart loaded with grain sacks, plus empty and overturned versions, top-down 3/4 view, transparent background |
| D14 | 火盆 | Iron tripod brazier with a shallow bowl, no fire, top-down 3/4 view, transparent background |
| D15 | 宝箱 | Three tiers of loot chests: plain wooden crate, bronze-banded chest, ornate lacquered treasure chest, each closed and open, top-down 3/4 view, transparent background |
| D16 | 时空锚点 | Ancient stone ring on the ground carved with runes, glowing cyan energy lines, a soft vertical beam of cyan light, sci-fi meets ancient China, top-down 3/4 view, transparent background |
| D17 | 小物件包 | Prop sheet: rocks, broken spears, straw archery target, water jar, weapon rack with halberds, straw pile, sandbags, laid out on a grid, top-down 3/4 view, transparent background |
| D18 | 关墙 | Modular fortress wall pieces of a Han dynasty mountain pass: rammed-earth wall segment, gate with heavy wooden doors, archer tower, wall end cap, top-down 3/4 view, transparent background |
| D19 | 吕布 Boss 房 | Top-down 3/4 view arena inside an enemy war camp before a fortress gate: open dirt square, four thick wooden pillars, war drums, banners, braziers, 16:9 game background without characters or UI |
| D20 | 背包面板 | Grid inventory UI panel styled as an opened square delivery box with an ancient twist: bamboo-slip grid cells, a small 2x2 bronze-mirror safe slot, six rarity border styles white green blue purple gold red, no text |
| D21 | 将魂卡 | Card frame for a roguelike upgrade choice: vertical bamboo-slip card, red seal stamp at the top for the faction, ink brush border, three rarity frames common rare epic, no text |
| D22 | 房间门图标 | Six round seal-style icons for room rewards: general's spirit, supplies crate, danger skull, merchant coin, history scroll, hidden door, ink style, transparent background |
| D23 | 结算界面 | Run result screen layout on a bamboo-slip scroll: large seal stamp area, loot list area, value total area, two moods success in warm gold and defeat in grey ink, no text |
| D24 | 现代道具图标 | Five icons 128x128: flashlight, pepper spray can, string of firecrackers, binoculars, power bank, drawn in the same ink style with a faint cyan glow, transparent background |
| D25 | 将魂图标 | Ten round seal-style ability icons for the Shu five tigers: green dragon blade slash, wine cup, spear charge through enemies, brave heart, roaring warrior, shield of many, arrow through willow leaf, old general, charging horse, western cavalry, ink style, transparent background |
| D26 | 特效贴图 | VFX texture sheet on black: ink splashes, ink droplets, brush slash arcs in white and gold, flame tongues 8-frame loop, soft light glows, a red seal stamp with the character 破, cyan crack lines, rarity light pillars |
