# 第 1 课：agent/llm.py —— 整个系统的"大脑"只有 10 行

> **本节目标**：看懂大模型是怎么被"接入"项目里的
> **预计时长**：20 分钟

## 先建立直觉：一个 AI Agent 系统长什么样

打开代码之前，先记住这个公式：

> **AI Agent = 一个会思考的大脑（LLM） + 一堆能干活的工具（Tools） + 一套调度逻辑**

比如本项目：大脑负责思考，工具（网络搜索、查数据库）负责干活，`main_agent.py` 负责调度。

而本课这个文件只干一件事：**把"大脑"造出来，放进一个名叫 `model` 的变量里**——供项目里所有其他文件使用（别的文件写 `from agent.llm import model` 就能领到它）。

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

## 逐行解读

### 第 1~3 行：进货（import）—— 先认识三件工具

```python
from dotenv import load_dotenv,find_dotenv     # 从 dotenv 工具包拿两件工具
import os                                      # 拿"和操作系统对话"的工具
from langchain.chat_models import init_chat_model  # 从 LangChain 拿"模型接入口"
```

- `import` 可以理解成"**从工具箱里拿工具**"——先声明"我要用到什么"
- `dotenv`：专门伺候 `.env` 文件的小工具包（这里拿它的两件工具：`load_dotenv`、`find_dotenv`）
- `os`：Python 自带的系统工具箱，本课用它**读环境变量**
- `langchain.chat_models`：LangChain（AI 开发界的"瑞士军刀"）的模型模块；`init_chat_model` 是它的**万能接入口**——接任何大模型都用这一个函数

📌 两种写法的区别：`import xxx` = 拿整个工具箱；`from xxx import yyy` = 只拿工具箱里的那一件。

### 第 5~6 行：注释 —— 写给"人"看的说明书

`#` 开头的字，Python 会假装看不见。这两行注释提前告诉你：下面一行是做"加载配置文件"的，而且是"递归查找"。读别人代码时，先读注释能省一半力气。

### 第 7 行：密钥管理（本课核心 ①）—— 一个"嵌套函数"

```python
load_dotenv(find_dotenv())
```

**先讲问题背景**：调用大模型需要 API Key。密钥**绝对不能写死在代码里**——一旦代码传到 GitHub，很快就会被自动化程序扫到并盗用。

**解决方案**：密钥写在项目根目录的 `.env` 文件里（被 `.gitignore` 排除、永不上传），代码运行时再"读"进来。

**函数套函数时，从最里面往外读：**

1. `find_dotenv()` → "**找**"：从当前位置**向上递归**查找 `.env` 文件。
   为什么不写死 `./.env`？因为启动位置不固定——你可能在项目根目录运行，也可能在 `api/` 子目录运行；写死路径后者就会失败，向上递归则怎么跑都能找到。
2. `load_dotenv(...)` → "**装**"：把 `.env` 里每一条 `KEY=VALUE` 装进**环境变量**。
3. 之后任何代码用 `os.getenv("KEY")` 就能取到值。

**两个比喻帮你记牢**：

- `.env` 文件 = 家里的"**配置抽屉**"（安全存放，不示外人）
- 环境变量 = 程序的"**随身口袋**"——程序一开工，先把抽屉里东西装进口袋，运行中随时可摸

💡 为什么要这么绕？三条好处：

| 好处 | 说明 |
|------|------|
| 🔒 安全 | API Key 不进代码文件，分享/上传时钥匙不泄露（万一泄露，第一时间轮换） |
| 🎛 灵活 | 换模型、换服务商 = 只改 .env，代码一行不动 |
| 📏 标准 | 几乎所有成熟项目都这么管理配置 |

> 🧠 **记住这个模式**：`load_dotenv()` + `os.getenv()` 是 Python 项目管理密钥的标准姿势——你以后写的每个 AI 项目都会用到它。

### 第 9~12 行：创建模型对象（本课核心 ②）

```python
model = init_chat_model(
    model=os.getenv("LLM_QWEN_MAX"),   # 从口袋里摸出模型名 → "deepseek-chat"
    model_provider="openai"            # 走 "OpenAI 通道"
)
```

这里有两个巧妙之处：

**巧妙之处 1：`init_chat_model` 是"通用造脑工厂"**

模型厂商有几十家（OpenAI、Anthropic、通义千问、DeepSeek……），每家 SDK 的写法都不一样。`init_chat_model` 把它们**统一**了：一个函数造出任何厂商的模型，而且造出来的 `model` 对象都长一个样——都有 `.invoke()`（调用一次）、`.ainvoke()`（异步调用）、`.astream()`（流式输出）这些方法。

后面 `main_agent.py` 只需要 `create_deep_agent(model=model)`，框架就知道"用谁当大脑"，完全不用关心模型来自哪家。

**巧妙之处 2：`model_provider="openai"` 是一个"标准接口"技巧**

注意：代码写的是 `"openai"`，但我们实际用的是 DeepSeek（原项目默认示例是通义千问）。这不矛盾——因为国内主流厂商都提供 **OpenAI 兼容接口**：API 地址格式、请求格式和 OpenAI 一模一样。

