# 防骗预演

一个可以停下来商量的电脑端反诈互动故事。双击 [index.html](index.html)，点「开始体验」，选择青年人、中年人或老年人。请保留同层 `assets/`；下载 GitHub 压缩包后先完整解压。运行时不用安装依赖、开服务器、连接网络或注册账号。

| 你选择的身份 | 故事从哪里开始 | 可以亲手做什么 |
| --- | --- | --- |
| 青年人 | 宿舍上铺，一条周末兼职通知 | 回消息、看自称辅导员的视频、用原有校园渠道核实 |
| 中年人 | 晚饭后，熟悉的网友打来电话 | 接听或挂断、对照收款方、查看旧相机回收条件 |
| 老年人 | 邻里群里，一张健康讲座邀请 | 看包装、和家人商量、查书面条件与实际费用 |

电脑左侧播放本地剧情短片，右侧手机承载回复、求助、核实和模拟交付。动画可以暂停、重播，播放完不会替人选择。从身份入口进入会开始播放；可按画面下的按钮暂停或重播。不计时、不排名。结算首屏保留本章剧照，用一句话解释结果；点「回看我的选择」才翻开只记录本局操作的手记。可返回剧照、重玩，或打印家庭约定卡。

## 开发与验证记录

- [需求 #7](https://github.com/LeiJei-0/anti-fraud-rehearsal/issues/7)：三章改为单手握机、同手拇指滑动；后两章以第一章为参考重绘，分别保留傍晚与晨间光线。[三章动作对照](docs/thumb-preview.mp4) · [结算与手记实机截图](docs/ending-preview.jpg)。

- [需求 #4](https://github.com/LeiJei-0/anti-fraud-rehearsal/issues/4)：Qoder 的宿舍版和直接结算作为独立提交 `80d46a4` 留存。
- [需求 #5](https://github.com/LeiJei-0/anti-fraud-rehearsal/issues/5)：按实际试玩反馈，由 Codex 重做进入方式、人物比例、桌面手机交互和三章影片。每章四段，均为本地无声 MP4；网页另提供提示音。
- 影片制作参考 [painted-animation](https://github.com/tuzhechen2005/opus-video-skills/tree/main/skills/painted-animation) 的分镜与逐帧检查方法，本站使用自己的素材与渲染脚本。没有将 Codex 的工作计为 Qoder 工作记录。
- 台式机/笔记本是本轮验收对象；没有单独验证移动端、真实投影设备或现场听感。网页没有提交报名或部署到 Qoder Sites。
- [桌面回归脚本](qa/review.mjs) 使用 Node 22+ 与本地 Chrome。运行 `node qa/review.mjs review-output`，可用 `CHROME_PATH` 指定 Chromium 的路径。[自动化验收记录](docs/pc-review.json) 包含离线实跑的路径、尺寸及各片段解码信息。

## 项目资料

- [整体项目方案](项目文档.md)
- [三章完整流程与分镜](防骗预演%20三章完整流程与分镜.md)
- [Qoder 执行任务书](Qoder执行任务书.md)
- [变更记录](CHANGELOG.md)

## 过程记录

每轮开发按 [GitHub Issues](https://github.com/LeiJei-0/anti-fraud-rehearsal/issues) 记需求 → 分支开发 → PR 关联 Issue 并附验收结果 → 合并进 `main` → 在 [CHANGELOG.md](CHANGELOG.md) 追加一轮记录。

| 轮次 | 需求 | 开发分支 | 合并 PR | 状态 |
| --- | --- | --- | --- | --- |
| 第一章《一份周末兼职》样片 | [#1 需求与验收标准](https://github.com/LeiJei-0/anti-fraud-rehearsal/issues/1) | `feat/chapter-1-prototype` | [#2 样片与验收](https://github.com/LeiJei-0/anti-fraud-rehearsal/pull/2) | 已合并，[#1 已关闭](https://github.com/LeiJei-0/anti-fraud-rehearsal/issues/1) |
| 合并结果补记（文档） | 沿用 #1 | `docs/merge-record-1` | [#3 合并结果补记](https://github.com/LeiJei-0/anti-fraud-rehearsal/pull/3) | 补写 #2 的合并提交号 |

- [#1](https://github.com/LeiJei-0/anti-fraud-rehearsal/issues/1) 写清 A01–A10 镜头、四种结算、离线约束与七条验收路线。
- [#2](https://github.com/LeiJei-0/anti-fraud-rehearsal/pull/2) 附验收对照表、仍需人工验收的项目与提交前审查结论，合并提交为 [d768c79](https://github.com/LeiJei-0/anti-fraud-rehearsal/commit/d768c7903330667f8cc2edbe1a3ed689aa59a135)。
- 提交历史：[935a277 样片](https://github.com/LeiJei-0/anti-fraud-rehearsal/commit/935a277e6cd03aa0b148812ef6a2909af04b84ba) → [97c4a53 远端核对](https://github.com/LeiJei-0/anti-fraud-rehearsal/commit/97c4a53e4dea1123155171e6a8003da343c8baf5) → [9755e35 分支返回修正](https://github.com/LeiJei-0/anti-fraud-rehearsal/commit/9755e35) → [b28280d 过程记录](https://github.com/LeiJei-0/anti-fraud-rehearsal/commit/b28280d) → [d768c79 合并进 main](https://github.com/LeiJei-0/anti-fraud-rehearsal/commit/d768c7903330667f8cc2edbe1a3ed689aa59a135)。

