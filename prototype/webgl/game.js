// 《逃离三国》虎牢关 WebGL 玩法原型（Phaser 3）
// 只验证手感和循环：移动 / 三段连击 / 重击 / 翻滚 / 破防 / 搜箱 / 将魂三选一 / 历史修正力 / 锚点撤离。
// 数值来自 docs/02-系统详细策划案-v0.1.md，部分为原型简化。
(() => {
'use strict';

const W = 1280, H = 720;
const ARENA = { l: 80, r: 1200, t: 168, b: 680 };
const FONT = '"Noto Serif SC","Source Han Serif SC","Songti SC","STSong","SimSun","WenQuanYi Zen Hei",serif';
const C = {
  ink: 0x2B1D16, paper: 0xF3E9D2, blue: 0x2F5D8A, yellow: 0xC9A23A, red: 0xB03A2E,
  cyan: 0x3EC6E0, purple: 0x8E44AD, shu: 0x3F7D4E, hp: 0xB03A2E,
};
const hex = n => '#' + n.toString(16).padStart(6, '0');
const R = Phaser.Math;
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// ---------- 正式美术（T002，tools/sync_art.py 生成 assets/art/manifest.js） ----------
// 美术按 1080p 显示尺寸出图，原型画布 720p，统一乘 WS，不单独拉伸。
const ART = window.ART || {};
const WS = W / 1920;
const artScale = key => WS * (ART[key] ? ART[key].d : 1);
// 世界物件：原点用清单里的脚底锚点
function art(scene, x, y, key, k = 1, sprite = false) {
  const m = ART[key];
  return (sprite ? scene.add.sprite(x, y, key) : scene.add.image(x, y, key)).setOrigin(m.o[0], m.o[1]).setScale(artScale(key) * k);
}
// UI：按目标宽度等比缩放，居中
function ui(scene, x, y, key, width) {
  const im = scene.add.image(x, y, key);
  return im.setScale(width / im.width);
}
// 取图片内容区当作一帧，用于九宫格等
function contentFrame(scene, key) {
  const tex = scene.textures.get(key);
  if (!tex.has('c')) { const b = ART[key].b; tex.add('c', 0, b[0], b[1], b[2] - b[0], b[3] - b[1]); }
  return 'c';
}
// 姿势图朝向：除翻滚外都朝右
const POSE_FACE = { hero_roll: -1 };
const RAR_KEY = ['white', 'green', 'blue', 'purple', 'gold', 'red'];
// 原型物品 → I01 图标；对不上的保留色块
const ITEM_ICON = {
  '麦饼': 'loot_rice', '铁箭簇': 'loot_bolts', '竹简': 'loot_bamboo', '铜镜': 'loot_mirror',
  '玉璧': 'loot_jade', '兵书残卷': 'loot_strategy', '金缕玉片': 'loot_gold',
};
// 将魂印章：按武将的兵器
const SOUL_SEAL = { '关羽': 'blade', '赵云': 'spear', '张飞': 'spear', '黄忠': 'bow', '马超': 'spear' };
const DOOR_ICON = { soul: 'door_spirit', chest: 'door_supplies', elite: 'door_danger', heal: 'door_merchant', anchor: 'anchor_ring' };

// ---------- 触屏（T007）：index.html 判定平台，?touch=1 / 0 可强制 ----------
const TOUCH = !!window.TOUCH;
const HOLD_HEAVY = 0.4; // 攻击键按住多久算重击（秒）
const CAN_FULLSCREEN = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);

// 左半屏浮动摇杆 + 右侧按键，支持多点触控。每根手指（pointer.id）各管一个控件。
class TouchPad {
  constructor(scene) {
    this.s = scene;
    this.btns = {};
    this.owner = {};       // pointer.id -> 'stick' 或按键名
    this.stick = null;     // { id, ox, oy, x, y }
    this.mx = 0; this.my = 0; this.moving = false;
    this.atkHeld = false; this.atkT = 0; this.atkHeavy = false;
    const D = 8800;
    this.stickG = scene.add.graphics().setDepth(D);
    const btn = (name, x, y, r, label, icon) => {
      const c = scene.add.container(x, y).setDepth(D);
      c.add(scene.add.circle(0, 0, r, 0x16110d, 0.42));
      c.add(ui(scene, 0, 0, 'hud_slot_frame', r * 2.15).setAlpha(0.8));
      if (icon) c.add(ui(scene, 0, -3, icon, r * 1.15));
      const t = scene.add.text(0, icon ? r * 0.5 : 0, label, { fontFamily: FONT, fontSize: Math.round(r * (icon ? 0.42 : 0.6)) + 'px', color: '#F3E9D2', stroke: '#2B1D16', strokeThickness: 4, fontStyle: 'bold' }).setOrigin(0.5);
      const ring = scene.add.graphics();
      c.add([t, ring]);
      this.btns[name] = { name, x, y, r, c, t, ring };
    };
    // 直径都不小于 64（720p 画面）
    btn('attack', 1160, 600, 60, '攻');
    btn('roll', 1035, 505, 42, '滚');
    btn('search', 1160, 450, 38, '搜');
    btn('torch', 1020, 642, 34, '', 'modern_flashlight');
    btn('roar', 905, 652, 34, '', 'door_spirit');
    btn('bag', 1235, 105, 32, '包');
    btn('pause', 1162, 105, 32, '停');
    if (CAN_FULLSCREEN) btn('full', 1089, 105, 32, '全屏');
    scene.input.on('pointerdown', p => this.down(p));
    scene.input.on('pointermove', p => this.move(p));
    scene.input.on('pointerup', p => this.up(p));
    scene.input.on('pointerupoutside', p => this.up(p));
  }

  blocked() { return this.s.panel || this.s.over; }

  hit(p) {
    for (const b of Object.values(this.btns)) {
      if (b.c.visible && Math.hypot(p.x - b.x, p.y - b.y) <= b.r + 10) return b.name;
    }
    return null;
  }

  down(p) {
    if (this.blocked()) return;
    const s = this.s, name = this.hit(p);
    if (name) {
      this.owner[p.id] = name;
      this.flash(name);
      if (name === 'attack') { this.atkHeld = true; this.atkT = 0; this.atkHeavy = false; }
      else if (name === 'roll') s.tryDodge(this.mx, this.my, this.moving);
      else if (name === 'search') s.tryOpenChest();
      else if (name === 'torch') s.useTorch();
      else if (name === 'roar') s.roar();
      else if (name === 'bag') s.toggleBag();
      else if (name === 'pause') s.togglePause();
      return;
    }
    if (p.x < W / 2 && !this.stick) {
      this.stick = { id: p.id, ox: p.x, oy: p.y, x: p.x, y: p.y };
      this.owner[p.id] = 'stick';
    }
  }

  move(p) {
    const st = this.stick;
    if (!st || st.id !== p.id) return;
    st.x = p.x; st.y = p.y;
  }

  up(p) {
    const what = this.owner[p.id];
    delete this.owner[p.id];
    if (what === 'stick') this.stick = null;
    if (what === 'attack') {
      // 没到重击时间就是点按：出一下连击；到了时间的重击/蓄力在 update 里已经处理
      if (this.atkHeld && !this.atkHeavy && !this.blocked()) this.s.tryLight(false);
      this.atkHeld = false;
    }
    if (what === 'full') this.toggleFullscreen(); // 全屏必须在手指抬起时请求
  }

  toggleFullscreen() {
    const sc = this.s.scale;
    if (sc.isFullscreen) { sc.stopFullscreen(); return; }
    sc.startFullscreen();
    if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
  }

  flash(name) {
    const c = this.btns[name].c;
    this.s.tweens.add({ targets: c, scale: 0.9, duration: 60, yoyo: true });
  }

  // 每帧：摇杆向量、长按重击、按键显隐
  update(dt) {
    const s = this.s, h = s.hero;
    if (this.blocked()) { this.stick = null; this.atkHeld = false; this.owner = {}; }
    const st = this.stick, R0 = 70;
    this.mx = 0; this.my = 0; this.moving = false;
    const g = this.stickG; g.clear();
    if (st) {
      let dx = st.x - st.ox, dy = st.y - st.oy;
      const l = Math.hypot(dx, dy);
      if (l > 10) { this.mx = dx / l; this.my = dy / l; this.moving = true; }
      if (l > R0) { dx *= R0 / l; dy *= R0 / l; }
      g.fillStyle(0x16110d, 0.3); g.fillCircle(st.ox, st.oy, R0);
      g.lineStyle(3, 0xF3E9D2, 0.5); g.strokeCircle(st.ox, st.oy, R0);
      g.fillStyle(0xF3E9D2, 0.55); g.fillCircle(st.ox + dx, st.oy + dy, 30);
    }
    if (this.atkHeld && !this.atkHeavy) {
      this.atkT += dt;
      if (this.atkT >= HOLD_HEAVY) { this.atkHeavy = true; s.heavyDown(false); }
    }
    const B = this.btns, hide = !!s.over;
    Object.values(B).forEach(b => b.c.setVisible(!hide));
    const c = s.nearChest();
    B.search.c.setVisible(!hide && !!c && !c.opened);
    B.torch.c.setVisible(!hide && h.torch > 0);
    B.torch.t.setText('×' + h.torch);
    B.roar.c.setVisible(!hide && s.has('hou'));
    // 将魂技冷却圈 = 怒气
    const rg = B.roar.ring; rg.clear();
    rg.lineStyle(4, h.rage >= 100 ? 0xF39C12 : 0x8E5E33, 1);
    rg.beginPath(); rg.arc(0, 0, B.roar.r + 3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * h.rage / 100); rg.strokePath();
    // 攻击键按住时画重击进度
    const ag = B.attack.ring; ag.clear();
    if (this.atkHeld) {
      ag.lineStyle(5, this.atkHeavy ? 0xF1C40F : 0xF3E9D2, 0.9);
      ag.beginPath(); ag.arc(0, 0, B.attack.r + 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, this.atkT / HOLD_HEAVY)); ag.strokePath();
    }
    // 翻滚次数
    B.roll.c.setAlpha(h.dodges > 0 ? 1 : 0.45);
  }
}

