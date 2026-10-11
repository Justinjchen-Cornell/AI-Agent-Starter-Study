# 🛠 环境配置保姆级指南

> 以 Windows 为例，macOS / Linux 同理（命令差异处已标注）

## 第 0 步：检查 Python

在终端输入：

```bash
python --version
```

需要 **3.10 或更高**。没有的话去 [python.org](https://www.python.org/downloads/) 安装（Windows 安装时记得勾选 "Add python.exe to PATH"）。

## 第 1 步：下载项目 & 安装依赖

```bash
git clone https://github.com/Justinjchen-Cornell/AI-Agent-Starter-Study.git
cd AI-Agent-Starter-Study
pip install -r requirements.txt
```

> 依赖较多，第一次安装需要几分钟。

## 第 2 步：准备两把钥匙

**① DeepSeek（大模型）**

1. 打开 https://platform.deepseek.com → 注册 / 登录
2. 左侧 "API Keys" → "创建 API Key" → 复制 `sk-` 开头的字符串
3. 在"充值"页面确认账户有余额（很便宜，几块钱能跑很久）

**② Tavily（网络搜索）**

1. 打开 https://tavily.com → 注册（有免费额度）
2. 登录后 Dashboard 里 `tvly-` 开头的字符串就是你的 Key

## 第 3 步：配置 .env 文件

```bash
copy .env.example .env      # Windows
cp .env.example .env        # macOS / Linux
```

用记事本打开 `.env`，把两行占位符换成你的钥匙：

```env
OPENAI_API_KEY=sk-你的DeepSeek钥匙
TAVILY_API_KEY=tvly-你的Tavily钥匙
```

（其余行保持默认即可；MySQL / RAGFlow 是可选项，不配也能跑）

> 🔒 安全说明：`.env` 已被 `.gitignore` 排除，永远不会被上传。教程与示例中所有钥匙均使用占位符。

## 第 4 步：启动与验收

```bash
python api/server.py
```

看到 `Uvicorn running on http://0.0.0.0:8000` 即启动成功（这个窗口不要关）。

1. 浏览器打开 `http://localhost:8000/docs`（FastAPI 自带的调试面板）
2. 找到 **POST /api/task** → 点 **Try it out** → 把 body 改成：
   ```json
   {"query": "搜索一下2025年AI Agent领域有哪些新进展"}
   ```
3. 点 **Execute**，返回 `{"status":"started","thread_id":"..."}` 即任务已派出
4. 切回终端，等待日志直播：`session_created` → `assistant_call` → `tool_start` → **`task_result`**（约 1~3 分钟）

## 🔍 常见报错速查

| 报错 / 现象 | 原因 | 解决 |
|---|---|---|
| `ModuleNotFoundError: No module named 'agent'` | 运行位置不对 / 全局环境同名包冲突 | 本项目已修复；确保在项目根目录运行 `python api/server.py` |
| 端口冲突 / `10048` | 8000 端口被其他程序占用 | 关掉占用程序，或改 `api/server.py` 最后一行的端口 |
| `401` / `invalid api key` | 钥匙填错或没填 | 检查 `.env` 两把钥匙 |
| 启动时刷一大段提示词 | 调试打印（正常现象） | 无需处理 |
| 搜索无结果 | Tavily 额度用尽 / 网络问题 | 登录 tavily.com 查看额度 |

## ✅ 验收清单

- [ ] 服务成功启动（看到 Uvicorn running）
- [ ] /docs 能打开
- [ ] 任务返回 started，终端最终出现 **task_result**
- [ ] `output/session_xxx/` 目录被创建