就像 **USB-C 数据线**：线是标准口，插哪家设备都能通。`"openai"` = 选这根标准线；"插到哪个服务器""用哪把钥匙"由 `.env` 里另外两个变量决定：

| `.env` 变量 | 作用 | 比喻 |
|---|---|---|
| `OPENAI_BASE_URL` | 去哪调（服务器地址） | 门牌号 |
| `OPENAI_API_KEY` | 用什么钥匙 | 钥匙 |
| `LLM_QWEN_MAX` | 调哪个模型 | 点名哪位专家 |

**想从通义千问换成 DeepSeek？** 只改 `.env` 三行，代码一个字不动：

```env
OPENAI_BASE_URL=https://api.deepseek.com/v1
OPENAI_API_KEY=sk-你的DeepSeek钥匙
LLM_QWEN_MAX=deepseek-chat
```

这就是"**配置与代码分离**"的威力——也是作者把模型名放进 `.env` 而不是写死在代码里的原因。

> ⚠️ 一个小陷阱：`OPENAI_BASE_URL` 和 `OPENAI_API_KEY` 这两行**代码里根本没出现**——它们是 `init_chat_model` 内部按照 OpenAI 的规范**自动去口袋里摸的**（库约定读这两个固定名字）。所以换服务商时，改对"名字"很重要。

### 隐藏知识点：运行时机 —— import 即执行

最后一个关键认知：这个文件**没有函数、没有 `main`，所有代码都摊在模块顶层**。这意味着：

> 项目里任何文件写下 `from agent.llm import model` 的那一刻，这 10 行就**立即执行一遍**——`.env` 被加载、`model` 被造好、放进变量。

比如 `main_agent.py` 开头一句 `from agent.llm import model`，大脑就"到手"了。这种"导入即初始化"的写法在小项目里非常常见，简单直接。

## 📌 概念卡

| 概念 | 一句话 |
|------|--------|
| `.env` + `load_dotenv` | 密钥不进代码，运行时从环境变量读；泄露了立刻轮换 |
| `find_dotenv()` | 向上递归找配置——从哪个目录启动都能找到 |
| `init_chat_model` | 通用造脑工厂：一个函数适配所有厂商 |
| OpenAI 兼容协议 | 一套客户端适配主流模型——换模型只改 `.env` |
| 模块顶层执行 | `import` 的一瞬间就完成初始化 |

## ✍️ 复述题（先自己想，再展开对照）

1. `load_dotenv(find_dotenv())` 里两个函数各干了什么？
2. 为什么 `find_dotenv()` 比写死 `./.env` 更可靠？
3. 用 DeepSeek 时，为什么代码要写 `model_provider="openai"`？
4. 如果把 `.env` 里的 `LLM_QWEN_MAX` 这行删掉，运行项目会发生什么？
5. 公司要求从通义千问切换到 DeepSeek，需要改几个文件、哪些行？

<details>
<summary>💡 参考答案（用自己的话答对意思即可）</summary>

1. `find_dotenv()` 负责"找"——从当前位置向上递归定位 `.env`；`load_dotenv()` 负责"装"——把文件里的 `KEY=VALUE` 全部装载进环境变量。
2. 因为启动目录不固定：无论在根目录还是子目录启动，都能向上找到 `.env`；写死 `./.env` 则一旦不在根目录运行就失败。
3. DeepSeek（及国内主流厂商）兼容 OpenAI 接口协议——同一个"标准口"。选 `"openai"` 通道 = 用标准协议通信；具体连哪家服务器由 `OPENAI_BASE_URL` 决定，钥匙由 `OPENAI_API_KEY` 决定。
4. `os.getenv("LLM_QWEN_MAX")` 会返回 `None`，`init_chat_model` 拿不到模型名，程序在导入/初始化阶段直接报错——这也说明"配置缺失要尽早报错"。
5. 只改一个文件：`.env`，共三行——`OPENAI_BASE_URL`、`OPENAI_API_KEY`、`LLM_QWEN_MAX`。Python 代码一行都不用动。

</details>

## 🎁 动手实验

1. 打开项目的 `.env`，找到三行：`LLM_QWEN_MAX`、`OPENAI_BASE_URL`、`OPENAI_API_KEY`
2. 指着它们说出：哪一行是 llm.py 里"**明着读**"的？哪两行是"**偷偷被用**"的？
3. 【进阶】在项目根目录运行：
   ```bash
   python -c "from agent.llm import model; print(type(model).__name__)"
   ```
   感受"import 即执行"——你只是"导入"了一下，大脑就被造出来了（输出会显示模型对象类型）。

<details>
<summary>💡 答案</summary>

`LLM_QWEN_MAX` 是代码里 `os.getenv("LLM_QWEN_MAX")` 明着读的；`OPENAI_BASE_URL` 和 `OPENAI_API_KEY` 代码里没出现，是 LangChain 按 OpenAI 规范隐式读取的。

</details>

## ➡️ 下一课

**第 2 课：`prompt/prompts.yml`** —— 看看智能体的"人设"和"家规"是怎么写的，那是这个项目里最有"AI 味儿"的部分。
