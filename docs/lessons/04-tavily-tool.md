# 第 4 课：tools/tavily_tool.py —— @tool：把普通函数"点化"成工具

> **本节目标**：看懂一个完整的 `@tool` 工具怎么写、"埋点"是怎么回事
> **预计时长**：25 分钟 ｜ **前置**：完成第 3 课

## 先建立直觉：打开工具箱

第 3 课我们拿到了"工具箱"——网络搜索子智能体的 `"tools":[internet_search]`。这节课就"打开工具箱"，看一件工具是怎么造出来的。

先给一个心理预设：**造一件工具 = 写一个普通 Python 函数 + 贴一张"点化符"**。全文如下：

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

第二行用 `.env` 里的钥匙，造出一个 Tavily **客户端对象**——相当于办了一张"搜索服务的会员卡"。之后每次搜索都刷这张卡。

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

- **`@tool`**：装饰器，"点化符"。技术上它是把下面的函数包装了一层、装上 Agent 接口。不用深究实现，先记住效果：贴上后，函数变成 LangChain 工具对象——**框架能自动读出它的名字、参数、说明**（第 3 课那句"LangChain 从函数对象上自动读信息"，这就是现场）
- **四个参数**：这就是给大模型看的"参数填写说明"：

| 参数 | 类型 | 作用 |
|------|------|------|
| `query` | `str` | 搜索词（必填） |
| `topic` | `Literal["news", "finance", "general"]` | 搜索频道——**限定三选一**，默认 general |
| `max_results` | `int` | 返回条数，默认 5 |
| `include_raw_content` | `bool` | 要摘要（False）还是全文（True） |

- **`Literal` 是"下拉菜单"**：普通 `str` 什么都能填，`Literal` 限定"只能从这三项里选"——防止模型填一个服务不认识的类别导致报错。这是**防呆设计**
- 类型注解（`str`/`int`/`bool`）不是摆设：**Agent 靠它们知道每个参数该填什么类型**

### docstring：写给 LLM 看的"使用说明书" ⭐

```python
"""
根据用户问题，进行网络信息收！
注意：主要搜索公开的网络信息！如果指定查询数据库或rag不能使用此工具！
:param query: 用户的查询信息
...
"""
```

**这是本课最重要的认知**：这段三引号文字**不是给自己看的注释，而是写给大模型看的说明书**！

大模型决定"要不要调用这个工具、参数怎么填"时，读的就是：**函数名 + docstring + 参数签名**。所以好 docstring 要做两件事：

1. 说清楚"**什么时候用它**"——搜索公开网络信息
2. 说清楚"**什么时候别用它**"——查数据库或 RAG 内容时不许用（这句"负面说明"和第 2 课主智能体的决策规则遥相呼应）

（😄 顺便：作者把"信息收集"打成了"信息收"——真实世界的代码就是这样，瑕不掩瑜，你以后也会写错字。）

### 函数体：先报告，再干活

```python
monitor.report_tool(tool_name="网络搜索工具", args={...})   # ① 先举手报告
return tavily_client.search(...)                            # ② 再真正干活
```

**① 埋点**：`monitor.report_tool(...)` 把"我要开始干活了 + 参数是什么"上报给监控系统。
- "埋点"来自统计/监控领域：在关键位置**预埋上报点**，运行时自动采集信息
- 你在日志里看到的 `[Monitor:tool_start] 开始执行工具: 网络搜索工具`——**就是这行代码当场触发的**！（第 7 课会拆开 monitor，看它怎么把消息送到终端和前端）

**② 真正干活**：`tavily_client.search(...)` 刷会员卡调用 Tavily 服务，参数原样传入，返回搜索结果（一个字典）。

工具的标准结构就此成型：

```
先报告（可观测性）→ 再干活（业务逻辑）→ 返回结果
```

## 工具的"四件套"解剖图

```
@tool                                  ← 点化：普通函数 → Agent 工具
def internet_search(query, ...):       ← 签名：名字+参数 = 参数填写说明
    """什么时候用我、什么时候别用我"""  ← 说明书：给 LLM 的"使用指南"
    monitor.report_tool(...)           ← 埋点：先举手报告
    return tavily_client.search(...)   ← 干活：调用外部服务
```

