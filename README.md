# 防骗预演

一款以现代中式生活场景为背景的反诈互动练习。玩家用模拟手机查看消息、找人商量、独立核实，最后回看自己的操作。

## 试玩

下载或克隆整个项目，保留 `assets/` 与 [demo-chapter-1.html](demo-chapter-1.html) 在同一层，再双击 HTML 离线试玩。

打开后先看到客厅引导。点击「开始体验」进入《一份周末兼职》，开场约 12 秒，从客厅一路推进到手机通知。镜头可暂停、跳过或退出。点击时网页会请求原生全屏，如果浏览器拒绝，开场会铺满网页窗口。

系统启用「减少动态效果」时，开场默认以静态镜头呈现。演示连续运镜时，可先在引导页打开「完整动画」。

可维护的样片资源位于 `assets/css/chapter-1.css` 与 `assets/js/chapter-1.js`。

当前样片包含第一章主线、辅导员视频短分支、校园核实、四种结算和复盘。视频分支使用原创静帧与字幕。人声、真实投屏、全屏和真机表现仍需复核。所有交易均为演练。

## 项目资料

- [整体项目方案](项目文档.md)
- [三章完整流程与分镜](防骗预演%20三章完整流程与分镜.md)
- [Qoder 执行任务书](Qoder执行任务书.md)
- [变更记录](CHANGELOG.md)

## 过程记录

每轮开发按 [GitHub Issues](https://github.com/LeiJei-0/anti-fraud-rehearsal/issues) 记需求 → 分支开发 → PR 关联 Issue 并附验收结果 → 合并进 `main` → 在 [CHANGELOG.md](CHANGELOG.md) 追加一轮记录。

| 轮次 | 需求 | 开发分支 | 合并 PR | 状态 |
| --- | --- | --- | --- | --- |
| 第一章《一份周末兼职》样片 | [#1 需求与验收标准](https://github.com/LeiJei-0/anti-fraud-rehearsal/issues/1) | `feat/chapter-1-prototype` | [#2 样片与验收](https://github.com/LeiJei-0/anti-fraud-rehearsal/pull/2) | 合并后关闭 #1 |

- [#1](https://github.com/LeiJei-0/anti-fraud-rehearsal/issues/1) 写清 A01–A10 镜头、四种结算、离线约束与七条验收路线。
- [#2](https://github.com/LeiJei-0/anti-fraud-rehearsal/pull/2) 附验收对照表、仍需人工验收的项目与提交前审查结论。
- 提交历史：[935a277 样片](https://github.com/LeiJei-0/anti-fraud-rehearsal/commit/935a277e6cd03aa0b148812ef6a2909af04b84ba) → [97c4a53 远端核对](https://github.com/LeiJei-0/anti-fraud-rehearsal/commit/97c4a53e4dea1123155171e6a8003da343c8baf5) → 9755e35 分支返回修正。

