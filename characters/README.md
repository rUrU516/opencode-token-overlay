# Token Character API

角色系统由两部分组成：

- `character-framework.js`：注册表、生命周期、阶段切分和每圈轮换。
- `roster.js`：当前内置的 10 个角色。

新增角色时创建 JavaScript 文件并调用：

```js
window.TokenCharacters.register({
  id: "my-character",
  name: "My Character",
  viewBox: "0 0 64 64",
  width: 36,
  height: 42,
  bottom: 39,
  svg: `<g class="character-body">...</g>`,
  css: `/* optional character-specific CSS */`,
  burstPose({ phase, progress, overall, startX, endX }) {
    // phase: resist | launch | tumble | land
    return { x: startX, y: 0, rotate: 0, scaleX: 1, scaleY: 1 }
  },
  render(root, { phase, progress, overall, now }) {
    // Optional: update SVG joints or character-specific details each frame.
  },
})
```

然后在 `index.html` 中将该脚本放在 `character-framework.js` 之后、`renderer.js` 之前加载。注册顺序就是每跑完一轮后的轮换顺序。

统一阶段：

1. `idle`：没有 Token 增量。
2. `run`：跟随当前进度前沿。
3. `resist`：满条后在终点抵抗回吹。
4. `launch`：失衡起飞。
5. `tumble`：空中回吹。
6. `land`：在下一轮当前进度位置落地。

落地后框架会统一追加两个切换阶段：

7. `disperse`：旧角色分解为主题色像素粒子并向外散开。
8. `assemble`：中点挂载下一个角色，粒子按新角色尺寸收束并逐步显形。

这两个阶段由框架实现，角色通常无需提供额外代码。若希望粒子更贴合自定义轮廓，可在注册定义中提供相对角色中心的像素点集 `particles: [{ x, y }, ...]`；未提供时框架会根据角色宽高生成稳定的椭圆轮廓采样。

角色只能负责视觉表现，不应修改 Token、圈数或 `bursting`。真实 Usage 在回吹和粒子重组期间继续进入 `target`，只有显示值 `shown` 暂停推进。
