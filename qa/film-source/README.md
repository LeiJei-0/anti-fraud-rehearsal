# 手机响起以前：三章动作短片

这些是配合右侧手机演练的无声短片。在动作分支改变时切片，最后一帧停下等待玩家。录制中不包含现场音或对白，不会替玩家确认交易。

|镜头|节奏|动作|
|---|---|---|
|消息到达|7.25 秒|学生在床上已经拿着手机；另两章从桌边握住并拿起手机，来电章停在等待选择。|
|查看线索|6 秒|从看手机的人切到物品与两份材料。材料放到对照位置，同一只手的拇指在手机屏内上滑，内容随指腹移动。|
|确认之前|6 秒|握机的拇指靠近屏内按钮，在确认动作前停下、收回；镜头回到人物。|

青年：白衣、上铺、床面的织纹、校园卡与校园服务入口。中年：旧相机和照片、傍晚来电、聊天附件与服务条款。老年：上午窗光、茶具、眼镜、纸币与讲座邀请。物件用于叙事示意，判断以手机中实际打开的资料为准。

手部近景采用 imagegen 生成的原画。制作时把掌和袖口、手机背后的四指、机身、屏幕前的拇指拆成透明图层，保存在 `hand-art/`。在 `painted_hand.py` 中，抓稳后手掌与机身共用同一变换。滑动时，局部网格让指腹沿短弧移动，拇指根部留在掌侧，手机内容跟随接触进度移动。三个角色沿用同一组握姿，衣袖与光色分别对应宿舍、晚饭后和晨间场景。

制作参考了 [2d-character-rig-animation 的分层、支点与遮挡说明](https://github.com/calesthio/generative-media-skills/blob/main/skills/production/creative-direction/2d-character-rig-animation/SKILL.md) 和 [painted-animation 的逐帧审看方法](https://github.com/tuzhechen2005/opus-video-skills/tree/main/skills/painted-animation)。网站当前九段持机影片由 Pillow 合成、FFmpeg 编码。可在[第二章静帧审看页](../手形审看/看手形.html)按试玩尺寸逐张看手形。

**复现**（Python 3：Pillow、NumPy、fontTools、imageio-ffmpeg；Windows 中文字体）：从任意目录运行 `python render.py --sheets ./strips`（脚本路径按所在目录填）。渲染器从 assets/art 读取三章对应的 WebP 画面。影片是 960×540、24 帧/秒的 H.264 MP4，兼容直接打开的静态站点。程序只在制作时运行。
