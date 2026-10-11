# 🎓 AI-Agent-Starter-Study

**一个"能跑起来 + 读得懂"的 AI Agent 入门项目 —— 9 节课，逐行读懂一个真实的多智能体系统。**

本项目基于 [waseens/deep-search-pro](https://github.com/waseens/deep-search-pro)（MIT 协议，⭐ 194）改编：保留其完整可运行的多智能体代码，并为初学者补上 **9 节逐行解读课**、**术语卡**、**踩坑实录** 和 **互动学习网站**。

> 原项目用不到 1000 行代码演示了"主智能体调度 3 个子智能体"的完整链路。
> 本项目要解决的是：**让第一次接触 Agent 的你，真正读懂这 1000 行。**

---

## 📚 9 节课学习地图

| 顺序 | 文件 | 你会搞懂什么 |
|------|------|--------------|
| 1️⃣ | `agent/llm.py` | 10 行代码如何接入大模型（DeepSeek 等） |
| 2️⃣ | `prompt/prompts.yml` | 系统提示词怎么写，如何约束 Agent 行为 |
| 3️⃣ | `agent/subagents/network_search_agent.py` | "子智能体 = 一个字典"的极简设计 |
| 4️⃣ | `tools/tavily_tool.py` | 一个完整的 @tool 工具怎么写 |
| 5️⃣ | `agent/main_agent.py` | 核心：主智能体如何创建、编排、流式执行 |
| 6️⃣ | `api/server.py` | FastAPI 如何与 Agent 结合，异步任务如何触发 |
| 7️⃣ | `api/monitor.py` | WebSocket 实时推送与事件循环归属判断 |
| 8️⃣ | `api/context.py` | ContextVar 为什么比全局变量安全 |
| 9️⃣ | `utils/path_utils.py` | Agent 文件安全——边界场景大全 |

每节课的统一结构：**本节目标 → 逐行解读 → 概念卡 → 复述题（含参考答案）→ 动手实验**

> 🚧 课程持续更新中：第 1~2 课已发布，3~9 课随学习进度陆续更新。

教程正文在 [`docs/lessons/`](docs/lessons/)。

## 🚀 5 分钟跑起来

环境要求：Python 3.10+、一个 OpenAI 兼容的大模型 Key（示例用 DeepSeek）、一个 Tavily Key（有免费额度）。

```bash
git clone https://github.com/Justinjchen-Cornell/AI-Agent-Starter-Study.git
cd AI-Agent-Starter-Study
pip install -r requirements.txt
copy .env.example .env     # macOS / Linux 用: cp .env.example .env
```

打开 `.env` 填入你的两把钥匙（**图文详解见 [docs/setup.md](docs/setup.md)**）：

```env
OPENAI_BASE_URL=https://api.deepseek.com/v1
OPENAI_API_KEY=sk-your-deepseek-key
LLM_QWEN_MAX=deepseek-chat
TAVILY_API_KEY=tvly-your-tavily-key
```

启动：

```bash
python api/server.py
```

浏览器打开 `http://localhost:8000/docs` → 找到 `POST /api/task` → Try it out → 发送任务；回到终端就能看到 Agent 干活全过程的日志直播。

## 🌐 互动学习网站

`web/` 目录将包含一个零依赖的互动学习站：课程在线阅读、复述题点击查看答案、学习进度打卡、以及连接本地服务器的"实时演示台"。（建设中，欢迎关注）

## 🔧 相对原项目的修复与增强

- **修复**：直接运行 `python api/server.py` 报 `ModuleNotFoundError` 的问题（补充项目根目录到模块搜索路径）
- **修复**：为各包补充 `__init__.py`，避免与全局环境中的同名包冲突
- **增强**：提供 DeepSeek 配置示例（原项目默认示例为通义千问）
- **新增**：9 节中文教程 / 互动学习网站 / 免启动服务器的验证脚本 `scripts/smoke_test.py`

## 📁 目录结构

```
├── agent/            # 智能体层：主智能体 + 3 个子智能体
├── api/              # Web 层：FastAPI 服务 / WebSocket 监控 / ContextVar
├── tools/            # 6 个 @tool 工具函数
├── utils/            # 路径安全等工具
├── prompt/           # 提示词配置（prompts.yml）
├── docs/             # ★ 学习资料：9 节课 / 环境指南（术语卡、踩坑实录建设中）
├── web/              # ★ 互动学习网站（建设中）
├── scripts/          # 辅助脚本
└── requirements.txt
```

## ❓ 常见问题

- **没有 MySQL 和 RAGFlow 能跑吗？** 能。主智能体会自动跳过未配置的服务；只配 LLM + Tavily 就能体验完整链路。
- **为什么启动时打印一大段提示词？** 代码中预留的调试打印（`agent/prompts.py`），不影响使用，也可以当作"提示词加载成功"的信号。
- **端口 8000 被占用怎么办？** 关掉占用端口的程序，或修改 `api/server.py` 最后一行的 `port` 参数。

## 🙏 致谢与许可

- 原始项目：[waseens/deep-search-pro](https://github.com/waseens/deep-search-pro) —— MIT License, Copyright (c) 2026 waseens
- 本仓库新增的教程、网站与修改：MIT License, Copyright (c) 2026 [Justinjchen-Cornell](https://github.com/Justinjchen-Cornell)

如果这个项目帮你少走了弯路，欢迎 Star ⭐ 支持一下。