// ---------- 数据 ----------
const RAR = [
  { n: '凡', c: 0xD9D9D9, t: 0.5 }, { n: '良', c: 0x6AB04C, t: 1 }, { n: '精', c: 0x3A8DDE, t: 2 },
  { n: '珍', c: 0x9B59B6, t: 3 }, { n: '绝', c: 0xF1C40F, t: 4 }, { n: '传说', c: 0xE74C3C, t: 4 },
];
// 名称, 稀有度, 宽, 高, 价值
const ITEMS = [
  ['半两钱', 0, 1, 1, 10], ['麦饼', 0, 1, 1, 8], ['粗麻布', 0, 1, 2, 14], ['草鞋', 0, 1, 1, 6],
  ['五铢钱串', 1, 1, 1, 30], ['铁箭簇', 1, 1, 1, 25], ['竹简', 1, 1, 2, 45], ['皮护腕', 1, 1, 2, 40],
  ['青铜酒爵', 2, 1, 1, 90], ['漆耳杯', 2, 1, 1, 80], ['铜镜', 2, 2, 2, 140],
  ['玉璧', 3, 2, 2, 320], ['错金带钩', 3, 1, 1, 260], ['兵书残卷', 3, 1, 2, 300],
  ['鎏金博山炉', 4, 2, 2, 720], ['金缕玉片', 4, 1, 2, 680],
  ['方天画戟', 5, 1, 4, 2400],
];
const CHESTS = {
  wood:    { tex: 'chest_wood',    n: 2, w: [55, 33, 10, 2, 0, 0],   name: '木箱' },
  bronze:  { tex: 'chest_bronze',  n: 3, w: [20, 35, 30, 12, 3, 0],  name: '铜箍箱' },
  lacquer: { tex: 'chest_lacquer', n: 4, w: [0, 18, 36, 28, 15, 3],  name: '漆金宝箱' },
};
// 蜀·五虎，效果按 docs/02 第 6 节普通品级。slot：普攻/重击/翻滚/道具/附体各限 1 个，被动不限。
const SOULS = [
  { id: 'qinglong', g: '关羽', n: '青龙斩', ic: '青', slot: '普攻', d: '连击第三段发出\n一道前方刀气，伤害 20' },
  { id: 'wenjiu',   g: '关羽', n: '温酒斩华雄', ic: '酒', slot: '重击', d: '按住重击蓄力\n满 1 秒松开伤害 +80%' },
  { id: 'qijin',    g: '赵云', n: '七进七出', ic: '七', slot: '翻滚', d: '翻滚穿过敌人\n造成 15 伤害' },
  { id: 'dan',      g: '赵云', n: '一身是胆', ic: '胆', slot: '被动', pre: 'qijin', d: '体力低于 40% 时\n翻滚次数 +1' },
  { id: 'hou',      g: '张飞', n: '当阳一吼', ic: '吼', slot: '附体', d: '怒气满时按 Q 大吼\n周围敌人眩晕 2 秒\n架势 -50' },
  { id: 'wanren',   g: '张飞', n: '万人敌', ic: '万', slot: '被动', d: '同时被 3 个以上\n敌人包围时受伤 -20%' },
  { id: 'baibu',    g: '黄忠', n: '百步穿杨', ic: '箭', slot: '道具', d: '使用现代道具后\n自动射出 3 支追踪箭' },
  { id: 'laodang',  g: '黄忠', n: '老当益壮', ic: '老', slot: '被动', d: '此后每进一间营帐\n伤害 +8%' },
  { id: 'chong',    g: '马超', n: '锦马超冲', ic: '马', slot: '翻滚', d: '翻滚距离 +50%\n终点撞飞敌人' },
  { id: 'xiliang',  g: '马超', n: '西凉铁骑', ic: '凉', slot: '被动', pre: 'chong', d: '翻滚后 1 秒内\n下一击必破阵' },
];
// k：相对普通兵（140）的显示倍率，精英 170。铁骑、时空守卫是 P1，暂用联军兵换色放大。
const ENEMY = {
  spear:  { name: '联军兵', hp: 40, dmg: 8, spd: 115, range: 78, windup: 0.45, cd: 1.1, k: 1, r: 20 },
  archer: { name: '弓手', hp: 30, dmg: 6, spd: 105, range: 420, windup: 0.75, cd: 1.9, k: 1, r: 18, skin: 'archer' },
  cav:    { name: '西凉铁骑', hp: 90, dmg: 15, spd: 125, range: 330, windup: 0.8, cd: 2.4, k: 1.21, r: 26, guard: 60, skin: 'soldier_red', elite: true },
  guard:  { name: '时空守卫', hp: 220, dmg: 20, spd: 95, range: 110, windup: 1.0, cd: 2.0, k: 1.25, r: 28, guard: 100, skin: 'soldier_blue', elite: true, tint: 0x7FE3F2 },
};
const CHAR_H = 140 * WS; // 普通角色显示高度
// docs/03：营帐、宝箱在规格基础上整体按 1.5 倍显示
const TENT_K = 1.5, CHEST_K = 1.5;
const DOORS = {
  soul:   { n: '将魂', ic: '魂', c: C.shu },
  chest:  { n: '宝箱', ic: '宝', c: C.yellow },
  heal:   { n: '郎中', ic: '医', c: C.red },
  elite:  { n: '精英', ic: '将', c: C.purple },
  anchor: { n: '撤离', ic: '撤', c: C.cyan },
};
const ROOM_NAMES = ['联军前营', '袁军粮道', '曹营辎重', '孙军营寨', '关前空地', '酸枣会盟台', '汜水关道'];

// ---------- 程序生成的贴图 ----------
function makeTextures(scene) {
  const g = scene.make.graphics({ add: false });
  g.fillStyle(C.ink, 1); g.fillCircle(6, 6, 6); g.generateTexture('ink', 12, 12); g.clear();
  g.fillStyle(0xffffff, 1); g.fillCircle(4, 4, 4); g.generateTexture('dot', 8, 8); g.clear();
  g.destroy();

  // 地面：E01 16 块地砖随机铺（任意两块边缘都能接上）
  const tex = scene.textures.createCanvas('ground', W, H);
  const x = tex.getContext();
  const src = k => scene.textures.get(k).getSourceImage();
  // 每块中间颜色偏深，铺开有格子感：多用最平的 01/04，深色斑块和水坑少放
  const weights = [10, 2, 2, 8, 3, 2, 1, 1, 1, 1, 2, 2, 1, 1, 1, 1];
  const sum = weights.reduce((a, b) => a + b, 0);
  const pickTile = () => { let r = Math.random() * sum; for (let i = 0; i < 16; i++) { r -= weights[i]; if (r < 0) return i; } return 0; };
  const T = 128 * WS;
  for (let ty = 0; ty * T < H; ty++) for (let tx = 0; tx * T < W; tx++) {
    const px = Math.floor(tx * T), py = Math.floor(ty * T);
    x.drawImage(src(`camp_tile${String(pickTile() + 1).padStart(2, '0')}`), px, py, Math.ceil(T) + 1, Math.ceil(T) + 1);
  }
  // 左右、下方栅栏：E03 单根木桩，从上往下画，下面的压住上面的
  const drawArt = (k, cx, by, s = 1) => {
    const m = ART[k], sc = artScale(k) * s, w = m.w * sc, h = m.h * sc;
    x.drawImage(src(k), cx - w * m.o[0], by - h * m.o[1], w, h);
  };
  for (let py = 150; py < H + 40; py += 20) { drawArt('palisade_stake', 30, py); drawArt('palisade_stake', W - 30, py); }
  for (let px = 30; px < W; px += 17) drawArt('palisade_stake', px, H + 34);
  // 顶部遮暗（HUD 背板）
  const top = x.createLinearGradient(0, 0, 0, 80);
  top.addColorStop(0, 'rgba(22,17,13,0.92)'); top.addColorStop(1, 'rgba(22,17,13,0)');
  x.fillStyle = top; x.fillRect(0, 0, W, 80);
  tex.refresh();
}

// ---------- 标题 ----------
class Title extends Phaser.Scene {
  constructor() { super('title'); }
  preload() {
    // 吕布和拆件只在 rig.html 里用
    Object.keys(ART).filter(k => !k.startsWith('lubu_') && !ART[k].p).forEach(k => this.load.image(k, `assets/art/${k}.png`));
    this.load.image('key_art', 'assets/key_art.jpg');
    const bar = this.add.rectangle(W / 2 - 200, H / 2, 0, 8, C.cyan).setOrigin(0, 0.5);
    this.load.on('progress', p => bar.width = 400 * p);
  }
  create() {
    if (!this.textures.exists('ground')) makeTextures(this);
    if (!this.anims.exists('fire')) {
      this.anims.create({ key: 'fire', frames: Array.from({ length: 8 }, (_, i) => ({ key: `fire_frame0${i + 1}` })), frameRate: 8, repeat: -1 });
    }
    const k = this.add.image(W / 2, H / 2, 'key_art');
    k.setScale(Math.max(W / k.width, H / k.height));
    const g = this.add.graphics();
    g.fillGradientStyle(0x16110d, 0x16110d, 0x16110d, 0x16110d, 0, 0, 0.92, 0.92); g.fillRect(0, H * 0.45, W, H * 0.55);
    this.add.text(W / 2, 470, '逃离三国', { fontFamily: FONT, fontSize: '96px', color: '#F3E9D2', stroke: '#2B1D16', strokeThickness: 12, fontStyle: 'bold' }).setOrigin(0.5);
    this.add.text(W / 2, 545, '虎牢关 · WebGL 玩法原型', { fontFamily: FONT, fontSize: '26px', color: '#3EC6E0', stroke: '#2B1D16', strokeThickness: 6 }).setOrigin(0.5);
    const go = this.add.text(W / 2, 610, TOUCH ? '点击开始' : '点击或按 Enter 开始', { fontFamily: FONT, fontSize: '28px', color: '#F3E9D2', stroke: '#2B1D16', strokeThickness: 6 }).setOrigin(0.5);
    this.tweens.add({ targets: go, alpha: 0.35, duration: 700, yoyo: true, repeat: -1 });
    const help = TOUCH ? '左半屏按住拖动 移动　攻：点按连击，按住重击　滚：翻滚　靠近宝箱点“搜”'
      : 'WASD 移动　鼠标瞄准　左键/J 连击　右键/K 重击　空格 翻滚　E 搜箱　F 手电　Tab 背包　Q 大吼';
    this.add.text(W / 2, 672, help, { fontFamily: FONT, fontSize: '18px', color: '#CDB78A' }).setOrigin(0.5);
    const start = () => this.scene.start('run');
    this.input.keyboard.once('keydown-ENTER', start);
    this.input.keyboard.once('keydown-SPACE', start);
    this.input.once('pointerdown', start);
  }
}

// ---------- 一局 ----------
class Run extends Phaser.Scene {
  constructor() { super('run'); }

  create() {
    this.input.mouse.disableContextMenu();
    this.keys = this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,J,K,E,Q,F,SPACE,SHIFT,TAB,ESC,ENTER,ONE,TWO,THREE');
    this.input.keyboard.addCapture('TAB,SPACE,UP,DOWN,LEFT,RIGHT');
    this.add.image(0, 0, 'ground').setOrigin(0).setDepth(-10);
    this.shadowG = this.add.graphics().setDepth(-5);
    this.decalG = this.add.graphics().setDepth(-6);
    this.fxG = this.add.graphics().setDepth(-4);
    this.topG = this.add.graphics().setDepth(5000);
    this.inkFx = this.add.particles(0, 0, 'ink', { speed: { min: 80, max: 320 }, scale: { start: 0.9, end: 0 }, lifespan: { min: 220, max: 520 }, gravityY: 300, emitting: false }).setDepth(4000);
    this.redSparkFx = this.add.particles(0, 0, 'lootbeam_red_spark', { speed: { min: 40, max: 160 }, angle: { min: 200, max: 340 }, scale: { start: artScale('lootbeam_red_spark') * 0.5, end: 0 }, rotate: { min: 0, max: 360 }, lifespan: { min: 600, max: 1100 }, gravityY: -40, blendMode: 'ADD', emitting: false }).setDepth(4002);
    this.sparkFx = this.add.particles(0, 0, 'dot', { speed: { min: 60, max: 220 }, scale: { start: 1, end: 0 }, lifespan: 420, blendMode: 'ADD', emitting: false }).setDepth(4001);

    const hero = this.hero = {
      x: 640, y: 620, r: 18, hp: 100, maxHp: 100, spd: 300, face: -Math.PI / 2, faceX: 1,
      dodges: 2, maxDodge: 2, dodgeT: 0, rollT: 0, rollDir: 0, inv: 0, hurtInv: 0,
      atk: null, combo: 0, comboWin: 0, queue: null, heavyCd: 0, rolledHit: new Set(),
      rage: 0, torch: 3, chain: 0, chainT: 0, charge: -1, chargeMouse: false, breakT: 0, dmgMul: 1, flash: 0,
    };
    hero.spr = art(this, hero.x, hero.y, 'hero_idle');
    // 上方栅栏：E03 横栏，开营门时把门口那段藏起来换成营门
    this.rails = [];
    for (let x = 20; x < W + 40; x += 70) this.rails.push(art(this, x, ARENA.t - 8, x % 280 === 160 ? 'palisade_damaged' : 'palisade_rail').setDepth(ARENA.t - 8));
    this.run = { room: 0, kills: 0, souls: [], bag: [], grid: [], correction: 0, warned: {}, t0: this.time.now, value: 0 };
    for (let i = 0; i < 4; i++) this.run.grid.push(new Array(6).fill(null));
    this.enemies = []; this.arrows = []; this.chests = []; this.doors = []; this.roomObjs = [];
    this.hitstop = 0; this.paused = false; this.panel = null; this.mouseAim = false;
    this.over = false;
    if (TOUCH) {
      this.pad = new TouchPad(this);
      // 竖屏时自动暂停（页面上同时盖“请横屏游玩”）
      this.portraitMq = matchMedia('(orientation: portrait)');
      this.onPortrait = e => { if (e.matches && !this.panel && !this.over) this.togglePause(); };
      this.portraitMq.addEventListener('change', this.onPortrait);
      this.events.once('shutdown', () => this.portraitMq.removeEventListener('change', this.onPortrait));
    } else {
      this.input.on('pointermove', () => { this.mouseAim = true; });
      this.input.on('pointerdown', p => {
        if (this.panel) return;
        if (p.rightButtonDown()) this.heavyDown(true); else this.tryLight(true);
      });
    }
    this.input.keyboard.on('keydown-TAB', () => this.toggleBag());
    this.input.keyboard.on('keydown-ESC', () => { if (this.panel && this.panel.kind === 'bag') this.toggleBag(); });

    this.buildHud();
    this.enterRoom('start');
    window.__run = this;
  }

  // ---------- 房间 ----------
  clearRoom() {
    this.roomObjs.forEach(o => o.destroy());
    this.roomObjs = [];
    this.enemies.forEach(e => { e.spr.destroy(); e.ui && e.ui.destroy(); });
    this.chests.forEach(c => { c.spr.destroy(); c.ui && c.ui.destroy(); });
    this.enemies = []; this.arrows = []; this.chests = []; this.doors = []; this.obstacles = [];
    this.decalG.clear();
    this.anchor = null;
  }