Agent 的每一次搜索，都是框架按这份"说明"决定调用、按签名填参数、函数体执行、结果回传——和子智能体的"字典装配"（第 3 课）是同一个哲学：**你写声明，框架干活**。

## 📌 概念卡

| 概念 | 一句话 |
|------|--------|
| `@tool` | 点化符：普通函数 → Agent 工具；框架自动读名字/参数/说明 |
| docstring | 写给 **LLM** 的使用说明书——它决定"用不用、怎么用" |
| 类型注解 + Literal | 参数说明书：约束取值范围，防模型乱填 |
| 埋点（report_tool） | 关键位置预埋上报点——日志里的 `[Monitor:tool_start]` 就是它 |
| 工具标准结构 | 先报告 → 再干活 → 返回结果 |

## ✍️ 复述题（先自己想，再展开对照）

1. `@tool` 这一行"点化"了什么？如果删掉它，这个函数还能被 Agent 用吗？
2. docstring 和普通 `#` 注释有什么区别？这段 docstring 主要写给谁看？
3. `monitor.report_tool(...)` 埋点的作用是什么？你在哪里见过它的效果？
4. `topic` 参数为什么写成 `Literal["news","finance","general"]` 而不是普通 `str`？
5. 如果公司要换成另一个搜索服务（比如 Bing），这个文件要改哪几处？哪些部分可以原样保留？

<details>
<summary>💡 参考答案（用自己的话答对意思即可）</summary>

1. `@tool` 把普通函数包装成 LangChain 工具对象，框架因此能自动读出它的名字、参数、docstring，并在需要时调用。删掉它就是一个普通函数——Agent 根本不知道它存在，也不会调用。
2. `#` 注释只给人看；docstring 是**给 LLM 看的工具说明书**——大模型靠它（连同函数名和参数签名）决定"这个工具该不该用、什么时候用"。本项目里它还额外承担"什么时候别用"的警告职责。
3. 在关键位置预埋"上报点"：把"工具开始执行 + 参数"推送给监控系统。效果就是日志里的 `[Monitor:tool_start] 开始执行工具: 网络搜索工具`（它同时会被推送到前端做实时进度显示）。
4. "下拉菜单"式约束：普通 `str` 模型可能填一个服务不认识的类别导致报错；`Literal` 限定只能三选一，是防呆设计，同时也告诉模型"有哪些选项"。
5. 改两处：① 初始化区（换成新服务的客户端和钥匙）；② 函数体里的 `tavily_client.search(...)` 换成新服务的调用。而 `@tool`、函数签名、docstring、埋点这些"骨架"基本原样保留——**换工具 = 换内脏，不换骨架**。

</details>

## 🎁 动手实验

1. 在项目根目录运行（会真实调用一次搜索，消耗一点点免费额度；注意终端里会冒出一行 `[Monitor:tool_start]`——那是埋点在工作）：
   ```bash
   python -c "from tools.tavily_tool import internet_search; r = internet_search.invoke({'query': 'latest AI agents', 'max_results': 2}); print('收到结果数:', len(r['results'])); print('第一条标题:', r['results'][0]['title'])"
   ```
2. 打开 `tools/db_tools.py`，找到它的 `@tool` 和 `monitor` 埋点——验证"每个工具都是同一个套路"。

<details>
<summary>💡 实验说明</summary>

`internet_search.invoke({...})` 是"手动调用工具"——平时都是 Agent 自动调，这次你自己当一回 Agent。参数用字典传入，和 Agent 填参数的方式完全一样。如果报错（比如钥匙无效或额度提示），检查 `.env` 里的 `TAVILY_API_KEY`。

</details>

## ➡️ 下一课

**第 5 课：`agent/main_agent.py`** —— 核心中的核心：主智能体怎么创建、怎么编排、怎么流式执行（前四课的零件，终于要拼成整机了）。
