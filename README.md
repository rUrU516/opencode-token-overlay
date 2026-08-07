# OpenCode Token Overlay

一个面向 macOS 的轻量 Electron 桌面悬浮窗，实时展示 OpenCode V2 当日 Token 总消耗。

## 功能

- 透明、无边框、置顶并可拖拽
- 自动发现本地 OpenCode V2 后台服务
- 通过 HTTP API 汇总当天 Token
- 订阅 `/api/event` 实时接收 Usage 更新
- 1980 年代街机像素 HUD、呼吸和爆满动画
- 每 100,000 Token 填满一轮进度条
- 显示值最高以 10,000 Token/秒追赶真实值
- 右上角显示当天缓存命中率
- 正常增长时在进度前沿喷出老式像素木屑与命中火花

## 运行

要求：macOS、Node.js、正在运行的 OpenCode V2 服务。

```bash
npm install
npm start
```

检查 JavaScript 语法：

```bash
npm run check
```

## 数据口径

启动时通过 `/api/session` 和 `/api/session/{id}/message` 汇总本地时区当天用量，随后订阅 `/api/event` 中的 `session.usage.updated` 事件。首次加载直接显示今日基线，后续增量进入动画队列。

当天缓存命中率按提示词缓存的通用口径计算：

```text
cache read / (input + cache read + cache write)
```

普通输入和缓存写入均属于本次没有直接命中缓存的输入 Token；输出与推理 Token 不参与计算。
