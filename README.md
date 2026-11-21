# 防骗预演

一个可以停下来商量的电脑端反诈互动故事。双击 [index.html](index.html)，点「开始体验」，选择青年人、中年人或老年人。请保留同层 `assets/`；下载 GitHub 压缩包后先完整解压。运行时不用安装依赖、开服务器、连接网络或注册账号。

| 你选择的身份 | 故事从哪里开始 | 可以亲手做什么 |
| --- | --- | --- |
| 青年人 | 宿舍上铺，一条周末兼职通知 | 回消息、看自称辅导员的视频、用原有校园渠道核实 |
| 中年人 | 晚饭后，熟悉的网友打来电话 | 接听或挂断、对照收款方、查看旧相机回收条件 |
| 老年人 | 邻里群里，一张健康讲座邀请 | 看包装、和家人商量、查书面条件与实际费用 |

电脑左侧播放本地剧情短片，右侧手机承载回复、求助、核实和模拟交付。动画可以暂停、重播，播放完不会替人选择。从身份入口进入会开始播放；可按画面下的按钮暂停或重播。不计时、不排名。结算首屏保留本章剧照，用一句话解释结果；点「回看我的选择」才翻开只记录本局操作的手记。可返回剧照、重玩，或打印家庭约定卡。

## 团队成员

| 学校 | 专业 | 班级 | 姓名 |
| --- | --- | --- | --- |
| 扬州职业技术大学 | 大数据与会计 | 会计2602 | 肖斯菀 |

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

## 仓库规范

- [LICENSE](LICENSE)：代码用 MIT，剧情文本与美术影片用 CC BY-NC-SA 4.0；学校和社区做反诈宣传可以直接复制离线包部署。
- [CONTRIBUTING.md](CONTRIBUTING.md)：一轮开发走的顺序、提交信息写法、回归与渲染命令、提交前自查。
- [SECURITY.md](SECURITY.md)：离线与不收集个人信息的边界，以及哪些情况按安全问题私下报告。
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)：行为准则，重点是试玩反馈怎么写才能被复现。
- Issue 与 PR 模板在 `.github/`：新需求填验收标准，试玩反馈填环境与第几步。

## 过程记录

