# 第 1 课：agent/llm.py —— 给项目"装上大脑"

> **本节目标**：看懂大模型是怎么被"接入"项目里的
> **预计时长**：20 分钟

这是全项目最短的文件（十来行），但藏着三个重要概念：**环境变量**、**.env 文件**、**模型初始化**。

## 全文一览

```python
from dotenv import load_dotenv,find_dotenv
import os
from langchain.chat_models import init_chat_model

# 加载配置文件
# find_dotenv() 确保找到 .env文件 递归查询当前项目文件夹
load_dotenv(find_dotenv())

model = init_chat_model(
    model=os.getenv("LLM_QWEN_MAX"),
    model_provider="openai"
)
```

**使命一句话**：把大模型初始化好，变成一个叫 `model` 的对象，全项目共用（别的文件写 `from agent.llm import model` 就能领到这颗"大脑"）。

## 逐行解读

### 第 1~3 行：进货（import）

```python
from dotenv import load_dotenv,find_dotenv     # 从 dotenv 工具包拿两件工具
import os                                      # 拿"和操作系统对话"的工具
from langchain.chat_models import init_chat_model  # 从 LangChain 拿"模型接入口"
```

- `import` 可以理解成"**从工具箱里拿工具**"
- `dotenv` = 专门伺候 `.env` 文件的小工具包
- `os` = Python 自带的系统工具箱，本课用它**读环境变量**
- `langchain.chat_models` = LangChain（AI 开发界的"瑞士军刀"）的模型模块；`init_chat_model` 是它的**万能接入口**——接任何大模型都用这一个函数

### 第 5~6 行：注释

`#` 开头的字是写给**人**看的说明书，Python 会假装看不见。

### 第 7 行：本课核心，一个"嵌套函数"

```python
load_dotenv(find_dotenv())
```

函数套函数时，**从最里面往外读**：

1. `find_dotenv()` → "**找**"：从当前文件出发向上翻，找到 `.env` 文件在哪
2. `load_dotenv(...)` → "**装**"：把 `.env` 里每一条 `KEY=值` 倒进程序的**环境变量**

**什么是环境变量？** 可以理解成操作系统发给每个运行中程序的"**随身口袋**"，程序随时能伸手摸东西（`os.getenv("名字")`）。`.env` 文件 = 家里的"**配置抽屉**"，程序一开工先把抽屉装进口袋。

💡 为什么要这么绕？三条好处：

| 好处 | 说明 |
|------|------|
| 🔒 安全 | API Key 不进代码文件，代码分享/上传时钥匙不泄露 |
| 🎛 灵活 | 换模型、换服务商 = 只改 .env，代码一行不动 |
| 📏 标准 | 几乎所有成熟项目都这么管理配置 |

### 第 9~12 行：把模型"接"过来

```python
model = init_chat_model(
    model=os.getenv("LLM_QWEN_MAX"),   # 从口袋摸出模型名 → 现在是 "deepseek-chat"
    model_provider="openai"            # 走 "OpenAI 通道"
)
```

- `os.getenv("LLM_QWEN_MAX")`：摸出**模型名字**。这名字住在 .env 里（变量名还叫 Qwen 是历史遗留，值可以改成任何模型）
- `model_provider="openai"`：⭐ 最让人疑惑的一点——明明用 DeepSeek，为什么写 "openai"？

因为 DeepSeek 把自家服务器做成了"**OpenAI 接口的形状**"。就像 **USB-C 数据线**：线是标准口，插哪家设备都通。`"openai"` = 选这根标准线；"插到哪个服务器"和"用哪把钥匙"由 .env 里的另外两行决定：

- `OPENAI_BASE_URL=https://api.deepseek.com/v1` ← 服务器地址
- `OPENAI_API_KEY=sk-xxx` ← 钥匙

注意：这两行**代码里根本没写**——是 `init_chat_model` 内部按照 OpenAI 的规范**自动去环境变量口袋里摸的**。

### 运行结果

`model` 就是一个"能对话的模型对象"——项目的"大脑"从此持证上岗。

## 📌 概念卡

| 概念 | 一句话 |
|------|--------|
| `.env` | 配置抽屉：放钥匙/地址，不进代码仓库 |
| 环境变量 | 程序的"随身口袋"，运行中随时可摸 |
| `load_dotenv(find_dotenv())` | 找抽屉 → 装口袋（**从里往外读**） |
| `init_chat_model` | 万能接入口：通道用 provider，模型/地址/钥匙用 .env |
| `model` | 全项目的"大脑"，谁要谁 import |

## ✍️ 复述题

1. `load_dotenv(find_dotenv())` 里两个函数各干了什么？
2. 明明用 DeepSeek，为什么代码写 `model_provider="openai"`？
3. 想把模型从 deepseek-chat 换成别的，要改哪里？要不要动 llm.py 的代码？

<details>
<summary>💡 参考答案（用自己的话答对意思即可）</summary>

1. `find_dotenv()` 负责"找"——从当前位置向上搜索，定位 `.env` 文件；`load_dotenv()` 负责"装"——把文件里的 KEY=值 全部装载进程序的环境变量（随身口袋）。
2. 因为 DeepSeek 兼容 OpenAI 的接口协议（同一个"标准口"）。LangChain 里选 "openai" 通道 = 用标准协议通信，具体连哪家服务器由 `OPENAI_BASE_URL` 决定，用哪把钥匙由 `OPENAI_API_KEY` 决定。
3. 只改 `.env` 里 `LLM_QWEN_MAX` 的值即可（例如换成其他模型名），代码一行都不用动——这就是"配置与代码分离"。

</details>

## 🎁 动手实验

1. 打开项目的 `.env`，找到三行：`LLM_QWEN_MAX`、`OPENAI_BASE_URL`、`OPENAI_API_KEY`
2. 指着它们说出：哪一行是 llm.py 里"**明着读**"的？哪两行是"**偷偷被用**"的？

<details>
<summary>💡 答案</summary>

`LLM_QWEN_MAX` 是代码里 `os.getenv("LLM_QWEN_MAX")` 明着读的；`OPENAI_BASE_URL` 和 `OPENAI_API_KEY` 代码里没出现，是 LangChain 按 OpenAI 规范隐式读取的。

</details>

## ➡️ 下一课

**第 2 课：`prompt/prompts.yml`** —— 看看智能体的"人设"和"家规"是怎么写的。