  enterRoom(kind) {
    this.clearRoom();
    const run = this.run;
    run.room++;
    this.roomKind = kind;
    this.roomName = kind === 'anchor' ? '时空裂隙' : pick(ROOM_NAMES);
    this.cleared = false; this.waves = [];
    const hero = this.hero;
    hero.x = 640; hero.y = 640; hero.atk = null; hero.rollT = 0;
    if (kind !== 'start') this.addCorrection(5);
    if (kind !== 'start' && this.has('laodang')) { hero.dmgMul += 0.08; this.time.delayedCall(900, () => this.toast(`老当益壮：伤害 +${Math.round((hero.dmgMul - 1) * 100)}%`, '#9FD3A8')); }

    this.rails.forEach(r => r.setVisible(true));
    // 营帐：E04，三色随机，四成是破损版
    const nt = kind === 'anchor' ? 2 : R.Between(2, 3);
    const spots = [[230, 300], [1050, 300], [250, 560], [1040, 560], [420, 420], [880, 430]];
    const faction = pick(['blue', 'yellow', 'red']);
    Phaser.Utils.Array.Shuffle(spots).slice(0, nt).forEach(([tx, ty], i) => {
      tx += rnd(-30, 30); ty += rnd(-20, 20);
      const col = i === 0 ? faction : pick(['blue', 'yellow', 'red']);
      const t = art(this, tx, ty, `tent_${col}${Math.random() < 0.4 ? '_damaged' : ''}`, TENT_K).setDepth(ty);
      if (Math.random() < 0.5) t.setFlipX(true);
      this.roomObjs.push(t);
      this.obstacles.push({ x: tx, y: ty - 27, r: 66 });
      // 第一顶营帐旁插帅旗（E05，旗面单独一层飘动）
      if (i === 0) this.addBanner(tx + (t.flipX ? -90 : 90), ty + 6, faction);
    });
    // 辎重车 E06、火盆 E07 + 火焰 V03
    if (Math.random() < 0.7) {
      const p = this.freeSpot(50);
      const cart = art(this, p.x, p.y, pick(['cart_loaded', 'cart_loaded', 'cart_empty', 'cart_overturned'])).setDepth(p.y).setFlipX(Math.random() < 0.5);
      this.roomObjs.push(cart);
      this.obstacles.push({ x: p.x, y: p.y - 10, r: 32 });
    }
    for (let i = R.Between(1, 2); i > 0; i--) {
      const p = this.freeSpot(30);
      const b = art(this, p.x, p.y, 'brazier_body').setDepth(p.y);
      const f = art(this, p.x, p.y - 22, 'fire_frame01', 1, true).setDepth(p.y + 1).play({ key: 'fire', startFrame: R.Between(0, 7) });
      this.roomObjs.push(b, f);
      this.obstacles.push({ x: p.x, y: p.y - 4, r: 13 });
    }

    const d = run.room;
    const sp = n => Array.from({ length: n }, () => pick(['spear', 'spear', 'archer']));
    const guards = () => (run.correction >= 50 ? 2 : run.correction >= 25 ? 1 : 0);
    if (kind === 'start') {
      this.addChest('wood');
      this.addChest('wood');
      this.waves = [['spear', 'spear', 'spear']];
    } else if (kind === 'anchor') {
      this.anchor = { x: 640, y: 400, prog: 0, need: 8, spawnT: 1.5 };
      // E09 时空锚点：地面法阵 + 光柱
      const ring = art(this, 640, 400, 'anchor_ring', 3.2).setOrigin(0.5).setDepth(-4);
      const beam = art(this, 640, 424, 'anchor_beam', 2).setDepth(401).setAlpha(0.75);
      this.tweens.add({ targets: beam, alpha: 0.4, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      this.roomObjs.push(ring, beam);
    } else {
      const a = [...sp(2 + Math.min(d, 5))];
      if (d >= 2) a.push('archer');
      if (kind === 'elite') a.push('cav');
      if (d >= 4 && Math.random() < 0.5) a.push('cav');
      const g = guards(); for (let i = 0; i < g; i++) a.push('guard');
      const half = Math.ceil(a.length / 2);
      this.waves = d >= 3 ? [a.slice(0, half), a.slice(half)] : [a];
      // 场景里散落的箱子
      const nc = kind === 'chest' ? 1 : R.Between(0, 2);
      for (let i = 0; i < nc; i++) this.addChest(Math.random() < 0.3 + d * 0.06 ? 'bronze' : 'wood');
    }
    this.spawnWave();
    this.banner(`第 ${run.room} 间 · ${this.roomName}`, kind === 'anchor' ? '站进裂隙，坚持 8 秒即可撤离' : (DOORS[kind] ? `奖励：${DOORS[kind].n}` : '清掉守兵，搜刮营帐'));
    this.cameras.main.fadeIn(260, 22, 17, 13);
  }

  // 不压障碍、离出生点和撤离点远一些的空地
  freeSpot(r) {
    let x, y;
    for (let i = 0; i < 60; i++) {
      x = rnd(ARENA.l + 60, ARENA.r - 60); y = rnd(ARENA.t + 70, ARENA.b - 40);
      if (this.blocked(x, y, r) || Math.hypot(x - 640, y - 640) < 170) continue;
      if (this.roomKind === 'anchor' && Math.hypot(x - 640, (y - 400) * 1.6) < 200) continue;
      break;
    }
    return { x, y };
  }

  addBanner(x, y, col) {
    if (this.blocked(x, y, 8)) return;
    // 旗杆和旗面同画布、同原点（杆脚），旗面以杆为轴轻轻飘
    const pole = art(this, x, y, `banner_${col}_pole`).setDepth(y);
    const cloth = art(this, x, y, `banner_${col}_cloth`).setDepth(y + 1);
    const s = cloth.scaleX;
    this.tweens.add({ targets: cloth, scaleX: s * 0.9, scaleY: s * 1.03, duration: rnd(600, 900), yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.roomObjs.push(pole, cloth);
    this.obstacles.push({ x, y, r: 8 });
  }

  spawnWave() {
    const w = this.waves.shift();
    if (!w) return;
    w.forEach((type, i) => this.time.delayedCall(i * 140, () => this.spawnEnemy(type)));
  }

  spawnEnemy(type, at) {
    const def = ENEMY[type];
    let x, y, tries = 0;
    do {
      x = at ? at.x + rnd(-40, 40) : rnd(ARENA.l + 40, ARENA.r - 40);
      y = at ? at.y + rnd(-40, 40) : rnd(ARENA.t + 20, ARENA.b - 120);
      tries++;
    } while (tries < 30 && (Math.hypot(x - this.hero.x, y - this.hero.y) < 280 || this.blocked(x, y, def.r)));
    const skin = def.skin || pick(['soldier_blue', 'soldier_yellow', 'soldier_red']);
    const spr = art(this, x, y, `${skin}_idle`, def.k).setAlpha(0);
    if (def.tint) spr.setTint(def.tint);
    const e = {
      type, def, skin, spr, x, y, r: def.r, hp: def.hp, maxHp: def.hp, guard: def.guard || 0, maxGuard: def.guard || 0, hurtT: 0,
      dmg: def.dmg, sinceHit: 99, state: 'move', t: 0, cd: rnd(0.4, 1.2), spawnT: 0.6, stun: 0, broken: 0, dir: 0,
      flash: 0, hitBy: -1, strafe: Math.random() < 0.5 ? 1 : -1, kx: 0, ky: 0,
    };
    if (def.elite) {
      e.ui = this.add.text(x, y, def.name, { fontFamily: FONT, fontSize: '15px', color: type === 'guard' ? '#3EC6E0' : '#F3E9D2', stroke: '#2B1D16', strokeThickness: 4 }).setOrigin(0.5);
    }
    this.tweens.add({ targets: spr, alpha: 1, duration: 500 });
    this.ring(x, y - 20, type === 'guard' ? C.cyan : C.ink, 70, 500);
    this.enemies.push(e);
    return e;
  }

  // 不给坐标时随机找一个不压营帐、不压其他箱子、离出生点有距离的位置
  addChest(tier, x, y) {
    const def = CHESTS[tier];
    if (x === undefined) {
      for (let i = 0; i < 60; i++) {
        x = rnd(180, 1100); y = rnd(250, 580);
        if (!this.blocked(x, y, 60) && Math.hypot(x - 640, y - 640) > 160) break;
      }
    }
    // 固定坐标（清房奖励）若压到营帐，就沿竖直方向挪开
    for (let i = 0; i < 20 && this.blocked(x, y, 40); i++) y += i % 2 ? -i * 12 : i * 12;
    const k = CHEST_K * (tier === 'lacquer' ? 1.15 : 1);
    const spr = art(this, x, y, def.tex + '_closed', k).setDepth(y);
    const c = { tier, def, spr, x, y, k, opened: false, items: null, idx: 0, t: 0 };
    this.chests.push(c);
    this.obstacles.push({ x, y: y - 8, r: 26 });
    if (tier === 'lacquer') this.tweens.add({ targets: spr, scale: spr.scale * 1.06, duration: 600, yoyo: true, repeat: -1 });
    return c;
  }

  onRoomCleared() {
    this.cleared = true;
    const k = this.roomKind;
    if (k === 'soul' || k === 'elite') this.time.delayedCall(450, () => this.soulPick());
    if (k === 'elite') this.addChest('bronze', 640, 360);
    if (k === 'chest') { this.addChest('lacquer', 640, 360); this.toast('漆金宝箱出现了'); }
    if (k === 'heal') { const h = Math.min(40, this.hero.maxHp - this.hero.hp); this.hero.hp += h; this.toast(`郎中包扎：体力 +${Math.round(h)}`); }
    this.makeDoors();
  }

  makeDoors() {
    const r = this.run.room;
    const pool = ['soul', 'soul', 'chest', 'heal', 'elite'];
    let a = pick(pool), b;
    do b = pick(pool); while (b === a);
    if (r >= 3 || this.run.correction >= 75) b = 'anchor';
    [[480, a], [800, b]].forEach(([x, kind]) => {
      const info = DOORS[kind];
      // 拆掉门口那段横栏，换 E03 营门
      this.rails.forEach(r => { if (Math.abs(r.x - x) < 70) r.setVisible(false); });
      const gy = ARENA.t - 8;
      const gate = art(this, x, gy, 'palisade_gate', 1.15).setDepth(gy);
      const glow = this.add.ellipse(x, gy - 8, 110, 34, info.c, 0.35).setDepth(gy - 1);
      this.tweens.add({ targets: glow, alpha: 0.12, duration: 700, yoyo: true, repeat: -1 });
      // U04 门奖励图标（撤离用 E09 锚点小图）
      const ic = ui(this, x, gy - 44, DOOR_ICON[kind], kind === 'anchor' ? 70 : 54).setDepth(gy + 2);
      this.tweens.add({ targets: ic, y: ic.y - 4, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      const lb = this.add.text(x, gy + 14, info.n, { fontFamily: FONT, fontSize: '17px', color: '#F3E9D2', stroke: '#2B1D16', strokeThickness: 4 }).setOrigin(0.5).setDepth(gy + 2);
      this.roomObjs.push(gate, glow, ic, lb);
      this.doors.push({ x, y: 150, kind });
    });
    this.toast('营门已开，选一条路');
  }

  // ---------- 主循环 ----------
  update(time, deltaMs) {
    const dt = Math.min(deltaMs / 1000, 0.05);
    this.drawHud();
    if (this.pad) this.pad.update(dt);
    if (this.paused) return;
    if (this.hitstop > 0) { this.hitstop -= dt; return; }
    this.run.corrT = (this.run.corrT || 0) + dt;
    if (this.run.corrT >= 3) { this.run.corrT -= 3; this.addCorrection(1); }
    if (this.run.correction >= 100) this.hurtHero(5 * dt, null, true);

    this.updateHero(dt);
    this.enemies.forEach(e => this.updateEnemy(e, dt));
    this.separate();
    this.updateArrows(dt);
    this.updateChests(dt);
    this.updateAnchor(dt);
    this.enemies = this.enemies.filter(e => !e.dead);

    if (!this.cleared && this.roomKind !== 'anchor') {
      const alive = this.enemies.length;
      if (alive <= 1 && this.waves.length) this.spawnWave();
      else if (alive === 0 && !this.waves.length) this.onRoomCleared();
    }
    if (this.cleared) {
      for (const d of this.doors) {
        if (Math.abs(this.hero.x - d.x) < 48 && this.hero.y < ARENA.t - 12) { this.goDoor(d); break; }
      }
    }
    this.render();
  }

  goDoor(d) {
    this.paused = true;
    this.cameras.main.fadeOut(220, 22, 17, 13);
    this.cameras.main.once('camerafadeoutcomplete', () => { this.paused = false; this.enterRoom(d.kind); });
  }

  input2() {
    if (this.pad && this.pad.moving) return { mx: this.pad.mx, my: this.pad.my, moving: true };
    const k = this.keys;
    let mx = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0);
    let my = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0);
    const l = Math.hypot(mx, my);
    if (l) { mx /= l; my /= l; }
    return { mx, my, moving: l > 0 };
  }

  // 触屏没有鼠标：朝前方 120° 内 240px 以内最近的敌人出手，没有就朝摇杆或面朝方向
  autoAim() {
    const h = this.hero, pad = this.pad;
    const base = pad && pad.moving ? Math.atan2(pad.my, pad.mx) : h.face;
    let best = null, bd = 240;
    for (const e of this.enemies) {
      if (e.dead || e.spawnT > 0) continue;
      const dx = e.x - h.x, dy = e.y - h.y, d = Math.hypot(dx, dy);
      if (d <= bd && Math.abs(R.Angle.Wrap(Math.atan2(dy, dx) - base)) <= Math.PI / 3) { bd = d; best = e; }
    }
    return best ? Math.atan2(best.y - 20 - (h.y - 20), best.x - h.x) : base;
  }

  aimAngle(fromMouse) {
    const h = this.hero;
    if (TOUCH) return this.autoAim();
    if (fromMouse || this.mouseAim) {
      const p = this.input.activePointer;
      return Math.atan2(p.worldY - (h.y - 30), p.worldX - h.x);
    }
    return h.face;
  }

  has(id) { return this.run.souls.includes(id); }

  updateHero(dt) {
    const h = this.hero, k = this.keys;
    const { mx, my, moving } = this.input2();
    h.inv = Math.max(0, h.inv - dt); h.hurtInv = Math.max(0, h.hurtInv - dt);
    h.heavyCd = Math.max(0, h.heavyCd - dt); h.breakT = Math.max(0, h.breakT - dt);
    h.comboWin = Math.max(0, h.comboWin - dt); h.chainT -= dt;
    const cap = this.dodgeCap();
    if (h.dodges > cap) h.dodges = cap;
    if (h.dodges < cap) { h.dodgeT += dt; if (h.dodgeT >= 1.2) { h.dodgeT = 0; h.dodges++; } }
    if (moving) { h.face = Math.atan2(my, mx); this.mouseAim = false; }

    if (Phaser.Input.Keyboard.JustDown(k.J)) this.tryLight(false);
    if (Phaser.Input.Keyboard.JustDown(k.K)) this.heavyDown(false);
    if (Phaser.Input.Keyboard.JustDown(k.SPACE) || Phaser.Input.Keyboard.JustDown(k.SHIFT)) this.tryDodge(mx, my, moving);
    if (Phaser.Input.Keyboard.JustDown(k.Q)) this.roar();
    if (Phaser.Input.Keyboard.JustDown(k.F)) this.useTorch();
    if (Phaser.Input.Keyboard.JustDown(k.E)) this.tryOpenChest();

    // 温酒斩华雄：按住重击蓄力，松开出手
    if (h.charge >= 0) {
      const held = this.pad ? this.pad.atkHeld : h.chargeMouse ? this.input.activePointer.rightButtonDown() : k.K.isDown;
      h.charge += dt;
      if (h.charge >= 1 && !h.chargeFull) { h.chargeFull = true; this.ring(h.x, h.y - 30, C.yellow, 60, 220, 4); }
      if (!held) { const full = h.charge >= 1; h.charge = -1; h.chargeFull = false; this.tryHeavy(this.mouseAim, full ? 1.8 : 1); }
    }

    let vx = 0, vy = 0;
    const spd = h.spd * (h.charge >= 0 ? 0.4 : 1);
    if (h.rollT > 0) {
      h.rollT -= dt;
      const rs = this.has('chong') ? 1200 : 800; // 0.2 秒：160 px，锦马超冲 240 px
      vx = Math.cos(h.rollDir) * rs; vy = Math.sin(h.rollDir) * rs;
      if (Math.random() < 0.6) this.inkFx.emitParticleAt(h.x + rnd(-8, 8), h.y + rnd(-4, 4), 1);
      this.rollHits();
      if (h.rollT <= 0) this.rollEnd();
    } else if (h.atk) {
      const a = h.atk;
      a.t += dt;
      if (!a.hit && a.t >= a.hitAt) { a.hit = true; this.resolveSwing(a); }
      const lunge = a.t < a.hitAt + 0.05 ? a.lunge : 0;
      vx = Math.cos(a.dir) * lunge + mx * spd * 0.25; vy = Math.sin(a.dir) * lunge + my * spd * 0.25;
      if (a.t >= a.dur) {
        h.atk = null;
        if (a.kind === 'light') { h.comboWin = 0.4; }
        if (h.queue) { const q = h.queue; h.queue = null; q === 'light' ? this.tryLight(this.mouseAim) : this.tryHeavy(this.mouseAim); }
      }
    } else {
      vx = mx * spd; vy = my * spd;
    }
    this.moveActor(h, vx * dt, vy * dt);

    // 外观
    const s = h.spr;
    const dirX = h.atk ? Math.cos(h.atk.dir) : (moving ? mx : 0);
    if (dirX > 0.15) h.faceX = 1; else if (dirX < -0.15) h.faceX = -1;
    // C01 关键姿势切换（不做逐帧动画）
    let pose = moving ? 'run' : 'idle';
    if (h.looting && !moving) pose = 'loot';
    if (h.hurtInv > 0.3) pose = 'hurt';
    if (h.charge >= 0) pose = 'attack3';
    if (h.atk) pose = h.atk.kind === 'heavy' ? 'heavy' : 'attack' + h.atk.step;
    if (h.rollT > 0) pose = 'roll';
    if (h.hp <= 0) pose = 'down';
    this.setPose(s, 'hero_' + pose, h.faceX);
    const bob = moving && !h.atk && h.rollT <= 0 ? Math.abs(Math.sin(this.time.now / 85)) * 4 : 0;
    s.setPosition(h.x, h.y - bob);
    s.setRotation(moving && !h.atk && h.rollT <= 0 ? Math.sin(this.time.now / 85) * 0.04 : 0);
    s.setAlpha(h.hurtInv > 0 ? (Math.floor(this.time.now / 60) % 2 ? 0.45 : 1) : 1);
    s.setDepth(h.y);
    if (h.flash > 0) { h.flash -= dt; s.setTintFill(0xffffff); } else s.clearTint();
  }

  // 换姿势图；face 为 1 表示朝右，姿势图本身朝左的要反过来镜像
  setPose(s, key, face) {
    if (s.texture.key !== key) s.setTexture(key);
    s.setFlipX(face * (POSE_FACE[key] || 1) < 0);
  }

  tryLight(fromMouse) {
    const h = this.hero;
    if (this.paused || h.rollT > 0) return;
    if (h.atk) { if (h.atk.t > h.atk.dur * 0.4) h.queue = 'light'; return; }
    h.combo = h.comboWin > 0 ? (h.combo % 3) + 1 : 1;
    const third = h.combo === 3;
    h.atk = { kind: 'light', step: h.combo, dir: this.aimAngle(fromMouse), t: 0, hitAt: 0.07, dur: third ? 0.32 : 0.22,
      dmg: third ? 20 : 12, reach: third ? 110 : 96, arc: third ? 1.5 : 1.25, lunge: third ? 260 : 160, guardMul: 1 };
  }

  // 重击按下：有温酒斩华雄时进入蓄力，否则直接出手
  heavyDown(fromMouse) {
    const h = this.hero;
    if (this.paused || h.rollT > 0 || h.charge >= 0) return;
    if (this.has('wenjiu') && !h.atk) { h.charge = 0; h.chargeMouse = fromMouse; h.chargeFull = false; if (fromMouse) this.mouseAim = true; return; }
    this.tryHeavy(fromMouse);
  }

  tryHeavy(fromMouse, mul = 1) {
    const h = this.hero;
    if (this.paused || h.rollT > 0 || h.heavyCd > 0) return;
    if (h.atk) { if (h.atk.t > h.atk.dur * 0.4) h.queue = 'heavy'; return; }
    h.atk = { kind: 'heavy', dir: this.aimAngle(fromMouse), t: 0, hitAt: 0.24, dur: 0.48, dmg: 30 * mul,
      reach: 125, arc: 1.25, lunge: 120, guardMul: 2, charged: mul > 1 };
    h.heavyCd = 0.25;
    h.combo = 0;
  }

  dodgeCap() {
    const h = this.hero;
    return h.maxDodge + (this.has('dan') && h.hp < h.maxHp * 0.4 ? 1 : 0);
  }

  tryDodge(mx, my, moving) {
    const h = this.hero;
    if (this.paused || h.dodges <= 0 || h.rollT > 0) return;
    h.dodges--; h.atk = null; h.queue = null; h.charge = -1;
    h.rollDir = moving ? Math.atan2(my, mx) : h.face;
    h.rollT = 0.2; h.inv = 0.2;
    h.rolledHit = new Set();
  }

  // 七进七出：翻滚穿过敌人造成 15 伤害
  rollHits() {
    const h = this.hero;
    if (!this.has('qijin')) return;
    for (const e of this.enemies) {
      if (e.dead || e.spawnT > 0 || h.rolledHit.has(e)) continue;
      if (Math.hypot(e.x - h.x, e.y - h.y) < e.r + 36) {
        h.rolledHit.add(e);
        this.damageEnemy(e, 15, { dir: h.rollDir, kb: 80 });
      }
    }
  }

  rollEnd() {
    const h = this.hero;

    // 锦马超冲：终点撞飞
    if (this.has('chong')) {
      this.ring(h.x, h.y - 10, C.ink, 90, 260, 6);
      let hit = false;
      for (const e of this.enemies) {
        if (e.dead || e.spawnT > 0 || Math.hypot(e.x - h.x, e.y - h.y) > 90 + e.r) continue;
        hit = true;
        this.damageEnemy(e, 10, { dir: Math.atan2(e.y - h.y, e.x - h.x), kb: 420, guardDmg: 20 });
      }
      if (hit) { this.hitstop = 0.07; this.cameras.main.shake(100, 0.006); }
    }
    if (this.has('xiliang')) h.breakT = 1; // 放在撞飞之后，留给玩家的下一击
  }

  // 当阳一吼：怒气满 100 才能放
  roar() {
    const h = this.hero;
    if (!this.has('hou') || this.paused) return;
    if (h.rage < 100) { this.floatText(h.x, h.y - 120, '怒气未满', '#CDB78A', 18); return; }
    h.rage = 0;
    this.ring(h.x, h.y - 30, C.red, 240, 400, 8);
    this.cameras.main.shake(200, 0.01);
    this.hitstop = 0.1;
    this.floatText(h.x, h.y - 120, '当阳一吼！', '#F3E9D2', 30);
    for (const e of this.enemies) {
      if (e.dead || Math.hypot(e.x - h.x, e.y - h.y) > 240) continue;
      e.stun = 2; e.state = 'move';
      if (e.maxGuard && e.broken <= 0) this.guardDamage(e, 50);
    }
  }

  // 现代道具：强光手电，前方扇形致盲 2 秒
  useTorch() {
    const h = this.hero;
    if (this.paused || h.torch <= 0) return;
    h.torch--;
    const dir = this.aimAngle(false), cx = h.x, cy = h.y - 20;
    const g = this.add.graphics().setDepth(4300);
    g.fillStyle(0xFFF6C8, 0.55); g.slice(cx, cy, 280, dir - 0.6, dir + 0.6, false); g.fillPath();
    this.tweens.add({ targets: g, alpha: 0, duration: 350, onComplete: () => g.destroy() });
    for (const e of this.enemies) {
      if (e.dead) continue;
      const dx = e.x - cx, dy = e.y - 20 - cy;
      if (Math.hypot(dx, dy) < 280 + e.r && Math.abs(R.Angle.Wrap(Math.atan2(dy, dx) - dir)) < 0.6) {
        e.stun = Math.max(e.stun, 2); e.state = 'move';
        this.floatText(e.x, e.y - 100, '致盲', '#FFF6C8', 18);
      }
    }
    // 百步穿杨：道具后自动射 3 支追踪箭
    if (this.has('baibu')) {
      for (let i = 0; i < 3; i++) {
        const a = dir + (i - 1) * 0.35;
        this.arrows.push({ x: cx, y: cy, vx: Math.cos(a) * 640, vy: Math.sin(a) * 640, dmg: 15, hero: true, homing: true, hit: new Set(), life: 1.6 });
      }
    }
  }

  resolveSwing(a) {
    const h = this.hero;
    const cx = h.x, cy = h.y - 20;
    this.slashFx(cx, cy, a);
    let hits = 0;
    for (const e of this.enemies) {
      if (e.dead || e.spawnT > 0) continue;
      const dx = e.x - cx, dy = (e.y - 20) - cy;
      const d = Math.hypot(dx, dy);
      if (d > a.reach + e.r) continue;
      if (a.arc < Math.PI && Math.abs(R.Angle.Wrap(Math.atan2(dy, dx) - a.dir)) > a.arc) continue;
      hits++;
      this.damageEnemy(e, a.dmg, { guardDmg: a.dmg * a.guardMul, dir: Math.atan2(dy, dx), kb: a.kind === 'heavy' ? 260 : 140, heavy: a.kind === 'heavy' });
    }
    // 青龙斩：第三段放刀气
    if (a.kind === 'light' && a.step === 3 && this.has('qinglong')) {
      this.arrows.push({ x: cx + Math.cos(a.dir) * 40, y: cy + Math.sin(a.dir) * 40, vx: Math.cos(a.dir) * 820, vy: Math.sin(a.dir) * 820, dmg: 20, hero: true, wave: true, hit: new Set(), life: 0.5 });
    }
    if (hits) {
      h.chain = (h.chainT > 0 ? h.chain : 0) + 1; h.chainT = 1.6;
      h.rage = Math.min(100, h.rage + 4);
      this.hitstop = a.kind === 'heavy' ? (a.charged ? 0.12 : 0.09) : 0.05;
      this.cameras.main.shake(a.kind === 'heavy' ? 120 : 70, a.kind === 'heavy' ? 0.007 : 0.004);
    }
  }

  // 架势伤害；打空进入破阵 3 秒（受伤 ×1.5、眩晕 1.2 秒）
  guardDamage(e, v) {
    e.guard -= v;
    if (e.guard > 0) return false;
    e.guard = 0; e.broken = 3; e.stun = 1.2; e.state = 'move';
    this.stamp(e.x, e.y - CHAR_H * e.def.k - 20);
    this.cameras.main.shake(180, 0.01); this.hitstop = 0.12;
    this.sparkFx.setParticleTint(0xF1C40F); this.sparkFx.explode(24, e.x, e.y - 40);
    return true;
  }

  damageEnemy(e, base, o = {}) {
    if (e.dead) return;
    const h = this.hero;
    let dmg = base * h.dmgMul, col = '#F3E9D2';
    e.sinceHit = 0;
    if (e.maxGuard && e.broken <= 0) {
      // 西凉铁骑：翻滚后 1 秒内下一击必破阵
      const force = h.breakT > 0;
      if (force) h.breakT = 0;
      const broke = this.guardDamage(e, force ? e.guard : (o.guardDmg || base));
      if (!broke) { dmg *= 0.3; col = '#CDB78A'; }
    } else if (e.broken > 0) { dmg *= 1.5; col = '#F1C40F'; }
    dmg = Math.round(dmg);
    e.hp -= dmg;
    e.flash = 0.07;
    if (o.dir !== undefined) { const kb = (o.kb || 120) * (e.def.elite && e.broken <= 0 ? 0.3 : 1); e.kx = Math.cos(o.dir) * kb; e.ky = Math.sin(o.dir) * kb; }
    if (e.state === 'windup' && !e.def.elite) { e.state = 'recover'; e.t = 0.35; }
    e.hurtT = 0.22;
    this.fxImage(e.x + rnd(-8, 8), e.y - CHAR_H * e.def.k * 0.45, 'hit_splash', o.heavy ? 0.9 : 0.65, o.heavy ? 260 : 200);
    this.inkFx.explode(o.heavy ? 8 : 4, e.x, e.y - 40);
    this.floatText(e.x + rnd(-12, 12), e.y - 90, String(dmg), col, o.heavy ? 26 : 20);
    if (e.hp <= 0) this.killEnemy(e);
  }

  killEnemy(e) {
    e.dead = true;
    this.run.kills++;
    this.inkFx.explode(16, e.x, e.y - 30);
    // V02 墨滴留在地上当血迹
    const drop = art(this, e.x, e.y + 6, 'hit_droplets', 0.8).setOrigin(0.5).setDepth(-6).setAlpha(0.55).setScale(artScale('hit_droplets') * 0.8, artScale('hit_droplets') * 0.45).setFlipX(Math.random() < 0.5);
    this.roomObjs.push(drop);
    e.ui && e.ui.destroy();
    this.setPose(e.spr, `${e.skin}_down`, e.spr.flipX ? -1 : 1);
    e.spr.setRotation(0).clearTint();
    this.tweens.add({ targets: e.spr, alpha: 0, delay: 500, duration: 400, onComplete: () => e.spr.destroy() });
    if (e.type === 'guard') this.addCorrection(-6, '击退时空守卫，修正力 -6');
  }

  // ---------- 敌人 ----------
  updateEnemy(e, dt) {
    if (e.dead) return;
    const h = this.hero;
    e.spawnT -= dt; e.cd -= dt; e.flash -= dt; e.sinceHit += dt; e.hurtT -= dt;
    if (e.broken > 0) { e.broken -= dt; if (e.broken <= 0) { e.broken = 0; e.guard = e.maxGuard; } } // 破阵结束架势回满
    // 架势 2 秒不受攻击后每秒恢复 15%
    else if (e.maxGuard && e.guard < e.maxGuard && e.sinceHit >= 2) e.guard = Math.min(e.maxGuard, e.guard + e.maxGuard * 0.15 * dt);
    // 击退
    if (e.kx || e.ky) {
      this.moveActor(e, e.kx * dt, e.ky * dt);
      e.kx *= Math.pow(0.0005, dt); e.ky *= Math.pow(0.0005, dt);
      if (Math.abs(e.kx) + Math.abs(e.ky) < 5) e.kx = e.ky = 0;
    }
    const dx = h.x - e.x, dy = h.y - e.y, d = Math.hypot(dx, dy), toH = Math.atan2(dy, dx);
    if (e.spawnT > 0) return this.enemyLook(e, dx);
    if (e.stun > 0) { e.stun -= dt; return this.enemyLook(e, dx); }
    const def = e.def;
    switch (e.state) {
      case 'move': {
        let mvx = 0, mvy = 0;
        if (e.type === 'archer') {
          if (d < 240) { mvx = -dx / d; mvy = -dy / d; }
          else if (d > 440) { mvx = dx / d; mvy = dy / d; }
          else { mvx = -dy / d * 0.5 * e.strafe; mvy = dx / d * 0.5 * e.strafe; }
          if (e.cd <= 0 && d < 560) { e.state = 'windup'; e.t = def.windup; e.dir = toH; }
        } else if (e.type === 'cav') {
          if (d > 300) { mvx = dx / d; mvy = dy / d; } else { mvx = -dy / d * 0.6 * e.strafe; mvy = dx / d * 0.6 * e.strafe; }
          if (e.cd <= 0 && d < def.range + 40) { e.state = 'windup'; e.t = def.windup; e.dir = toH; }
        } else {
          if (d > def.range * 0.85) { mvx = dx / d; mvy = dy / d; }
          if (e.cd <= 0 && d < def.range + 10) { e.state = 'windup'; e.t = def.windup; e.dir = toH; }
        }
        this.moveActor(e, mvx * def.spd * dt, mvy * def.spd * dt);
        e.moving = !!(mvx || mvy);
        if (e.moving) e.bob = (e.bob || 0) + dt * 12;
        break;
      }
      case 'windup':
        e.t -= dt;
        if (e.type === 'archer' && e.t > 0.25) e.dir = toH;
        if (e.type === 'cav' && e.t > 0.3) e.dir = toH;
        if (e.t <= 0) {
          if (e.type === 'spear') { e.state = 'lunge'; e.t = 0.14; e.didHit = false; }
          else if (e.type === 'archer') {
            this.arrows.push({ x: e.x, y: e.y - 40, vx: Math.cos(e.dir) * 460, vy: Math.sin(e.dir) * 460, dmg: e.dmg, life: 1.6 });
            e.state = 'recover'; e.t = 0.4;
          } else if (e.type === 'cav') { e.state = 'charge'; e.left = 360; e.didHit = false; }
          else if (e.type === 'guard') {
            this.ring(e.x, e.y, C.cyan, 120, 260, 6);
            this.cameras.main.shake(120, 0.006);
            if (Math.hypot(h.x - e.x, h.y - e.y) < 120 + h.r) this.hurtHero(e.dmg, e);
            e.state = 'recover'; e.t = 0.9;
          }
        }
        break;
      case 'lunge': {
        e.t -= dt;
        this.moveActor(e, Math.cos(e.dir) * 480 * dt, Math.sin(e.dir) * 480 * dt);
        if (!e.didHit) {
          const ang = Math.abs(R.Angle.Wrap(toH - e.dir));
          if (d < 92 && ang < 0.7) { e.didHit = true; this.hurtHero(e.dmg, e); }
        }
        if (e.t <= 0) { e.state = 'recover'; e.t = 0.55; }
        break;
      }
      case 'charge': {
        const step = 760 * dt;
        const ox = e.x, oy = e.y;
        this.moveActor(e, Math.cos(e.dir) * step, Math.sin(e.dir) * step);
        e.left -= step;
        if (Math.random() < 0.7) this.inkFx.emitParticleAt(e.x, e.y, 1);
        if (!e.didHit && d < 58) { e.didHit = true; this.hurtHero(e.dmg, e); }
        if (e.left <= 0 || Math.hypot(e.x - ox, e.y - oy) < step * 0.4) { e.state = 'recover'; e.t = 1.0; }
        break;
      }
      case 'recover':
        e.t -= dt;
        if (e.t <= 0) { e.state = 'move'; e.cd = def.cd * rnd(0.8, 1.2); }
        break;
    }
    this.enemyLook(e, e.state === 'move' ? dx : Math.cos(e.dir));
  }

  enemyLook(e, dx) {
    const s = e.spr;
    if (dx < -0.1) e.face = -1; else if (dx > 0.1) e.face = 1;
    // C02 / C03 关键姿势：待机、走、前摇、刺击、受击
    const archer = e.skin === 'archer';
    let pose = e.state === 'move' && e.moving && e.spawnT <= 0 ? 'walk' : 'idle';
    if (e.state === 'windup') pose = archer ? 'draw' : 'windup';
    if (e.state === 'lunge' || e.state === 'charge') pose = archer ? 'draw' : 'stab';
    if (e.hurtT > 0 || e.stun > 0) pose = 'hurt';
    this.setPose(s, `${e.skin}_${pose}`, e.face || 1);
    const bob = pose === 'walk' ? Math.abs(Math.sin(e.bob || 0)) * 3 : 0;
    const rot = e.state === 'windup' ? (e.face || 1) * -0.04 * Math.sin(this.time.now / 30) : 0;
    s.setPosition(e.x, e.y - bob).setRotation(rot).setDepth(e.y);
    if (e.flash > 0) s.setTintFill(0xffffff);
    else if (e.def.tint) s.setTint(e.def.tint);
    else if (e.broken > 0) s.setTint(0xffe9a8);
    else s.clearTint();
    if (e.type === 'guard' && e.flash <= 0) s.setAlpha(0.82 + Math.sin(this.time.now / 90) * 0.15);
    if (e.ui) e.ui.setPosition(e.x, e.y - CHAR_H * e.def.k - 26).setDepth(e.y + 1);
  }

  hurtHero(dmg, src, silent) {
    const h = this.hero;
    if (this.over || (!silent && (h.inv > 0 || h.hurtInv > 0))) return;
    if (!silent) {
      if (this.run.correction >= 50) dmg *= 1.25; // 修正力 50：敌伤 +25%
      // 万人敌：被 3 个以上敌人包围时受伤 -20%
      if (this.has('wanren') && this.enemies.filter(e => !e.dead && Math.hypot(e.x - h.x, e.y - h.y) < 170).length >= 3) dmg *= 0.8;
      h.rage = Math.min(100, h.rage + 6);
    }
    h.hp -= dmg;
    if (!silent) {
      h.hurtInv = 0.5; h.flash = 0.08;
      this.cameras.main.shake(140, 0.009);
      this.cameras.main.flash(90, 176, 58, 46, false);
      this.hitstop = 0.06;
      this.floatText(h.x, h.y - 110, '-' + Math.round(dmg), '#E74C3C', 24);
      if (src) { const a = Math.atan2(h.y - src.y, h.x - src.x); this.moveActor(h, Math.cos(a) * 26, Math.sin(a) * 26); }
    }
    if (h.hp <= 0) { h.hp = 0; this.endRun(false); }
  }

  updateArrows(dt) {
    const h = this.hero;
    for (const a of this.arrows) {
      if (a.homing) {
        let best = null, bd = 1e9;
        for (const e of this.enemies) { if (e.dead || a.hit.has(e) || e.spawnT > 0) continue; const d = Math.hypot(e.x - a.x, e.y - 30 - a.y); if (d < bd) { bd = d; best = e; } }
        if (best) {
          const want = Math.atan2(best.y - 30 - a.y, best.x - a.x), cur = Math.atan2(a.vy, a.vx);
          const nd = cur + R.Clamp(R.Angle.Wrap(want - cur), -7 * dt, 7 * dt), sp = Math.hypot(a.vx, a.vy);
          a.vx = Math.cos(nd) * sp; a.vy = Math.sin(nd) * sp;
        }
      }
      a.x += a.vx * dt; a.y += a.vy * dt; a.life -= dt;
      if (a.x < 40 || a.x > W - 40 || a.y < 100 || a.y > H) a.life = 0;
      if (a.hero) {
        for (const e of this.enemies) {
          if (e.dead || a.hit.has(e) || e.spawnT > 0) continue;
          if (Math.hypot(e.x - a.x, e.y - 30 - a.y) < e.r + (a.wave ? 44 : 16)) { a.hit.add(e); this.damageEnemy(e, a.dmg, { dir: Math.atan2(a.vy, a.vx), kb: 120 }); }
        }
      } else if (Math.hypot(h.x - a.x, h.y - 30 - a.y) < h.r + 10) {
        if (h.inv <= 0 && h.hurtInv <= 0) { this.hurtHero(a.dmg, { x: a.x - a.vx, y: a.y - a.vy }); a.life = 0; }
      }
    }
    this.arrows = this.arrows.filter(a => a.life > 0);
  }

  // ---------- 搜箱 ----------
  nearChest() {
    const h = this.hero;
    let best = null, bd = 90;
    for (const c of this.chests) { const d = Math.hypot(c.x - h.x, c.y - h.y); if (d < bd) { bd = d; best = c; } }
    return best;
  }

  tryOpenChest() {
    const c = this.nearChest();
    if (!c || c.opened) return;
    c.opened = true;
    c.spr.setTexture(c.def.tex + '_open');
    this.tweens.killTweensOf(c.spr);
    c.spr.setScale(artScale(c.def.tex + '_open') * c.k);
    c.items = [];
    for (let i = 0; i < c.def.n; i++) {
      const r = this.rollRarity(c.def.w);
      const pool = ITEMS.filter(it => it[1] === r);
      const it = pick(pool);
      c.items.push({ name: it[0], r: it[1], w: it[2], h: it[3], v: it[4], found: false });
    }
    c.idx = 0; c.t = 0;
    this.addCorrection(3);
    c.ui = this.add.container(c.x, c.y - 90).setDepth(4500);
    const n = c.items.length, sw = 46;
    c.ui.add(this.add.rectangle(0, 0, n * sw + 10, 56, C.paper, 0.95).setStrokeStyle(3, C.ink));
    c.slots = c.items.map((it, i) => {
      const x = (i - (n - 1) / 2) * sw;
      const box = this.add.rectangle(x, 0, 40, 40, 0x4a3a2c).setStrokeStyle(2, C.ink);
      const t = this.add.text(x, 0, '?', { fontFamily: FONT, fontSize: '22px', color: '#F3E9D2' }).setOrigin(0.5);
      const pg = this.add.graphics();
      c.ui.add([box, t, pg]);
      return { box, t, pg, x };
    });
  }

  rollRarity(w) {
    const sum = w.reduce((a, b) => a + b, 0);
    let r = Math.random() * sum;
    for (let i = 0; i < w.length; i++) { r -= w[i]; if (r < 0) return i; }
    return 0;
  }

  updateChests(dt) {
    const h = this.hero;
    h.looting = false;
    for (const c of this.chests) {
      if (!c.opened || c.idx >= c.items.length) continue;
      const near = Math.hypot(c.x - h.x, c.y - h.y) < 120;
      const it = c.items[c.idx];
      const need = RAR[it.r].t;
      if (near && !h.atk && h.rollT <= 0) { c.t += dt; h.looting = true; }
      const s = c.slots[c.idx];
      s.pg.clear();
      s.pg.lineStyle(4, near ? C.cyan : 0x777777, 1);
      s.pg.beginPath(); s.pg.arc(s.x, 0, 14, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, c.t / need)); s.pg.strokePath();
      s.t.setText(near ? '' : '…');
      if (c.t >= need) {
        s.pg.clear();
        it.found = true; c.idx++; c.t = 0;
        s.box.setFillStyle(RAR[it.r].c).setStrokeStyle(3, C.ink);
        const icon = ITEM_ICON[it.name];
        if (icon) { c.ui.add(ui(this, s.x, 0, icon, 38)); s.t.setText(''); } else s.t.setText(it.name.slice(0, 2)).setColor(it.r >= 3 ? '#F3E9D2' : '#2B1D16').setFontSize(14).setStroke(it.r >= 3 ? '#2B1D16' : '#F3E9D2', 3);
        const ok = this.putInBag(it);
        this.floatText(c.x, c.y - 120, `${RAR[it.r].n}·${it.name}${ok ? '' : '（背包满了）'}`, hex(RAR[it.r].c), it.r >= 3 ? 24 : 18);
        // V05 出货光柱，按品质换色，越稀有越高越久
        const beam = art(this, c.x, c.y + 4, `lootbeam_${RAR_KEY[it.r]}`, 0.8 + it.r * 0.18).setDepth(c.y + 1);
        const bs = beam.scale;
        beam.setScale(bs * 0.4, bs * 0.2);
        this.tweens.add({ targets: beam, scaleX: bs, scaleY: bs, duration: 160, ease: 'Back.easeOut',
          onComplete: () => this.tweens.add({ targets: beam, alpha: 0, delay: 300 + it.r * 180, duration: 500, onComplete: () => beam.destroy() }) });
        if (it.r >= 3) {
          this.sparkFx.setParticleTint(RAR[it.r].c); this.sparkFx.explode(30, c.x, c.y - 30);
          // 红色传说的额外粒子：V05 金红火星贴图
          if (it.r >= 5) this.redSparkFx.explode(18, c.x, c.y - 40);
          if (it.r >= 4) this.cameras.main.flash(160, 241, 196, 15, false);
        }
        if (c.idx >= c.items.length) this.time.delayedCall(1600, () => { if (c.ui && c.ui.active) this.tweens.add({ targets: c.ui, alpha: 0, duration: 300 }); });
      }
    }
  }

  putInBag(it) {
    const g = this.run.grid;
    const fits = (x, y, w, h) => { if (x + w > 6 || y + h > 4) return false; for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (g[j][i]) return false; return true; };
    for (const [w, hh] of [[it.w, it.h], [it.h, it.w]]) {
      for (let y = 0; y < 4; y++) for (let x = 0; x < 6; x++) if (fits(x, y, w, hh)) {
        const placed = { ...it, gx: x, gy: y, gw: w, gh: hh };
        for (let j = y; j < y + hh; j++) for (let i = x; i < x + w; i++) g[j][i] = placed;
        this.run.bag.push(placed);
        this.run.value += it.v;
        return true;
      }
    }
    return false;
  }

  // ---------- 撤离 ----------
  updateAnchor(dt) {
    const a = this.anchor;
    if (!a) return;
    const h = this.hero;
    const inside = Math.hypot(h.x - a.x, h.y - a.y) < 90;
    if (inside) a.prog += dt;
    a.spawnT -= dt;
    if (a.spawnT <= 0 && this.enemies.length < 7) {
      a.spawnT = this.run.correction >= 75 ? 1.6 : 2.4;
      const t = Math.random() < (this.run.correction >= 50 ? 0.35 : 0.15) ? 'guard' : pick(['spear', 'spear', 'archer', 'cav']);
      this.spawnEnemy(t);
    }
    if (a.prog >= a.need) { this.anchor = null; this.endRun(true); }
  }

  // ---------- 修正力 ----------
  addCorrection(v, msg) {
    const run = this.run;
    run.correction = R.Clamp(run.correction + v, 0, 100);
    if (msg) this.toast(msg);
    const tips = { 25: '修正力 25：时空守卫开始追捕你', 50: '修正力 50：敌人伤害 +25%', 75: '修正力 75：每个营门都会出现撤离路线，快走', 100: '修正力 100：历史正在抹除你！' };
    for (const th of [25, 50, 75, 100]) {
      if (run.correction >= th && !run.warned[th]) {
        run.warned[th] = true; this.toast(tips[th], '#C79BDB');
        if (th === 25 && this.roomKind && this.roomKind !== 'anchor' && !this.cleared) this.spawnEnemy('guard');
      }
    }
  }

  // ---------- 将魂三选一 ----------
  soulPick() {
    if (this.panel || this.over) return;
    // 已占槽位（被动除外）和未满足前置的不进池
    const used = new Set(this.run.souls.map(id => SOULS.find(s => s.id === id).slot).filter(s => s !== '被动'));
    const pool = SOULS.filter(s => !this.has(s.id) && !used.has(s.slot) && (!s.pre || this.has(s.pre)));
    if (!pool.length) { this.toast('将魂已集齐，改为体力 +20'); this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + 20); return; }
    const opts = Phaser.Utils.Array.Shuffle(pool.slice()).slice(0, 3);
    this.paused = true;
    const p = this.add.container(0, 0).setDepth(9000);
    p.add(this.add.rectangle(W / 2, H / 2, W, H, 0x16110d, 0.72).setInteractive());
    p.add(this.add.text(W / 2, 150, '蜀·五虎将魂　三选一', { fontFamily: FONT, fontSize: '40px', color: '#F3E9D2', stroke: '#2B1D16', strokeThickness: 8 }).setOrigin(0.5));
    const choose = s => {
      if (!this.panel || this.panel.kind !== 'soul') return;
      this.run.souls.push(s.id);
      this.closePanel();
      const tip = { hou: '（怒气满按 Q）', baibu: '（按 F 用手电触发）', wenjiu: '（按住重击蓄力）' }[s.id] || '';
      this.toast(`获得将魂：${s.n}${tip}`);
    };
    opts.forEach((s, i) => {
      // U03 将魂卡：原型的将魂都是普通品级，用 common 框；印章按武将兵器
      const x = W / 2 + (i - 1) * 310, y = 400, cw = 270;
      const card = ui(this, x, y, 'spiritcard_common', cw).setInteractive({ useHandCursor: true });
      const ch = card.displayHeight, top = y - ch / 2, cs = card.scale;
      const seal = ui(this, x, top + 44, `spiritcard_seal_${SOUL_SEAL[s.g]}`, 76);
      const nm = this.add.text(x, top + 96, s.n, { fontFamily: FONT, fontSize: '28px', color: '#2B1D16', fontStyle: 'bold' }).setOrigin(0.5);
      const g = this.add.text(x, top + 130, `— ${s.g} · ${s.slot} —`, { fontFamily: FONT, fontSize: '18px', color: '#6E4526' }).setOrigin(0.5);
      const d = this.add.text(x, top + 188, s.d, { fontFamily: FONT, fontSize: '16px', color: '#2B1D16', align: 'center', lineSpacing: 5 }).setOrigin(0.5);
      const key = this.add.text(x, top + ch - 44, TOUCH ? '点击选择' : `[${i + 1}]`, { fontFamily: FONT, fontSize: '18px', color: '#8E5E33' }).setOrigin(0.5);
      card.on('pointerover', () => card.setScale(cs * 1.03).setTint(0xFFF6E0));
      card.on('pointerout', () => card.setScale(cs).clearTint());
      card.on('pointerdown', () => choose(s));
      p.add([card, seal, nm, g, d, key]);
    });
    this.panel = { kind: 'soul', c: p, keys: opts.map(s => () => choose(s)) };
    const kh = ev => { const n = { Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2 }[ev.code]; if (n !== undefined && this.panel && this.panel.kind === 'soul' && this.panel.keys[n]) this.panel.keys[n](); };
    this.input.keyboard.on('keydown', kh);
    this.panel.off = () => this.input.keyboard.off('keydown', kh);
  }

  togglePause() {
    if (this.over) return;
    if (this.panel) { if (this.panel.kind === 'pause') this.closePanel(); return; }
    this.paused = true;
    const p = this.add.container(0, 0).setDepth(9000);
    const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x16110d, 0.72).setInteractive();
    p.add(dim);
    p.add(this.add.text(W / 2, H / 2 - 20, '已暂停', { fontFamily: FONT, fontSize: '56px', color: '#F3E9D2', stroke: '#2B1D16', strokeThickness: 8 }).setOrigin(0.5));
    p.add(this.add.text(W / 2, H / 2 + 50, '点击继续', { fontFamily: FONT, fontSize: '24px', color: '#CDB78A' }).setOrigin(0.5));
    // 晚一帧再接点击，免得按“停”的那一下直接关掉
    this.time.delayedCall(50, () => dim.once('pointerdown', () => { if (this.panel && this.panel.kind === 'pause') this.closePanel(); }));
    this.panel = { kind: 'pause', c: p };
  }

  closePanel() {
    if (!this.panel) return;
    this.panel.off && this.panel.off();
    this.panel.c.destroy();
    this.panel = null;
    this.paused = false;
  }

  // ---------- 背包 ----------
  toggleBag() {
    if (this.over) return;
    if (this.panel) { if (this.panel.kind === 'bag') this.closePanel(); return; }
    this.paused = true;
    const p = this.add.container(0, 0).setDepth(9000);
    const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x16110d, 0.7).setInteractive();
    if (TOUCH) dim.on('pointerdown', () => this.toggleBag());
    p.add(dim);
    // U02：面板自带 6×4 竹格，物品按格线对齐（原图格线 x 206–705、y 282–608）
    const pw0 = 83.2, ph0 = 81.5, gl = 206, gt = 282;
    const panel = this.add.image(W / 2 - 80, 386, 'inventory_panel').setInteractive();
    const sc = 62 / pw0;
    panel.setScale(sc);
    p.add(panel);
    const pl = panel.x - panel.displayWidth / 2, ptop = panel.y - panel.displayHeight / 2;
    const gx = pl + gl * sc, gy = ptop + gt * sc, pw = pw0 * sc, ph = ph0 * sc;
    p.add(this.add.text(panel.x, 62, `外卖箱 6×4　　带出价值 ${this.run.value}`, { fontFamily: FONT, fontSize: '26px', color: '#F3E9D2', stroke: '#2B1D16', strokeThickness: 5 }).setOrigin(0.5));
    for (const it of this.run.bag) {
      const x = gx + it.gx * pw, y = gy + it.gy * ph, w = it.gw * pw, hh = it.gh * ph, cx = x + w / 2, cy = y + hh / 2;
      p.add(this.add.rectangle(cx, cy, w - 6, hh - 6, RAR[it.r].c, 0.3));
      // 稀有度框：九宫格保住四角，2 倍画再缩一半让角不显得太粗
      const fk = `inventory_rarity_${RAR_KEY[it.r]}`;
      p.add(this.add.nineslice(cx, cy, fk, contentFrame(this, fk), (w - 2) * 2, (hh - 2) * 2, 34, 34, 34, 34).setScale(0.5));
      const icon = ITEM_ICON[it.name];
      if (icon) p.add(ui(this, cx, cy - 2, icon, Math.min(w, hh) * 0.72));
      else p.add(this.add.text(cx, cy - 4, it.name, { fontFamily: FONT, fontSize: '14px', color: '#2B1D16', align: 'center', stroke: '#F3E9D2', strokeThickness: 3, wordWrap: { width: w - 14, useAdvancedWrap: true } }).setOrigin(0.5));
      p.add(this.add.text(x + w - 7, y + hh - 6, String(it.v), { fontFamily: FONT, fontSize: '12px', color: '#F3E9D2', stroke: '#2B1D16', strokeThickness: 3 }).setOrigin(1, 1));
    }
    // 护心镜保险格（2×2）：原型还没有保险格逻辑，只摆出来
    const sx = pl + panel.displayWidth + 95;
    p.add(ui(this, sx, 330, 'inventory_safe', 150));
    p.add(this.add.text(sx, 420, '护心镜 2×2\n（保险格，原型未启用）', { fontFamily: FONT, fontSize: '16px', color: '#CDB78A', align: 'center' }).setOrigin(0.5, 0));
    p.add(this.add.text(W / 2, H - 22, TOUCH ? '死了全部丢失，撤离才算数。点空白处关闭' : '死了全部丢失，撤离才算数。Tab 关闭', { fontFamily: FONT, fontSize: '18px', color: '#CDB78A' }).setOrigin(0.5));
    this.panel = { kind: 'bag', c: p };
  }

