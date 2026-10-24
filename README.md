# 太空战斗机 · Aurora Rift

一款纯前端、竖屏、单局 3–8 分钟的霓虹深空街机弹幕射击游戏。HTML5 Canvas 负责全部玩法与程序化美术，Capacitor 封装为 Android 应用。

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](./LICENSE)

> 穿过裂隙，在弹幕之间起舞。

## 玩法特性

- **12 种敌机**：普通机群、俯冲蜂、扇形射手、环状炮台、分裂体、重装堡垒、陨石、长炮狙击、布雷者、侧掠弯刀、召唤母舰与分裂幼体；每种都有独立轮廓、移动轨迹与开火方式
- **13 种 Boss 招式**：扇形齐射、星旋回廊、环状爆发、追踪星群、双生扫射、十字光牢、母舰召唤、重弹压制、双子光矛、雷区播种、相位闪现、星网绞杀、波动弹幕；三阶段逐步解锁，并避免连续重复
- **多种玩家弹道**：脉冲阵列、棱镜贯穿弹、蜂群追踪导弹；武器核心持续 24 秒
- **4 类僚机**：脉冲、棱镜贯穿、守护近防、蜂群导弹，最多编队 3 架
- **护盾与力场**：护盾最多叠 3 层，开局自带 1 层；棱镜力场可在 8 秒内吞噬附近弹幕并抵消一次致命伤害
- **擦弹与连锁**：贴近弹幕积攒星爆，连续击落提升倍率；冲刺拥有短暂无敌帧
- **星区推进**：10 个命名星区循环，敌机数量、弹速、血量与 Boss 强度逐步提升
- **本地优先**：无账号、无服务器、无网络请求；最高分、最远星区与设置仅存在 `localStorage`

## 操作

| 输入 | 动作 |
| --- | --- |
| 拖动 / 鼠标 | 驾驶战机，自动开火 |
| 方向键 / WASD | 键盘移动 |
| `SPACE` / 冲刺按钮 | 冲刺穿越弹幕 |
| `X` / 星爆按钮 | 清空弹幕并进入超频 |
| `ESC` / 暂停按钮 | 暂停与设置 |
| 贴近敌弹 | 擦弹积攒 NOVA |

## 技术栈

- 原生 JavaScript + HTML5 Canvas 2D，无游戏引擎
- 程序化矢量美术、预渲染精灵与粒子系统
- Web Audio API 合成音乐与音效
- Capacitor 8 封装 Android WebView
- Playwright + Edge 做视觉、交互与压力回归

## 快速开始

要求 Node.js 20+。

```bash
npm install
npx cap sync android
```

### 浏览器直接游玩

用任意静态服务器打开 `www/`：

```bash
npx serve www
```

然后访问终端显示的地址。也可以直接双击 `www/index.html` 进行基础试玩；音频需要一次点击解锁。

### Android 调试包

```bash
npx cap open android
```

在 Android Studio 中运行，或使用：

```bash
cd android
./gradlew assembleDebug
```

### 本地 Release APK

```bash
cd android
./gradlew assembleRelease
```

产物位于：

```text
android/app/build/outputs/apk/release/app-release.apk
```

当前仓库的 release 配置使用 debug 签名，方便本地安装与开源验证；正式上架前请替换为自己的 keystore，并妥善保管。

## 测试

```bash
npm test
```

`npm test` 会启动 Edge headless，完成：

- 菜单、战斗、暂停、结算与触控流程
- 12 种敌机和 Boss 招式采样
- 武器模式、僚机、护盾与力场逻辑
- 90 秒跨星区压力模拟、NaN 检测与帧率检查
- 360×640、390×844、1440×900 响应式截图

测试截图默认输出到 `.tools/shots/`，该目录不进入版本库。

## 目录结构

```text
www/
  index.html          HUD、菜单、暂停与结算界面
  css/game.css        设计令牌与界面样式
  js/core.js          工具、输入、程序化音频
  js/art.js           飞船、敌机、Boss、拾取物与精灵缓存
  js/background.js    星云、极光、星域与菜单场景
  js/entities.js      玩家、敌机、Boss、子弹、护盾、僚机
  js/director.js      星区波次编排
  js/ui.js            HUD 与屏幕状态
  js/game.js          状态机、碰撞、粒子与主循环
android/              Capacitor Android 工程
.tools/               视觉与回归测试脚本
legacy/               v1.0 单文件旧版存档
```

## 发布

版本号和更新说明以 `CHANGELOG.md` 为准。构建 APK 后，按项目约定将产物上传到 GitHub Release，不把大体积安装包提交进 Git。

```bash
gh release create v2.2.0 \
  --title "v2.2.0" \
  --notes-file release-notes.md \
  SpaceFighter-v2.2.0.apk
```

## 第三方组件

- [Capacitor](https://capacitorjs.com/)：MIT License
- 本项目游戏代码、程序化美术、图标与音效均为原创生成，不随包携带第三方图片或音频素材

## License

Apache License 2.0，详见 [LICENSE](./LICENSE) 与 [NOTICE](./NOTICE)。
