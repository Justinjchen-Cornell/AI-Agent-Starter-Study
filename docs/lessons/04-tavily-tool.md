# 第 4 课：tools/tavily_tool.py —— @tool：把普通函数"点化"成 Agent 的"手"

> **本节目标**：看懂一个完整的 `@tool` 工具怎么写、"埋点"是怎么回事
> **预计时长**：30 分钟 ｜ **前置**：完成第 3 课

## 先建立直觉：大模型又不会执行 Python，凭什么用你的函数？

第 3 课我们拿到了"工具箱"——网络搜索子智能体的 `"tools":[internet_search]`。这节课打开工具箱，看一件工具是怎么造出来的。

先摆出本课要回答的核心问题：

> **一个普普通通的 Python 函数，凭什么能被大模型调用？大模型又不会执行 Python 代码！**

答案全在这 50 行里。心理预设先给好：**造一件工具 = 写一个普通函数 + 贴一张"点化符"**。全文如下：

```python
# 定义一个网络搜索的工具！
# ======================== 导入核心依赖 ========================
# 类型注解：增强代码提示和静态检查能力
from typing import  Literal
# LangChain 工具装饰器：将普通函数转为 Agent 可调用的工具
from langchain_core.tools import tool
# Tavily 官方客户端：实现网络搜索核心功能
from tavily import TavilyClient

# 系统/第三方依赖
import os  # 系统路径/环境变量处理
from dotenv import load_dotenv  # 加载 .env 文件中的环境变量

# 自定义模块：工具调用埋点监控（需确保 api 模块可导入）
from api.monitor import monitor

# ======================== 初始化配置 ========================
# 加载项目根目录的 .env 文件，读取环境变量（如 TAVILY_API_KEY）
load_dotenv()

# 步骤1： 定义一个TavilyClient对象
tavily_client = TavilyClient(api_key=os.getenv("TAVILY_API_KEY"))

# 步骤2： 定义一个网络搜索工具
@tool
def internet_search(
        query: str,
        topic: Literal["news", "finance", "general"] = "general",
        max_results: int = 5,
        include_raw_content: bool = False
):
    """
    根据用户问题，进行网络信息收！
    注意：主要搜索公开的网络信息！如果指定查询数据库或rag不能使用此工具！
    :param query: 用户的查询信息
    :param topic: 查询的类型
    :param max_results: 返回的最大条数
    :param include_raw_content: 是否返回原内容 False 精简 True 详细
    :return:
    """
    # 每次调用工具，都会向前端推进调用进度！
    # 参数1： 工具的名字  参数2： 就是调用工具的参数信息
    monitor.report_tool(tool_name="网络搜索工具",
                        args={"query": query, "topic": topic, "max_results": max_results,
                              "include_raw_content": include_raw_content})

    return tavily_client.search(query=query, topic=topic,
                                max_results=max_results, include_raw_content=include_raw_content)
```

## 逐行解读

### 导入区：四类"合作伙伴"

| 伙伴 | 是什么 | 本课角色 |
|------|--------|----------|
| `Literal`（来自 `typing`） | 类型工具箱里的工具：给参数做"下拉菜单"限定 | 防呆设计 |
| `tool`（来自 `langchain_core`） | **点化符**：把普通函数变成 Agent 工具 | 本课主角 |
| `TavilyClient`（来自 `tavily`） | 搜索服务官方客户端 | 真正干活的"手" |
| `os` + `load_dotenv` | 老熟人：读钥匙（`.env`） | 后勤 |
| `monitor`（来自 `api.monitor`） | 埋点监控单例 | 内应（第 7 课主角） |

### 初始化区：先办一张"会员卡"

```python
load_dotenv()   # 把 .env 装进口袋（第 1 课学的老套路）
tavily_client = TavilyClient(api_key=os.getenv("TAVILY_API_KEY"))
```

第二行用 `.env` 里的钥匙造出一个 Tavily **客户端对象**——相当于办了一张"搜索服务的会员卡"。之后每次搜索都刷这张卡。

### 函数签名：工具的"长相"——也是给 LLM 的"参数说明书"

```python
@tool
def internet_search(
        query: str,
        topic: Literal["news", "finance", "general"] = "general",
        max_results: int = 5,
        include_raw_content: bool = False
):
```

- **`@tool`**：装饰器，"点化符"（它具体干了什么，下一节"核心魔法"揭晓）
- **四个参数**就是给大模型看的"参数填写说明"：

| 参数 | 类型 | 作用 |
|------|------|------|
| `query` | `str` | 搜索词（必填） |
| `topic` | `Literal[...]` | 搜索频道——**限定三选一**，默认 general |
| `max_results` | `int` | 返回条数，默认 5 |
| `include_raw_content` | `bool` | 要摘要（False）还是全文（True） |