  // ---------- 结算 ----------
  endRun(win) {
    if (this.over) return;
    this.over = true;
    this.closePanel();
    this.paused = true;
    const run = this.run;
    const secs = Math.round((this.time.now - run.t0) / 1000);
    const p = this.add.container(0, 0).setDepth(9500);
    p.add(this.add.rectangle(W / 2, H / 2, W, H, win ? 0x0d2a30 : 0x2a0d0d, 0.82));
    if (win) { this.ring(this.hero.x, this.hero.y - 30, C.cyan, 400, 700, 10); this.tweens.add({ targets: this.hero.spr, alpha: 0, scale: 0.2, duration: 600 }); }
    else { this.setPose(this.hero.spr, 'hero_down', this.hero.faceX); this.hero.spr.setRotation(0).setAlpha(1).clearTint(); }
    p.add(this.add.text(W / 2, 120, win ? '撤离成功' : '被历史抹除', { fontFamily: FONT, fontSize: '64px', color: win ? '#3EC6E0' : '#E74C3C', stroke: '#2B1D16', strokeThickness: 10 }).setOrigin(0.5));
    const kept = win ? run.value : 0;
    const soulNames = run.souls.map(id => SOULS.find(s => s.id === id).n).join('、') || '无';
    const lines = [
      `走过 ${run.room} 间营帐　击败 ${run.kills} 人　用时 ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`,
      `将魂：${soulNames}`,
      `历史修正力：${Math.round(run.correction)}`,
      win ? `带回庄园：${run.bag.length} 件，价值 ${kept}` : `行囊里的 ${run.bag.length} 件东西（价值 ${run.value}）全部丢失`,
    ];
    p.add(this.add.text(W / 2, 250, lines.join('\n'), { fontFamily: FONT, fontSize: '24px', color: '#F3E9D2', align: 'center', lineSpacing: 14 }).setOrigin(0.5, 0));
    const best = run.bag.slice().sort((a, b) => b.v - a.v).slice(0, 6);
    best.forEach((it, i) => {
      const x = W / 2 + (i - (best.length - 1) / 2) * 140;
      p.add(this.add.rectangle(x, 500, 124, 56, RAR[it.r].c, win ? 1 : 0.35).setStrokeStyle(3, C.ink));
      const icon = ITEM_ICON[it.name];
      if (icon) p.add(ui(this, x - 38, 500, icon, 48).setAlpha(win ? 1 : 0.5));
      p.add(this.add.text(icon ? x + 18 : x, 500, it.name, { fontFamily: FONT, fontSize: icon ? '15px' : '17px', color: '#2B1D16' }).setOrigin(0.5));
    });
    const again = this.add.text(W / 2, 620, TOUCH ? '点击再来一局' : '点击或按 Enter 再来一局', { fontFamily: FONT, fontSize: '28px', color: '#F3E9D2', stroke: '#2B1D16', strokeThickness: 6 }).setOrigin(0.5);
    p.add(again);
    this.tweens.add({ targets: again, alpha: 0.4, duration: 700, yoyo: true, repeat: -1 });
    this.time.delayedCall(700, () => {
      const restart = () => { this.over = false; this.scene.restart(); };
      this.input.keyboard.once('keydown-ENTER', restart);
      this.input.once('pointerdown', restart);
    });
    window.__result = { win, value: kept, rooms: run.room, kills: run.kills };
  }

