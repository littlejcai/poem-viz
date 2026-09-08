# 诗画同源 · 小学必背古诗词（poem-viz）

小红书小工具：小学课内必背 130 首古诗词，每首由程序生成一幅独一无二的水墨诗意图。
纯离线 H5，无网络请求，打包为 zip 上传运行。

## 功能

- 一诗一画：20 类意象（月/山/水/柳/荷/雁/舟…）驱动的 Canvas 水墨渲染，诗名作种子，画面确定性可复现；季节时辰色调、荷花/瀑布/窗棂专绘、画卷展开动效
- 格律可视化：带调拼音、平仄谱（○平/●仄）、押韵着色、起承转合分段、名句高亮
- 学习闭环：点句看注释、三档背诵模式（首字提示/半隐/全隐）、艾宾浩斯复习提醒、诗句接龙测验、律诗对仗连连看
- 诗人页：65 位诗人名录与详情
- 分享：诗画卡 / 每日日签 / 描红字帖 / 背诵成就奖状，容器内经 JSBridge 发笔记或存相册

## 目录

```
dist/          小工具本体（打包这个目录的内容，index.html 须在 zip 根）
pipeline/      数据管线（构建期运行，不进 zip）
  raw/           原始数据（见下方数据来源与许可）
  build_data.py  生成 dist/assets/poems.js（拼音平仄/押韵/意象/对仗/氛围标注）
```

## 构建

```bash
python3 pipeline/build_data.py          # 再生成数据
cd dist && python3 ../pack.py           # 或用任意 zip 工具压缩 dist 的“内容”
```

## 数据来源与许可

- 诗词原文：公有领域
- 结构化数据（拼音/注释/译文/赏析/作者信息）：[PoeMath](https://github.com/hobbyL/PoeMath)，Apache-2.0
- 数据灵感与校验参考：[chinese-poetry](https://github.com/chinese-poetry/chinese-poetry)，MIT

本仓库代码遵循 MIT 许可；再分发数据文件时请保留上述署名。