每轮开发按 [GitHub Issues](https://github.com/LeiJei-0/anti-fraud-rehearsal/issues) 记需求 → 分支开发 → PR 关联 Issue 并附验收结果 → 合并进 `main` → 在 [CHANGELOG.md](CHANGELOG.md) 追加一轮记录。

| 轮次 | 需求 | 开发分支 | 合并 PR | 状态 |
| --- | --- | --- | --- | --- |
| 第一章《一份周末兼职》样片 | [#1 需求与验收标准](https://github.com/LeiJei-0/anti-fraud-rehearsal/issues/1) | `feat/chapter-1-prototype` | [#2 样片与验收](https://github.com/LeiJei-0/anti-fraud-rehearsal/pull/2) | 已合并，[#1 已关闭](https://github.com/LeiJei-0/anti-fraud-rehearsal/issues/1) |
| 合并结果补记（文档） | 沿用 #1 | `docs/merge-record-1` | [#3 合并结果补记](https://github.com/LeiJei-0/anti-fraud-rehearsal/pull/3) | 补写 #2 的合并提交号 |
| 第一章宿舍改版 → 三身份桌面版 | [#4 宿舍开场与直接结算](https://github.com/LeiJei-0/anti-fraud-rehearsal/issues/4) · [#5 三章可试玩与人物比例](https://github.com/LeiJei-0/anti-fraud-rehearsal/issues/5) · [#7 拇指持机与选择手记](https://github.com/LeiJei-0/anti-fraud-rehearsal/issues/7) | `feat/chapter-1-dorm` | [#6 拇指持机动画与电影定格结算](https://github.com/LeiJei-0/anti-fraud-rehearsal/pull/6) | 已合并，合并提交 [`5ed6636`](https://github.com/LeiJei-0/anti-fraud-rehearsal/commit/5ed6636e68fefde0a3e27356ec8eb341228f4b15)，[#4](https://github.com/LeiJei-0/anti-fraud-rehearsal/issues/4) / [#5](https://github.com/LeiJei-0/anti-fraud-rehearsal/issues/5) / [#7](https://github.com/LeiJei-0/anti-fraud-rehearsal/issues/7) 随之关闭 |
| 三章持机近景重绘与拇指滑屏 | 沿用 #7 的试玩反馈（`b702b8b` · `45b7ef3` · `2227391`） | `feat/painted-hand-closeups` | [#8 三章持机近景重绘及拇指滑屏验证](https://github.com/LeiJei-0/anti-fraud-rehearsal/pull/8) | 已合并，合并提交 [`285a384`](https://github.com/LeiJei-0/anti-fraud-rehearsal/commit/285a3843c2525ae733b8b04588aff3e5f6e75976)；手形反馈已确认解决 |
| 仓库规范补齐（文档） | 沿用公开仓库社区健康文件要求 | `chore/community-standards` | [#9 仓库规范补齐](https://github.com/LeiJei-0/anti-fraud-rehearsal/pull/9) | 已合并，合并提交 [`6ac546e`](https://github.com/LeiJei-0/anti-fraud-rehearsal/commit/6ac546e09a6999f61bcb8056aef6cb5482a1df00) |
| 合并结果补记与分支归档（文档） | 沿用 #1 的记录习惯 | `docs/merge-record-3` | [#15 合并结果补记](https://github.com/LeiJei-0/anti-fraud-rehearsal/pull/15) | 补写 #8 与 #9 的合并结果、分支归档与新建 Issue |

- [#4](https://github.com/LeiJei-0/anti-fraud-rehearsal/issues/4) 记录宿舍开场、屏内文字、无配音弹幕、图案入口与直接结算的验收标准，分镜见 [docs/chapter-1-dorm.md](docs/chapter-1-dorm.md)。
- [80d46a4](https://github.com/LeiJei-0/anti-fraud-rehearsal/commit/80d46a4) 是 Qoder 的宿舍改版实现：先复现并留存改前证据（161 处文字越界，含通知卡片内文字超出卡片 25px、手遮住通知 10%～16%），改后同一检测为 0 处；七条路线 98 项断言与四种结算首屏 32 项断言全部通过，并附「宿舍开场 → A04 点先放一放 → 立即安全离开」的连续录像。**手机尺寸三档字号的结果只计入这一版**，后续桌面版另计。
- [7b6e4fb](https://github.com/LeiJei-0/anti-fraud-rehearsal/commit/7b6e4fb) 与 [cdc0aa3](https://github.com/LeiJei-0/anti-fraud-rehearsal/commit/cdc0aa3) 是 Codex 按试玩反馈改成的三身份桌面版（12 段本地影片、拇指持机、电影定格结算与只读手记），回归见 `docs/pc-review.json`，334 项检查通过。
- [#6](https://github.com/LeiJei-0/anti-fraud-rehearsal/pull/6) 合并这三段提交，正文含逐条验收结果与仍需人工试玩的项目。
- [#6 的合并结果](https://github.com/LeiJei-0/anti-fraud-rehearsal/commit/5ed6636e68fefde0a3e27356ec8eb341228f4b15)：`merged_at = 2026-11-20T16:06:18Z`（北京时间 11-21 00:06:18），`main` 由 `ff6037b` 前进到 `5ed6636`；#4、#5、#7 分别在同日 00:06:20、00:06:21、00:06:23 自动关闭。开发分支 `feat/chapter-1-dorm` 的提交已全部进入 `main`；归档时先打上 `archive/feat-chapter-1-dorm`（指向 `14b673b`）再删除远端分支，未强推。
- [#8](https://github.com/LeiJei-0/anti-fraud-rehearsal/pull/8) 收三章持机近景的三段重绘（`b702b8b`、`45b7ef3`、`2227391`）。第三段只替换第一章的通知、查线索与确认前三条影片，共 462 帧，逐段比对后十二段中仅这三条发生变化；`2227391` 之后整站回归重跑过一遍，334 项通过，但仓库里 `docs/pc-review.json` 的记录早于这三条影片，`clips` 字段也没有哈希，绑不到具体素材——重跑结果尚未入库。

- [#1](https://github.com/LeiJei-0/anti-fraud-rehearsal/issues/1) 写清 A01–A10 镜头、四种结算、离线约束与七条验收路线。
- [#2](https://github.com/LeiJei-0/anti-fraud-rehearsal/pull/2) 附验收对照表、仍需人工验收的项目与提交前审查结论，合并提交为 [d768c79](https://github.com/LeiJei-0/anti-fraud-rehearsal/commit/d768c7903330667f8cc2edbe1a3ed689aa59a135)。
- 提交历史：[935a277 样片](https://github.com/LeiJei-0/anti-fraud-rehearsal/commit/935a277e6cd03aa0b148812ef6a2909af04b84ba) → [97c4a53 远端核对](https://github.com/LeiJei-0/anti-fraud-rehearsal/commit/97c4a53e4dea1123155171e6a8003da343c8baf5) → [9755e35 分支返回修正](https://github.com/LeiJei-0/anti-fraud-rehearsal/commit/9755e35) → [b28280d 过程记录](https://github.com/LeiJei-0/anti-fraud-rehearsal/commit/b28280d) → [d768c79 合并进 main](https://github.com/LeiJei-0/anti-fraud-rehearsal/commit/d768c7903330667f8cc2edbe1a3ed689aa59a135)。