  // ---------- 碰撞 ----------
  blocked(x, y, r) {
    if (x < ARENA.l + r || x > ARENA.r - r || y < ARENA.t || y > ARENA.b) return true;
    return this.obstacles.some(o => Math.hypot(o.x - x, o.y - y) < o.r + r);
  }

  moveActor(a, dx, dy) {
    a.x += dx; a.y += dy;
    for (const o of this.obstacles) {
      const ox = a.x - o.x, oy = a.y - o.y, d = Math.hypot(ox, oy), m = o.r + a.r;
      if (d < m && d > 0.001) { a.x = o.x + ox / d * m; a.y = o.y + oy / d * m; }
    }
    const top = a === this.hero && this.cleared && this.doors.some(d => Math.abs(a.x - d.x) < 40) ? ARENA.t - 40 : ARENA.t;
    a.x = R.Clamp(a.x, ARENA.l + a.r, ARENA.r - a.r);
    a.y = R.Clamp(a.y, top, ARENA.b);
  }

  separate() {
    const es = this.enemies;
    for (let i = 0; i < es.length; i++) for (let j = i + 1; j < es.length; j++) {
      const a = es[i], b = es[j];
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), m = a.r + b.r;
      if (d < m && d > 0.01) { const p = (m - d) / 2; a.x -= dx / d * p; a.y -= dy / d * p; b.x += dx / d * p; b.y += dy / d * p; }
    }
  }

  // ---------- 绘制 ----------
  render() {
    const sg = this.shadowG, fx = this.fxG, h = this.hero;
    sg.clear(); fx.clear();
    sg.fillStyle(C.ink, 0.28);
    sg.fillEllipse(h.x, h.y, 50, 16);
    for (const e of this.enemies) sg.fillEllipse(e.x, e.y, e.r * 2.6, e.r * 0.8);
    for (const c of this.chests) sg.fillEllipse(c.x, c.y, 60, 14);

    // 锚点
    if (this.anchor) {
      const a = this.anchor, t = this.time.now / 1000;
      fx.lineStyle(3, C.cyan, 0.5 + Math.sin(t * 3) * 0.3); fx.strokeEllipse(a.x, a.y, 196 + Math.sin(t * 3) * 8, 100 + Math.sin(t * 3) * 4);
      for (let i = 0; i < 5; i++) {
        const ang = t * 1.7 + i * 1.256;
        fx.fillStyle(0xffffff, 0.7); fx.fillCircle(a.x + Math.cos(ang) * 92, a.y + Math.sin(ang) * 50, 3);
      }
      if (a.prog > 0) {
        fx.lineStyle(10, C.cyan, 1); fx.beginPath();
        fx.arc(a.x, a.y - 150, 34, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (a.prog / a.need)); fx.strokePath();
      }
    }

    // 敌人预警
    for (const e of this.enemies) {
      if (e.state !== 'windup' || e.stun > 0) continue;
      const k = 1 - e.t / e.def.windup;
      const ex = e.x, ey = e.y - 18;
      if (e.type === 'spear') {
        fx.fillStyle(C.red, 0.18 + 0.3 * k);
        fx.slice(ex, ey, 100, e.dir - 0.55, e.dir + 0.55, false); fx.fillPath();
      } else if (e.type === 'archer') {
        fx.lineStyle(2 + 2 * k, C.red, 0.4 + 0.5 * k);
        fx.lineBetween(e.x, e.y - 40, e.x + Math.cos(e.dir) * 640, e.y - 40 + Math.sin(e.dir) * 640);
      } else if (e.type === 'cav') {
        const px = -Math.sin(e.dir) * 30, py = Math.cos(e.dir) * 30, lx = Math.cos(e.dir) * 380, ly = Math.sin(e.dir) * 380;
        fx.fillStyle(C.red, 0.15 + 0.3 * k);
        fx.fillPoints([{ x: e.x + px, y: e.y + py }, { x: e.x + px + lx, y: e.y + py + ly }, { x: e.x - px + lx, y: e.y - py + ly }, { x: e.x - px, y: e.y - py }], true);
      } else if (e.type === 'guard') {
        fx.fillStyle(C.cyan, 0.12); fx.fillCircle(e.x, e.y, 120);
        fx.fillStyle(C.red, 0.35); fx.fillCircle(e.x, e.y, 120 * k);
        fx.lineStyle(3, C.red, 0.8); fx.strokeCircle(e.x, e.y, 120);
      }
    }

    // 箭
    const tg = this.topG; tg.clear();
    for (const a of this.arrows) {
      const l = Math.hypot(a.vx, a.vy), ux = a.vx / l, uy = a.vy / l;
      if (a.wave) { // 刀气：一道月牙
        const d = Math.atan2(uy, ux);
        tg.fillStyle(C.paper, 0.9); tg.beginPath(); tg.arc(a.x - ux * 30, a.y - uy * 30, 46, d - 1, d + 1, false); tg.arc(a.x - ux * 44, a.y - uy * 44, 46, d + 0.9, d - 0.9, true); tg.closePath(); tg.fillPath();
        tg.lineStyle(3, C.shu, 1); tg.beginPath(); tg.arc(a.x - ux * 30, a.y - uy * 30, 46, d - 1, d + 1, false); tg.strokePath();
        continue;
      }
      tg.lineStyle(a.hero ? 5 : 3, a.hero ? C.cyan : C.ink, 1);
      tg.lineBetween(a.x - ux * 30, a.y - uy * 30, a.x, a.y);
      tg.fillStyle(a.hero ? 0xffffff : C.red, 1); tg.fillCircle(a.x, a.y, 3);
    }
    // 血条、架势条
    for (const e of this.enemies) {
      if (e.spawnT > 0) continue;
      const bw = e.def.elite ? 70 : 44, by = e.y - CHAR_H * e.def.k - 12;
      if (e.hp < e.maxHp || e.def.elite) {
        tg.fillStyle(C.ink, 0.85); tg.fillRect(e.x - bw / 2 - 2, by - 2, bw + 4, 9);
        tg.fillStyle(C.hp, 1); tg.fillRect(e.x - bw / 2, by, bw * Math.max(0, e.hp / e.maxHp), 5);
      }
      if (e.maxGuard) {
        tg.fillStyle(C.ink, 0.85); tg.fillRect(e.x - bw / 2 - 2, by + 8, bw + 4, 7);
        tg.fillStyle(e.broken > 0 ? 0x777777 : 0xF1C40F, 1);
        tg.fillRect(e.x - bw / 2, by + 9, bw * (e.broken > 0 ? e.broken / 3 : e.guard / e.maxGuard), 4);
      }
      if (e.stun > 0) {
        for (let i = 0; i < 3; i++) { const a = this.time.now / 200 + i * 2.1; tg.fillStyle(0xF1C40F, 1); tg.fillCircle(e.x + Math.cos(a) * 18, by - 12 + Math.sin(a) * 5, 3); }
      }
    }
    // 箱子提示
    const c = this.nearChest();
    if (c && !c.opened) {
      this.hint.setText(TOUCH ? `点“搜”搜索${c.def.name}` : `E 搜索${c.def.name}`).setVisible(true);
    } else if (this.anchor) {
      this.hint.setText('站进青色裂隙里撑住！').setVisible(true);
    } else this.hint.setVisible(false);
  }

  // V01 刀光：三段各一张，第三段金色；重击用第二段放大偏暖
  slashFx(x, y, a) {
    const heavy = a.kind === 'heavy';
    const key = heavy ? 'slash_combo2' : 'slash_combo' + a.step;
    // 弧线凸面（出刀方向）在原图里的朝向
    const fwd = key === 'slash_combo1' ? -2.36 : Math.PI;
    const k = a.reach / 62 * (heavy ? 1.15 : 1);
    const im = art(this, x + Math.cos(a.dir) * a.reach * 0.45, y + Math.sin(a.dir) * a.reach * 0.45, key, k)
      .setOrigin(0.5).setRotation(a.dir - fwd).setDepth(this.hero.y + 2);
    if (heavy) im.setTint(a.charged ? 0xFFD27A : 0xFFF1C8);
    this.tweens.add({ targets: im, alpha: 0, scale: im.scale * 1.08, duration: heavy ? 220 : 160, onComplete: () => im.destroy() });
  }

  // 一次性特效贴图：放大淡出
  fxImage(x, y, key, k, ms) {
    const im = art(this, x, y, key, k).setOrigin(0.5).setRotation(rnd(-0.4, 0.4)).setDepth(4100);
    this.tweens.add({ targets: im, alpha: 0, scale: im.scale * 1.25, duration: ms, onComplete: () => im.destroy() });
  }

  // V02 破字印章：砸下来再淡出
  stamp(x, y) {
    const im = art(this, x, y, 'hit_breakseal', 0.55).setOrigin(0.5).setDepth(6100).setRotation(rnd(-0.15, 0.15));
    const s = im.scale;
    im.setScale(s * 2).setAlpha(0);
    this.tweens.add({ targets: im, scale: s, alpha: 1, duration: 120, ease: 'Back.easeIn',
      onComplete: () => this.tweens.add({ targets: im, alpha: 0, delay: 650, duration: 300, onComplete: () => im.destroy() }) });
  }

  ring(x, y, color, r, ms, lw = 5) {
    const g = this.add.graphics().setDepth(4200);
    const o = { k: 0 };
    this.tweens.add({ targets: o, k: 1, duration: ms, onUpdate: () => { g.clear(); g.lineStyle(lw * (1 - o.k) + 1, color, 1 - o.k); g.strokeEllipse(x, y, r * 2 * o.k, r * 1.2 * o.k); }, onComplete: () => g.destroy() });
  }

  floatText(x, y, s, color, size = 20) {
    const t = this.add.text(x, y, s, { fontFamily: FONT, fontSize: size + 'px', color, stroke: '#2B1D16', strokeThickness: 5, fontStyle: 'bold' }).setOrigin(0.5).setDepth(6000);
    this.tweens.add({ targets: t, y: y - 40, alpha: 0, duration: 750, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
  }

  toast(s, color = '#F3E9D2') {
    const y = 120 + (this.toastN = ((this.toastN || 0) + 1) % 3) * 30;
    const t = this.add.text(W / 2, y + 90, s, { fontFamily: FONT, fontSize: '22px', color, stroke: '#2B1D16', strokeThickness: 5 }).setOrigin(0.5).setDepth(8000);
    this.tweens.add({ targets: t, alpha: 0, delay: 1800, duration: 500, onComplete: () => t.destroy() });
  }

  banner(title, sub) {
    const c = this.add.container(W / 2, 300).setDepth(8500);
    const bg = this.add.rectangle(0, 0, 560, 100, 0x16110d, 0.75).setStrokeStyle(3, C.ink);
    const t = this.add.text(0, -16, title, { fontFamily: FONT, fontSize: '36px', color: '#F3E9D2', stroke: '#2B1D16', strokeThickness: 6 }).setOrigin(0.5);
    const s = this.add.text(0, 28, sub, { fontFamily: FONT, fontSize: '19px', color: '#CDB78A' }).setOrigin(0.5);
    c.add([bg, t, s]);
    this.tweens.add({ targets: c, alpha: 0, delay: 1400, duration: 500, onComplete: () => c.destroy() });
  }

  // ---------- HUD ----------
  buildHud() {
    this.hud = this.add.graphics().setDepth(7000);
    const st = (x, y, s, size = 18, color = '#F3E9D2') => this.add.text(x, y, s, { fontFamily: FONT, fontSize: size + 'px', color, stroke: '#2B1D16', strokeThickness: 4 }).setDepth(7002);
    const img = (x, y, key, width) => ui(this, x, y, key, width).setDepth(7001);
    // U01 条：外框 + 九宫格填充（外框内腔按 256×48 图量得）
    const bar = (cx, cy, width, frameKey, fillKey, inner) => {
      const f = img(cx, cy, frameKey, width), k = f.scale;
      const x0 = cx - f.displayWidth / 2 + inner[0] * k, w = (inner[1] - inner[0]) * k;
      const y = cy - f.displayHeight / 2 + (inner[2] + inner[3]) / 2 * k, h = (inner[3] - inner[2]) * k;
      const fill = this.add.nineslice(x0, y, fillKey, contentFrame(this, fillKey), w, h, 8, 8, 0, 0).setOrigin(0, 0.5).setDepth(7000);
      return { fill, w, h };
    };
    this.hpBar = bar(150, 36, 256, 'hud_health_frame', 'hud_health_fill', [49, 203, 17, 32]);
    this.corrBar = bar(W / 2, 36, 400, 'hud_history_frame', 'hud_history_fill', [51, 202, 17, 32]);
    this.rollPips = [0, 1, 2].map(i => ({ e: img(82 + i * 24, 72, 'hud_roll_empty', 21), f: img(82 + i * 24, 72, 'hud_roll_full', 21) }));
    this.comboImg = img(W - 70, 210, 'hud_combo_frame', 70);
    this.comboText = st(W - 70, 208, '', 30, '#F1C40F').setOrigin(0.5);
    this.comboLb = st(W - 70, 252, '连击', 16).setOrigin(0.5);
    // 道具栏：强光手电、当阳一吼
    this.slotTorch = img(48, H - 46, 'hud_slot_frame', 56);
    const torchIcon = img(48, H - 48, 'modern_flashlight', 40);
    this.torchText = st(66, H - 32, '', 15).setOrigin(1, 0.5);
    const torchKey = st(30, H - 82, 'F', 15, '#CDB78A');
    if (TOUCH) [this.slotTorch, torchIcon, this.torchText, torchKey].forEach(o => o.setVisible(false));
    this.slotRoar = img(110, H - 46, 'hud_slot_frame', 56);
    this.roarIcon = img(110, H - 48, 'door_spirit', 40);
    this.roarText = st(110, H - 82, 'Q', 15, '#CDB78A').setOrigin(0.5, 0);
    this.hpText = st(150, 36, '', 13).setOrigin(0.5);
    this.corrText = st(W / 2, 36, '', 13, '#F3E9D2').setOrigin(0.5);
    this.roomText = st(W - 30, 12, '', 18).setOrigin(1, 0);
    this.bagText = st(W - 30, 38, '', 16, '#CDB78A').setOrigin(1, 0);
    this.soulText = st(150, H - 34, '', 18, '#9FD3A8');
    this.qText = st(170, 64, '', 15, '#F3E9D2');
    this.hint = this.add.text(W / 2, H - 46, '', { fontFamily: FONT, fontSize: '22px', color: '#F3E9D2', stroke: '#2B1D16', strokeThickness: 5, backgroundColor: 'rgba(22,17,13,0.55)', padding: { x: 12, y: 4 } }).setOrigin(0.5).setDepth(7001);
  }

  setBar(b, v) {
    v = R.Clamp(v, 0, 1);
    b.fill.setVisible(v > 0.02);
    if (v > 0.02) b.fill.setSize(Math.max(18, b.w * v), b.h);
  }

  drawHud() {
    const g = this.hud, h = this.hero, run = this.run;
    g.clear();
    this.setBar(this.hpBar, h.hp / h.maxHp);
    this.hpText.setText(`体力 ${Math.ceil(h.hp)}/${h.maxHp}`);
    const cap = this.dodgeCap();
    this.rollPips.forEach((p, i) => { p.e.setVisible(i < cap); p.f.setVisible(i < cap && i < h.dodges); });
    this.setBar(this.corrBar, run.correction / 100);
    this.corrBar.fill.setAlpha(run.correction >= 75 ? 0.7 + 0.3 * Math.sin(this.time.now / 120) : 1);
    this.corrText.setText(`历史修正力 ${Math.floor(run.correction)}`);
    const showCombo = h.chainT > 0 && h.chain >= 2;
    [this.comboImg, this.comboText, this.comboLb].forEach(o => o.setVisible(showCombo));
    this.comboText.setText(String(h.chain));
    this.torchText.setText('×' + h.torch);
    this.slotTorch.setAlpha(h.torch > 0 ? 1 : 0.4);
    [this.slotRoar, this.roarIcon, this.roarText].forEach(o => o.setVisible(!TOUCH && this.has('hou')));
    this.roarIcon.setAlpha(h.rage >= 100 ? 1 : 0.35);
    this.roomText.setText(`第 ${run.room} 间 · ${this.roomName || ''}`);
    this.bagText.setText(`行囊 ${run.bag.length} 件 · 价值 ${run.value}${TOUCH ? '' : '　[Tab]'}`);
    this.soulText.setText(run.souls.length ? '将魂：' + run.souls.map(id => SOULS.find(s => s.id === id).n).join('  ') : '');
    // 怒气
    g.fillStyle(C.ink, 1); g.fillRect(166, 84, 128, 10);
    g.fillStyle(0x4a2a1a, 1); g.fillRect(168, 86, 124, 6);
    g.fillStyle(h.rage >= 100 ? 0xF39C12 : 0xC0602A, 1); g.fillRect(168, 86, 124 * h.rage / 100, 6);
    if (h.charge >= 0) { // 蓄力圈
      g.lineStyle(5, h.charge >= 1 ? 0xF1C40F : C.paper, 1); g.beginPath();
      g.arc(h.x, h.y - 130, 16, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, h.charge)); g.strokePath();
    }
    this.qText.setText(`怒 ${Math.floor(h.rage)}${this.has('hou') && h.rage >= 100 ? '　Q 就绪' : ''}`);
    // 修正力 75 以上的紫色边缘
    if (run.correction >= 75) {
      const a = 0.12 + 0.08 * Math.sin(this.time.now / 200) + (run.correction >= 100 ? 0.15 : 0);
      g.lineStyle(40, C.purple, a); g.strokeRect(0, 0, W, H);
    }
  }
}

const game = new Phaser.Game({
  type: Phaser.WEBGL,
  parent: 'game',
  width: W, height: H,
  backgroundColor: '#16110d',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  input: { activePointers: 4 }, // 触屏多指：摇杆 + 攻击 + 翻滚
  scene: [Title, Run],
});
window.__game = game;
})();
