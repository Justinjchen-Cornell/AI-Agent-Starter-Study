# 🌐 互动学习网站

课程在线阅读 / 复述题点击展开答案 / 学习进度打卡 / 实时演示台（零依赖，纯 HTML/CSS/JS）。

## 在线版

https://justinjchen-cornell.github.io/AI-Agent-Starter-Study/

## 本地使用

在**项目根目录**运行：

```bash
python -m http.server 8080
```

然后浏览器打开 http://localhost:8080/web/

## 说明

- 课程内容实时读取自 `docs/lessons/*.md`（新增课程时只需更新 `web/js/lessons-data.js`）
- "实时演示台"需要本机先启动项目服务器：`python api/server.py`
- 学习进度保存在浏览器 localStorage 中，不会上传任何数据