**参数设计里藏着三个"克制"**：

1. `Literal` 是"下拉菜单"：限定"只能三选一"——**大模型想填错都填不了**（防呆设计）
2. 每个参数都有默认值：大模型最少只填一个 `query` 就能调用——**降低调用门槛**
3. `max_results` 默认 5：不给限制的话，大模型可能一次要 100 条结果，既烧钱又占用上下文（模型的"工作内存"）

### docstring：写给 LLM 看的"使用说明书" ⭐

```python
"""
根据用户问题，进行网络信息收！
注意：主要搜索公开的网络信息！如果指定查询数据库或rag不能使用此工具！
:param query: 用户的查询信息
...
"""
```

**关键认知**：这段三引号文字**不是给自己看的注释，而是写给大模型看的说明书**。大模型决定"要不要用这个工具、参数怎么填"时，读的就是：**函数名 + docstring + 参数签名**。所以好 docstring 要做两件事：

1. 说清"**什么时候用它**"——搜索公开网络信息
2. 说清"**什么时候别用它**"——查数据库或 RAG 内容时不许用

那句"使用边界"看似唠叨，实则关键：系统里有三个子智能体，不划清边界，大模型可能拿搜索工具去查数据库内容。记住这句话：**提示词工程不只发生在 prompts.yml，也发生在每个 docstring 里。**

（😄 顺便：作者把"信息收集"打成了"信息收"——真实世界的代码就是这样，瑕不掩瑜，你以后也会写错字。）

### 函数体：先报告，再干活

```python
monitor.report_tool(tool_name="网络搜索工具", args={...})   # ① 先举手报告
return tavily_client.search(...)                            # ② 再真正干活
```

**① 埋点**：把"我要开始干活了 + 参数是什么"上报给监控系统（日志里的 `[Monitor:tool_start]` 就是它）。
**② 真正干活**：刷会员卡调用 Tavily 服务，返回搜索结果（字典）。

**为什么埋点放在函数开头，而不是结尾？** 因为搜索要好几秒——开头就上报，用户立刻看到"正在搜索"的反馈；如果放结尾，就失去"实时进度"的意义了。（monitor 内部怎么把消息送到前端，第 7 课讲。）

工具的标准结构：**先报告（可观测性）→ 再干活（业务逻辑）→ 返回结果**

## 核心魔法：`@tool` 到底干了什么？

`@tool` 是 LangChain 的装饰器。它在 import 的那一刻，对这个函数做了一次"全身扫描"，自动提取**四样东西**，打包成一个 Tool 对象：

| 提取的东西 | 来自哪里 | 用途 |
|------|------|------|
| 工具名 | 函数名 `internet_search` | 大模型点名调用 |
| **功能说明** | **docstring** | 大模型判断"什么时候该用它" |
| 参数清单 | 类型注解 `query: str` 等 | 大模型知道要填哪些参数、什么类型 |
| 参数说明 | docstring 里的 `:param query:` 等 | 大模型知道每个参数填什么 |

然后，当这个工具被交给 Agent 时，LangChain 会把四样东西**翻译成一段 JSON Schema**，塞进发给大模型的请求里，大致长这样：

```json
{
  "name": "internet_search",
  "description": "根据用户问题，进行网络信息收！注意：主要搜索公开的网络信息！",
  "parameters": {
    "query": {"type": "string", "description": "用户的查询信息"},
    "topic": {"type": "string", "enum": ["news", "finance", "general"]},
    "max_results": {"type": "integer"}
  }
}
```

大模型"读到"这份说明书后，当它决定搜索时——**它输出的不是搜索结果，而是一段结构化的"调用请求"**：

```json
{"tool": "internet_search", "args": {"query": "AI Agent 最新进展", "max_results": 5}}
```

框架（deepagents / LangGraph）收到请求，**真正执行这个 Python 函数**，把返回值再喂回给大模型。

> 🧠 **本课最重要的认知**：**大模型从不亲自执行代码。它只是"看说明书 → 下指令"，框架负责执行。**
> 所以——**docstring 写得含糊，大模型就会乱用工具；写得清楚，它就用得准。**

再回头看一次它的全貌：

```
@tool                                  ← 点化：扫描并打包成 Tool 对象
def internet_search(query, ...):       ← 签名：参数清单 + 类型（→ JSON Schema）
    """什么时候用我、什么时候别用我"""  ← 说明书：description（→ 给模型看）
    monitor.report_tool(...)           ← 埋点：先举手报告（放开头！）
    return tavily_client.search(...)   ← 干活：框架真正执行的就是这一行
```

## 串起全链路：一次搜索的完整旅程

把前四课串起来，看"一次搜索"从生到死：

