# 霓虹游戏厅 · Neon Arcade

A small collection of polished single-file (or near-single-file) HTML5 games with a unified neon-synthwave aesthetic.
Lives at: <https://show.hackercd.cn/>

## 🎮 Games

| Game | Folder | Description |
|------|--------|-------------|
| **霓虹打砖块** Neon Brick Breaker | [`neon-brick-breaker/`](neon-brick-breaker/) | 8 关经典打砖块 × 6 种道具 × 连击系统 |
| **暗夜战机** Neon Fighter | [`shootit/`](shootit/) | 经典纵版卷轴射击 — 弹幕 / 敌机 / 最高分挑战 |

## ✨ Design Principles

- **Single-file or self-contained folders** — each game is one `index.html` (plus optional sibling `*.js` / `*.css`)
- **No build step, no dependencies** — pure HTML + vanilla JS + Canvas 2D
- **HD rendering** — uses `devicePixelRatio` for crisp output on Retina / HiDPI displays
- **Mobile-first** — touch, pointer, and keyboard all supported; responsive layout
- **Persistent state** — high scores and settings saved to `localStorage`
- **Shared aesthetic** — same neon palette, glow effects, and animation language across games

## 🚀 Deploy

GitHub Pages from `main` branch, root. Custom domain configured via `CNAME` (`show.hackercd.cn`).

## ➕ Add a New Game

1. Create a new folder at the repo root, e.g. `my-game/`
2. Put `index.html` inside (you can also reference sibling `game.js`, `styles.css`, etc.)
3. Add an entry to the `GAMES` array in [`index.html`](index.html):
   ```js
   {
     id: "my-game",
     title: "我的游戏",
     titleEn: "My Game",
     desc: "一句话描述。",
     accent: "#00f0ff",
     gradient: ["#00f0ff", "#ff5af7"],
     tags: ["标签1", "标签2"],
     badge: { text: "PLAY", kind: "" },
     art: "bricks"  // key in the SVG_ART object, or add your own
   }
   ```
4. Commit & push — the portal updates automatically.

## 🛠 Tech

Plain HTML + vanilla JS + Canvas 2D + Web Audio API.
