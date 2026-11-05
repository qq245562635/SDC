// 拆件骨骼动画（T006）。数据来自 T004 assets.json（tools/sync_art.py → window.ART / window.RIGS）。
// 结构按 Godot 设计，方便移植：
//   RigSprite（Node2D）
//   └ inner：朝向镜像 + 显示倍率
//     └ root（Skeleton2D 根骨）→ body → head / arm_l / arm_r → weapon / leg_l / leg_r / back（各为 Bone2D，下挂 Sprite2D，z_index = 部件 z）
//   AnimPlayer ≈ AnimationPlayer：动作 = 若干轨道 "骨骼.属性"（x / y / rot / sx / sy），关键帧 [时间秒, 值]；
//   play(动作, { blend, speed, restart }) ≈ play(name, custom_blend, custom_speed)，blend 为交叉过渡秒数。
// 骨骼静止位置全部由数据算出，不做手调；动作只叠加相对静止姿势的偏移。单位：1080p 显示像素、弧度。
// 角色朝右；rot 为正 = 顺时针：手臂/腿往后摆，身体往前倾。
// 腿的 rot 相对地面：身体前倾时腿自动抵消身体转角，脚不跟着甩（clip.free = true 时不抵消，例如翻滚）。
(() => {
'use strict';
const ART = window.ART, RIGS = window.RIGS;
const ATTACH = { head: 'neck', arm_l: 'shoulder_l', arm_r: 'shoulder_r', leg_l: 'hip_l', leg_r: 'hip_r' };
const DEF = { x: 0, y: 0, rot: 0, sx: 1, sy: 1 };
const TAU = Math.PI * 2;
const wrap = a => a - TAU * Math.round(a / TAU);

// ---------- 骨架：按数据拼装 ----------
function skeleton(c) {
  const R = RIGS[c], P = {};
  R.parts.forEach(k => { P[k.slice(c.length + 1)] = Object.assign({ key: k }, ART[k]); });
  const b = P.body, rel = (p, q) => [p[0] - q[0], p[1] - q[1]];
  const bones = {
    root: { parent: null, rest: [0, 0] },
    body: { parent: 'root', rest: R.body, part: b, pivot: b.j },
  };
  for (const [p, key] of Object.entries(ATTACH)) bones[p] = { parent: 'body', rest: rel(b.a[key], b.j), part: P[p], pivot: P[p].j, leg: p.startsWith('leg') };
  // 武器 grip 对齐近侧臂 hand
  bones.weapon = { parent: 'arm_r', rest: rel(P.arm_r.hand, P.arm_r.j), part: P.weapon, pivot: P.weapon.grip };
  // 背饰按 rest_position 跟身体走
  if (P.back) bones.back = { parent: 'body', rest: rel(P.back.r, b.r), part: P.back, pivot: P.back.j };
  return bones;
}

// ---------- 动作 ----------
const clip = (len, loop, tracks) => ({ len, loop, tracks });
function sampleKeys(k, t) {
  if (t <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++) {
    if (t > k[i][0]) continue;
    const [t0, v0] = k[i - 1], [t1, v1] = k[i];
    const u = (t - t0) / (t1 - t0 || 1), s = u * u * (3 - 2 * u); // 关键帧之间缓入缓出
    return v0 + (v1 - v0) * s;
  }
  return k[k.length - 1][1];
}

// 走 / 跑：交替迈腿、反向摆臂、身体在两脚交叉时升起。len = 一个完整步态周期（两步）
function gait({ len, leg, arm, armR = arm, bob, lean = 0, weapon = 0 }) {
  const h = len / 2, q = len / 4;
  return clip(len, true, {
    'leg_l.rot': [[0, -leg], [h, leg], [len, -leg]],
    'leg_r.rot': [[0, leg], [h, -leg], [len, leg]],
    'arm_l.rot': [[0, arm], [h, -arm], [len, arm]],
    'arm_r.rot': [[0, -armR], [h, armR], [len, -armR]],
    'weapon.rot': [[0, weapon], [len, weapon]],
    'body.y': [[0, 0], [q, -bob], [h, 0], [h + q, -bob], [len, 0]],
    'body.rot': [[0, lean], [len, lean]],
    'head.rot': [[0, -lean * 0.6], [len, -lean * 0.6]],
  });
}
// 待机呼吸：身体轻微下沉，腿反向抵消，脚不离地
const idle = (b = 1.2) => clip(2, true, {
  'body.y': [[0, 0], [1, b], [2, 0]],
  'leg_l.y': [[0, 0], [1, -b], [2, 0]], 'leg_r.y': [[0, 0], [1, -b], [2, 0]],
  'arm_l.rot': [[0, 0], [1, 0.05], [2, 0]], 'arm_r.rot': [[0, 0], [1, -0.04], [2, 0]],
  'head.rot': [[0, 0], [1, 0.03], [2, 0]],
});
const hurt = () => clip(0.3, false, {
  'root.x': [[0, 0], [0.06, -4], [0.3, -1]],
  'body.rot': [[0, 0], [0.06, -0.28], [0.3, -0.08]],
  'head.rot': [[0, 0], [0.06, -0.3], [0.3, -0.1]],
  'arm_l.rot': [[0, 0], [0.06, 0.7], [0.3, 0.2]],
  'arm_r.rot': [[0, 0], [0.06, 0.6], [0.3, 0.15]],
  'leg_l.rot': [[0, 0], [0.06, -0.25], [0.3, -0.05]],
});
// 倒地：向后仰倒，落地轻弹一下
const down = () => clip(0.6, false, {
  'root.rot': [[0, 0], [0.12, -0.25], [0.38, -1.62], [0.48, -1.45], [0.6, -1.52]],
  'root.y': [[0, 0], [0.38, -14], [0.6, -12]],
  'body.rot': [[0, 0], [0.38, 0.1], [0.6, 0.05]],
  'head.rot': [[0, 0], [0.38, -0.2], [0.5, 0.1], [0.6, 0]],
  'arm_l.rot': [[0, 0], [0.3, -1.2], [0.6, -0.9]],
  'arm_r.rot': [[0, 0], [0.3, -0.9], [0.6, -0.6]],
  'leg_l.rot': [[0, 0], [0.3, -0.7], [0.6, -0.4]],
  'leg_r.rot': [[0, 0], [0.3, -0.3], [0.6, -0.1]],
});

// 主角：刀在近侧（后侧）手里。动作长度 = 游戏里的出手时长，命中帧对齐 hitAt
const HERO = {
  idle: idle(),
  run: gait({ len: 0.5, leg: 0.6, arm: 0.7, armR: 0.5, bob: 4, lean: 0.12 }),
  // 一段：从后上方横劈到前方（命中 0.07）
  attack1: clip(0.22, false, {
    'arm_r.rot': [[0, 1.3], [0.07, -1.7], [0.22, -1.3]],
    'arm_l.rot': [[0, -0.3], [0.07, 0.5], [0.22, 0.3]],
    'body.rot': [[0, -0.08], [0.07, 0.16], [0.22, 0.1]],
    'head.rot': [[0, 0.05], [0.07, -0.08], [0.22, -0.04]],
    'leg_l.rot': [[0, 0], [0.07, -0.3], [0.22, -0.25]],
    'leg_r.rot': [[0, 0], [0.07, 0.25], [0.22, 0.2]],
  }),
  // 二段：由下往上反撩
  attack2: clip(0.22, false, {
    'arm_r.rot': [[0, 0.5], [0.07, -2.5], [0.22, -2.2]],
    'weapon.rot': [[0, 0], [0.07, -0.4], [0.22, -0.3]],
    'arm_l.rot': [[0, 0.3], [0.07, -0.4], [0.22, -0.3]],
    'body.rot': [[0, 0.12], [0.07, -0.1], [0.22, -0.06]],
    'body.y': [[0, 3], [0.07, -2], [0.22, 0]],
    'leg_l.y': [[0, -3], [0.07, 2], [0.22, 0]], 'leg_r.y': [[0, -3], [0.07, 2], [0.22, 0]],
    'leg_l.rot': [[0, -0.2], [0.07, -0.35], [0.22, -0.3]],
    'leg_r.rot': [[0, 0.2], [0.07, 0.3], [0.22, 0.25]],
  }),
  // 三段：过头劈下，前冲一步（命中 0.07，时长 0.32）
  attack3: clip(0.32, false, {
    'arm_r.rot': [[0, 2.7], [0.07, -1.1], [0.2, -0.9], [0.32, -0.7]],
    'weapon.rot': [[0, -0.3], [0.07, 0.3], [0.32, 0.2]],
    'arm_l.rot': [[0, -0.8], [0.07, 0.7], [0.32, 0.4]],
    'body.rot': [[0, -0.15], [0.07, 0.32], [0.32, 0.22]],
    'body.y': [[0, -2], [0.07, 5], [0.32, 3]],
    'root.x': [[0, -4], [0.07, 6], [0.32, 4]],
    'head.rot': [[0, 0.1], [0.07, -0.15], [0.32, -0.1]],
    'leg_l.rot': [[0, 0], [0.07, -0.55], [0.32, -0.5]],
    'leg_r.rot': [[0, 0], [0.07, 0.5], [0.32, 0.45]],
    'leg_l.y': [[0, 0], [0.07, -4], [0.32, -3]], 'leg_r.y': [[0, 0], [0.07, -4], [0.32, -3]],
  }),
  // 重击：后仰蓄力，0.24 砸下
  heavy: clip(0.48, false, {
    'arm_r.rot': [[0, 0], [0.18, 2.9], [0.24, -1.0], [0.48, -0.8]],
    'weapon.rot': [[0, 0], [0.18, -0.4], [0.24, 0.4], [0.48, 0.3]],
    'arm_l.rot': [[0, 0], [0.18, -1.2], [0.24, 0.6], [0.48, 0.4]],
    'body.rot': [[0, 0], [0.18, -0.2], [0.24, 0.38], [0.48, 0.3]],
    'body.y': [[0, 0], [0.18, -3], [0.24, 7], [0.48, 6]],
    'root.x': [[0, 0], [0.18, -5], [0.24, 6], [0.48, 6]],
    'head.rot': [[0, 0], [0.18, 0.12], [0.24, -0.15], [0.48, -0.12]],
    'leg_l.rot': [[0, 0], [0.18, -0.2], [0.24, -0.6], [0.48, -0.55]],
    'leg_r.rot': [[0, 0], [0.18, 0.1], [0.24, 0.55], [0.48, 0.5]],
    'leg_l.y': [[0, 0], [0.18, 3], [0.24, -6], [0.48, -5]], 'leg_r.y': [[0, 0], [0.18, 3], [0.24, -6], [0.48, -5]],
  }),
  // 温酒斩华雄蓄力：保持重击的举刀姿势，微微发抖
  charge: clip(0.12, true, {
    'arm_r.rot': [[0, 2.85], [0.06, 2.95], [0.12, 2.85]],
    'weapon.rot': [[0, -0.4], [0.12, -0.4]],
    'arm_l.rot': [[0, -1.2], [0.12, -1.2]],
    'body.rot': [[0, -0.2], [0.06, -0.17], [0.12, -0.2]],
    'body.y': [[0, -3], [0.12, -3]],
    'root.x': [[0, -5], [0.12, -5]],
    'head.rot': [[0, 0.12], [0.12, 0.12]],
    'leg_l.rot': [[0, -0.2], [0.12, -0.2]], 'leg_r.rot': [[0, 0.1], [0.12, 0.1]],
    'leg_l.y': [[0, 3], [0.12, 3]], 'leg_r.y': [[0, 3], [0.12, 3]],
  }),
  // 翻滚：抱团绕腰前滚一周（0.2 秒），腿跟着身体转
  roll: Object.assign(clip(0.2, false, {
    'body.rot': [[0, 0], [0.2, TAU]],
    'body.y': [[0, 0], [0.05, -16], [0.15, -16], [0.2, 0]],
    'leg_l.rot': [[0, 0], [0.04, -1.4], [0.16, -1.4], [0.2, 0]],
    'leg_r.rot': [[0, 0], [0.04, -1.1], [0.16, -1.1], [0.2, 0]],
    'leg_l.y': [[0, 0], [0.04, -12], [0.16, -12], [0.2, 0]], 'leg_r.y': [[0, 0], [0.04, -12], [0.16, -12], [0.2, 0]],
    'arm_l.rot': [[0, 0], [0.04, -1.3], [0.16, -1.3], [0.2, 0]],
    'arm_r.rot': [[0, 0], [0.04, -1.0], [0.16, -1.0], [0.2, 0]],
    'head.rot': [[0, 0], [0.04, 0.3], [0.16, 0.3], [0.2, 0]],
  }), { free: true }),
  // 搜刮：蹲下弯腰，两手在箱里翻
  loot: clip(0.6, true, {
    'body.y': [[0, 9], [0.6, 9]],
    'body.rot': [[0, 0.35], [0.3, 0.4], [0.6, 0.35]],
    'leg_l.y': [[0, -9], [0.6, -9]], 'leg_r.y': [[0, -9], [0.6, -9]],
    'leg_l.rot': [[0, -0.55], [0.6, -0.55]], 'leg_r.rot': [[0, 0.35], [0.6, 0.35]],
    'head.rot': [[0, 0.15], [0.3, 0.22], [0.6, 0.15]],
    'arm_l.rot': [[0, -1.0], [0.3, -0.6], [0.6, -1.0]],
    'arm_r.rot': [[0, -0.7], [0.3, -1.2], [0.6, -0.7]],
  }),
  hurt: hurt(), down: down(),
};

// 联军兵：两手持枪，近侧手在后握枪尾
const SOLDIER = {
  idle: idle(),
  walk: gait({ len: 0.7, leg: 0.42, arm: 0.1, bob: 2.5, lean: 0.04 }),
  // 前摇：后坐收枪，枪尖压到约 -20°（枪的角度 = 静止约 -40° + 身体 + 近侧臂 + 武器）
  windup: clip(0.3, false, {
    'body.rot': [[0, 0], [0.3, -0.16]],
    'root.x': [[0, 0], [0.3, -5]],
    'arm_r.rot': [[0, 0], [0.3, 0.4]],
    'arm_l.rot': [[0, 0], [0.3, 0.35]],
    'weapon.rot': [[0, 0], [0.3, 0.1]],
    'head.rot': [[0, 0], [0.3, 0.06]],
    'leg_l.rot': [[0, 0], [0.3, -0.2]], 'leg_r.rot': [[0, 0], [0.3, 0.2]],
  }),
  // 出手：刺击，枪放平前送
  stab: clip(0.14, false, {
    'body.rot': [[0, -0.16], [0.07, 0.2], [0.14, 0.2]],
    'root.x': [[0, -5], [0.07, 9], [0.14, 8]],
    'arm_r.rot': [[0, 0.4], [0.07, -0.6], [0.14, -0.55]],
    'arm_l.rot': [[0, 0.35], [0.07, -0.5], [0.14, -0.45]],
    'weapon.rot': [[0, 0.1], [0.07, 1.0], [0.14, 0.95]],
    'head.rot': [[0, 0.06], [0.07, -0.1], [0.14, -0.1]],
    'leg_l.rot': [[0, -0.2], [0.07, -0.55], [0.14, -0.55]], 'leg_r.rot': [[0, 0.2], [0.07, 0.45], [0.14, 0.45]],
    'leg_l.y': [[0, 0], [0.07, -4], [0.14, -4]], 'leg_r.y': [[0, 0], [0.07, -4], [0.14, -4]],
    'body.y': [[0, 0], [0.07, 4], [0.14, 4]],
  }),
  hurt: hurt(), down: down(),
};

// 弓手：弓在近侧（前侧）手里，远侧手拉弦
const ARCHER = {
  idle: idle(),
  walk: gait({ len: 0.7, leg: 0.42, arm: 0.3, armR: 0.15, bob: 2.5, lean: 0.04 }),
  // 前摇：举弓平伸，弓身保持竖直，拉弦手往后拉满
  draw: clip(0.7, false, {
    'arm_r.rot': [[0, 0], [0.2, -1.45], [0.7, -1.5]],
    'weapon.rot': [[0, 0], [0.2, 1.45], [0.7, 1.5]],
    'arm_l.rot': [[0, 0], [0.2, -1.65], [0.7, -1.15]],
    'body.rot': [[0, 0], [0.2, -0.04], [0.7, -0.09]],
    'head.rot': [[0, 0], [0.2, 0.05], [0.7, 0.05]],
    'leg_l.rot': [[0, 0], [0.2, -0.22], [0.7, -0.22]], 'leg_r.rot': [[0, 0], [0.2, 0.18], [0.7, 0.18]],
  }),
  // 出手：松弦，拉弦手弹回，弓微微后跳
  shoot: clip(0.4, false, {
    'arm_r.rot': [[0, -1.5], [0.05, -1.35], [0.4, -0.4]],
    'weapon.rot': [[0, 1.5], [0.05, 1.3], [0.4, 0.4]],
    'arm_l.rot': [[0, -1.15], [0.05, 0.2], [0.4, 0.05]],
    'body.rot': [[0, -0.09], [0.05, -0.14], [0.4, -0.02]],
    'leg_l.rot': [[0, -0.22], [0.4, -0.05]], 'leg_r.rot': [[0, 0.18], [0.4, 0.05]],
  }),
  hurt: hurt(), down: down(),
};
const CLIPS = { hero: HERO, soldier: SOLDIER, archer: ARCHER };
for (const set of Object.values(CLIPS)) set.rest = clip(1, true, {}); // 静止姿势：只用数据拼装，调试和对照用
const clipsFor = c => CLIPS[c.startsWith('soldier') ? 'soldier' : c];

// ---------- 播放器（≈ AnimationPlayer） ----------
class AnimPlayer {
  constructor(clips) { this.clips = clips; this.name = null; this.clip = null; this.t = 0; this.speed = 1; this.from = null; this.blend = 0; this.bt = 0; this.out = {}; }
  play(name, o = {}) {
    const clip = this.clips[name];
    if (!clip) return this;
    if (name === this.name && !o.restart) { if (o.speed !== undefined) this.speed = o.speed; return this; }
    this.from = this.out; this.blend = o.blend === undefined ? 0.12 : o.blend; this.bt = 0;
    this.name = name; this.clip = clip; this.t = o.at || 0; this.speed = o.speed === undefined ? 1 : o.speed;
    return this;
  }
  get finished() { return !this.clip.loop && this.t >= this.clip.len; }
  advance(dt) {
    const c = this.clip;
    this.t += dt * this.speed;
    this.t = c.loop ? ((this.t % c.len) + c.len) % c.len : Math.min(this.t, c.len);
    const cur = {};
    for (const ch in c.tracks) cur[ch] = sampleKeys(c.tracks[ch], this.t);
    this.bt += dt;
    const w = this.blend > 0 ? Math.min(1, this.bt / this.blend) : 1;
    if (w >= 1 || !this.from) return (this.out = cur);
    // 交叉过渡：上一动作的最后输出 → 当前动作；角度走最短路，翻滚转满一圈后不会倒转回来
    const out = {};
    for (const ch of new Set([...Object.keys(cur), ...Object.keys(this.from)])) {
      const prop = ch.slice(ch.indexOf('.') + 1), d = DEF[prop];
      const a = ch in this.from ? this.from[ch] : d, b = ch in cur ? cur[ch] : d;
      out[ch] = prop === 'rot' ? a + wrap(b - a) * w : a + (b - a) * w;
    }
    return (this.out = out);
  }
}

// ---------- Phaser 显示（≈ Skeleton2D + Bone2D + Sprite2D） ----------
// 接口和原来的姿势 Image 一致：setPosition / setRotation / setAlpha / setDepth / setFlipX / setTint / setTintFill / clearTint / destroy
class RigSprite extends Phaser.GameObjects.Container {
  constructor(scene, x, y, c, scale = 1) {
    super(scene, x, y);
    scene.add.existing(this);
    this.c = c; this.k = scale; this.bones = skeleton(c); this.nodes = {}; this.images = []; this.tintKey = '';
    this.inner = new Phaser.GameObjects.Container(scene, 0, 0).setScale(scale);
    this.add(this.inner);
    for (const [name, b] of Object.entries(this.bones)) this.nodes[name] = new Phaser.GameObjects.Container(scene, b.rest[0], b.rest[1]);
    // 每根骨骼：自己的部件图 + 子骨骼，按部件 z 排序（武器 z6 在近侧臂 z7 的骨骼里，画在手臂下面）
    for (const [name, b] of Object.entries(this.bones)) {
      const items = [];
      if (b.part) {
        const im = new Phaser.GameObjects.Image(scene, 0, 0, b.part.key).setOrigin(b.pivot[0] / b.part.w, b.pivot[1] / b.part.h);
        this.images.push(im); items.push({ z: b.part.z, o: im });
      }
      for (const [cn, cb] of Object.entries(this.bones)) if (cb.parent === name) items.push({ z: cb.part.z, o: this.nodes[cn] });
      items.sort((u, v) => u.z - v.z).forEach(it => this.nodes[name].add(it.o));
    }
    this.inner.add(this.nodes.root);
    this.anim = new AnimPlayer(clipsFor(c));
    this.anim.play('idle', { blend: 0, at: Math.random() * 2 });
    (scene.rigSet || (scene.rigSet = new Set())).add(this);
    this.once('destroy', () => scene.rigSet.delete(this));
    this.tick(0);
  }
  play(name, o) { this.anim.play(name, o); return this; }
  tick(dt) {
    const p = this.anim.advance(dt), counter = this.anim.clip.free ? 0 : (p['body.rot'] || 0);
    for (const [name, b] of Object.entries(this.bones)) {
      const n = this.nodes[name], v = (prop) => p[`${name}.${prop}`];
      const x = v('x'), y = v('y'), r = v('rot'), sx = v('sx'), sy = v('sy');
      n.setPosition(b.rest[0] + (x || 0), b.rest[1] + (y || 0));
      n.setRotation((r || 0) - (b.leg ? counter : 0));
      n.setScale(sx === undefined ? 1 : sx, sy === undefined ? 1 : sy);
    }
    return this;
  }
  get flipX() { return this.inner.scaleX < 0; }
  setFlipX(f) { this.inner.scaleX = (f ? -1 : 1) * this.k; return this; }
  setTintFill(c) { return this.tintAll('f' + c, im => im.setTintFill(c)); }
  setTint(c) { return this.tintAll('t' + c, im => im.setTint(c)); }
  clearTint() { return this.tintAll('', im => im.clearTint()); }
  tintAll(key, fn) { if (this.tintKey !== key) { this.tintKey = key; this.images.forEach(fn); } return this; }
}

window.Rig = { RigSprite, AnimPlayer, skeleton, CLIPS, clipsFor };
})();