```
用户："查一下 AI Agent 最新进展"
  → 主智能体读 prompts.yml 决策规则 → 派给"网络搜索助手"（第 2、3 课）
  → 子智能体亮出自己的工具清单，里面有 internet_search
  → 大模型读 JSON Schema 说明书 → 输出调用请求 {"query": "AI Agent 最新进展"}（本课）
  → 框架执行函数：开头 monitor 埋点 → 终端/前端显示"正在搜索"（本课）
  → tavily_client 带着 TAVILY_API_KEY 请求 Tavily 服务（你配 Key 的那一步）
  → 结果 JSON 返回 → 喂回大模型 → 汇总
```

## 📌 概念卡

| 概念 | 一句话 |
|------|--------|
| `@tool` | 扫描函数的名字/注解/docstring，打包成大模型能读的 Tool 对象 |
| 大模型不执行代码 | 它只输出"调用请求"JSON，框架负责真正执行函数 |
| docstring = 说明书 | 写给大模型看；质量直接决定工具用得准不准 |
| 类型注解 = 防呆 | `Literal` 枚举 + 默认值：约束范围、降低调用门槛 |
| 埋点放在开头 | 函数一执行就上报，用户立刻看到实时进度 |
| 工具标准结构 | 先报告 → 再干活 → 返回结果 |

## ✍️ 复述题（先自己想，再展开对照）

1. `@tool` 这一行"点化"了什么？如果删掉它，函数还能被 Agent 用吗？
2. docstring 和普通 `#` 注释有什么区别？如果把 docstring 删光（只留代码），工具还能被调用吗？大模型的表现会有什么变化？
3. `monitor.report_tool(...)` 埋点的作用是什么？删掉它功能上会坏吗？用户体验上损失什么？
4. `topic` 参数为什么写成 `Literal["news","finance","general"]` 而不是普通 `str`？
5. 假设要给"天气助手"写一个 `get_weather(city: str)`，想让它能查"未来几天"的预报，函数签名怎么改？（写出改后的 def 行即可）
6. 如果公司要换成另一个搜索服务（比如 Bing），这个文件要改哪几处？哪些部分可以原样保留？

<details>
<summary>💡 参考答案（用自己的话答对意思即可）</summary>

1. `@tool` 在 import 时扫描函数，把名字/说明/参数信息打包成 LangChain Tool 对象，框架因此知道它的存在和用法。删掉它就是一个普通函数——Agent 根本不知道它存在，也不会调用。
2. `#` 注释只给人看；docstring 是**给 LLM 看的说明书**（会被翻译进 JSON Schema 的 description）。删光后工具在技术上"还在"，但大模型失去了判断依据——不知道什么时候用它、参数什么意思，会漏用、错用或填错参数。**它是模型选择工具的依据，不是注释。**
3. 埋在函数开头的"上报点"：把"开始执行 + 参数"推给监控系统，日志/前端显示"正在搜索"。删掉它功能不会坏（搜索照常），但**用户看不到实时进度**——"看得见的干活"变成了"黑盒"。
4. 防呆设计：`str` 模型可能填一个服务不认识的类别；`Literal` 限定三选一，同时也告诉模型"有哪些选项"。
5. 例如：`def get_weather(city: str, days: int = 1):` —— 加一个 `days` 参数（整数、默认 1），并在 docstring 里补一行说明。模型看到参数清单，就会在需要时填写它。
6. 改两处：① 初始化区（换客户端和钥匙）；② 函数体里的调用。骨架（@tool / 签名 / docstring / 埋点）原样保留——**换工具 = 换内脏，不换骨架**。

</details>

## 🎁 动手实验

1. 在项目根目录运行（真实调用一次搜索；注意终端会先冒出一行 `[Monitor:tool_start]`，然后才出结果——**这就是"埋点放在开头"的效果**）：
   ```bash
   python -c "from tools.tavily_tool import internet_search; r = internet_search.invoke({'query': 'latest AI agents', 'max_results': 2}); print('收到结果数:', len(r['results'])); print('第一条标题:', r['results'][0]['title'])"
   ```
2. 打开 `tools/db_tools.py`，找到它的 `@tool` 和 `monitor` 埋点——验证"每个工具都是同一个套路"。

<details>
<summary>💡 实验说明</summary>

`internet_search.invoke({...})` 是"手动调用工具"——平时都是 Agent 自动调，这次你自己当一回 Agent。参数用字典传入，和 Agent"填参数"的方式完全一样。如果报错（比如钥匙无效或额度提示），检查 `.env` 里的 `TAVILY_API_KEY`。

</details>

## ➡️ 下一课

**第 5 课：`agent/main_agent.py`** —— 核心中的核心：主智能体怎么创建、怎么编排、怎么流式执行（前四课的零件，终于要拼成整机了）。
