# 霓虹打砖块 · Neon Brick Breaker

A polished single-file HTML5 brick breaker with a neon-synthwave aesthetic.
8 hand-designed levels, 6 power-ups, combo scoring, Web-Audio SFX, and full mobile / keyboard support.

## 🎮 Play

https://hackercds.github.io/HTML-KING/

## ✨ Features

- **8 levels** — 序章 / 三角阵 / 菱形之舞 / 霓虹心 / 堡垒 / 星星坠落 / 螺旋回廊 / 终章
- **6 power-ups** — 挡板变长 / 变短 / 多球 / 慢球 / 穿透 / 激光炮
- **Combo system** — 连击触发分数倍率
- **Particle FX** — 砖块爆炸、屏幕震动、拖尾光效
- **Synthesized audio** — 用 Web Audio API 现场生成，零外部资源
- **Touch & keyboard** — 鼠标、触屏、方向键 / `WASD`、空格发射、`P` 暂停、`M` 静音
- **Persistent state** — 最高分、解锁进度、设置都存 localStorage

## 🎯 Controls

| Action      | Mouse / Touch | Keyboard             |
|-------------|---------------|----------------------|
| Move paddle | Drag          | `←` `→` / `A` `D`    |
| Launch ball | Click / tap   | `Space` / `Enter`    |
| Pause       |               | `P` / `Esc`          |
| Mute        |               | `M`                  |

## 🛠 Tech

Single `index.html` · vanilla JS + Canvas 2D · no build step · no dependencies · 41 KB.
