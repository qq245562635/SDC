# T001 WebGL 玩法原型

虎牢关一局搜打撤。Phaser 3.80.1（CDN），无构建步骤。

## 运行

- Windows：双击 `start.bat`，浏览器打开 http://localhost:8000/
- 其他：在本目录运行 `python3 -m http.server 8000`

不能直接双击 `index.html`：Chrome 禁止 file:// 页面读取本地贴图。

## 操作

WASD 移动 · 鼠标瞄准 · 左键/J 连击 · 右键/K 重击（温酒斩华雄时按住蓄力） · 空格 翻滚 · E 搜箱 · F 强光手电 · Q 当阳一吼 · Tab 背包 · 1/2/3 选将魂

## 调试

控制台里 `__run` 是当前局（Run 场景），`__result` 是上一局结算。

## 文件

- `game.js`：全部逻辑，数据表在文件顶部（敌人、物品、宝箱、将魂、营门）。
- `assets/`：`tools/extract_sprites.py` 从 `art/concept/batch1/` 切出，别手改。
