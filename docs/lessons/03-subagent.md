# 第 3 课：agent/subagents/network_search_agent.py —— 子智能体 = 一个字典

> **本节目标**：理解"子智能体 = 字典配置"的极简设计
> **预计时长**：25 分钟 ｜ **前置**：完成第 1、2 课

## 先建立直觉：前两课缺的那块拼图

到目前为止：

- 第 1 课：造好了"大脑"（`model`）
- 第 2 课：写好了"岗位说明书"（`prompts.yml`）

还差一步：**把"说明书"和"工具箱"打包成一个个"能上岗的员工"**——这就是"子智能体"。

先做个心理准备——这个文件一共 **12 行**，**没有类、没有函数、没有任何逻辑**。第一次读的人往往会愣住：

> **这就完了？一个 Agent 就是一个字典？**

对，这就是本课要建立的核心认知。全文如下：

```python
# 目标： 创建网络搜索子智能体
# 方式1： dict -> deepagents  方式： compiledSubAgent -> langchain langgraph
from agent.prompts import sub_agents_content
from tools.tavily_tool import internet_search

network_search_agent = {
    "name":sub_agents_content['tavily']['name'],
    "description":sub_agents_content['tavily']['description'],
    "system_prompt":sub_agents_content['tavily']['system_prompt'],
    "tools":[internet_search]
}
```

## 逐行解读

### 第 1~2 行：注释 —— 一条重要的"路线信息"

注释透露了一个知识：创建子智能体有**两条路**——

- **方式 1（本项目的选择）**：写一个**字典**，交给 deepagents 框架。轻量、直观，适合绝大多数场景
- **方式 2**：用 LangGraph 把子智能体"编译"成一个复杂对象（compiled subagent），适合需要自定义流程的进阶场景

先掌握方式 1——它是理解一切的基石。

### 第 3 行：拿"岗位说明书"

```python
from agent.prompts import sub_agents_content
```

`agent/prompts.py`（一个 30 行的小工具文件）用 `yaml.safe_load` 把 `prompts.yml` 读成 Python 字典，`sub_agents_content` 就是其中 `sub_agents:` 那一整块。所以：

```python
sub_agents_content['tavily']['name']        # → "网络搜索助手"
sub_agents_content['tavily']['description'] # → "负责进行网络知识搜索的智能体助手……"
```

**提示词一字不改地从 YAML 流进代码**——这就是"配置与代码分离"的现场：想改助手的人设，只动 YAML，不碰 Python。

### 第 4 行：拿"工具"

```python
from tools.tavily_tool import internet_search
```

这个 `internet_search` 就是被 `@tool` 装饰过的函数（下一课细讲）。注意：这里导入的是**函数对象本身**，不是字符串名字——**LangChain 能从函数对象上自动读出它的名字、参数、说明文档（docstring）**，所以框架天生就知道"这工具叫什么、怎么用"。

### 第 7~12 行：本体 —— 一个只有 4 个键的字典

```python
network_search_agent = {
    "name":          ...,   # 名字
    "description":   ...,   # 简介（调度依据）
    "system_prompt": ...,   # 岗位说明书
    "tools":         [internet_search]   # 工具箱
}
```

四个键恰好拼出一个"完整员工"：

| 键 | 值从哪来 | 给谁看 / 作用 |
|---|---|---|
| `name` | YAML | 主智能体**点名**用 |
| `description` | YAML | 主智能体**判断该不该派给它**（调度依据） |
| `system_prompt` | YAML | 这个子智能体**自己**干活时遵守 |
| `tools` | 代码导入 | 它**能调用的函数清单** |

> 💡 一个"员工" = 名字 + 简介 + 岗位说明书 + 工具箱。前三个全是"文字"（配置文件），只有"工具箱"是代码。

### 细节里的魔鬼：`internet_search` 为什么没有括号？

```python
"tools":[internet_search]     # ✓ 正确
"tools":[internet_search()]   # ✗ 错误——会当场把函数执行掉！
```

- **不加括号** = 把"函数本身"交出去（把锤子放进工具箱）
- **加括号** = 当场挥一锤（马上执行搜索，把结果塞进列表）

框架要的是"**能力**"（函数对象），等真正需要搜索时，**框架再去调用它**。记住这个区别——第 4 课还会再见。

## 关键问题：这个字典之后经历了什么？

这是本课最值得理解的部分。字典造出来后，会交到 `main_agent.py` 手里（第 5 课细讲，先剧透）：

```python
main_agent = create_deep_agent(
    model=model,
    system_prompt=...,
    tools=[...],
    subagents=[database_query_agent, network_search_agent, knowledge_base_agent]
)
```

`create_deep_agent` 拿到字典列表后，框架在背后做了一件神奇的事：

> **它把每个子智能体字典，注册成主智能体的一个名叫 `task` 的工具。**

也就是说，在主智能体眼里，"派任务给网络搜索助手"不是人际喊话，而是**一次普普通通的工具调用**：

```python
task(subagent_type="网络搜索助手", description="搜索 AI Agent 最新进展")
```

完整协作链条：

```
用户提问 → 主智能体（LLM）思考："这需要外部信息"
        → LLM 决定调用 task 工具，参数 subagent_type="网络搜索助手"
        → 框架拦截这个调用，找到对应字典
        → 用字典里的 system_prompt + tools 临时组建一个子 Agent，去执行
        → 结果作为工具返回值，回到主智能体手里
```

有意思的是——你在日志里看到的 `[Monitor:assistant_call] 正在调用助手: 网络搜索助手`，正是 `main_agent.py` **拦截这次 `task` 工具调用**后上报的（第 5 课会看到那段代码）。

**所以"子智能体 = 字典"的真相是**：字典只是**原材料**（说明书 + 工具清单），框架负责在需要时把它"**激活**"成一个真正运行的 Agent。你不需要写类、写调度逻辑——deepagents 全包了。这正呼应原项目 FAQ 里的话：先理解"用框架能做什么"，再去理解"框架怎么做到的"。

## 同一个模子：三兄弟与"天气助手"

打开 `database_query_agent.py` 和 `knowledge_base_agent.py`，和本课文件**长得一模一样**，只有两处不同：① 取的 YAML 键不同（`'db'` / `'ragflow'`）；② `tools` 里装了不同的工具。

```python
# database_query_agent.py 的关键行
database_query_agent = {
    "name": sub_agents_content['db']['name'],
    ...
    "tools":[list_sql_tables, get_table_data, execute_sql_query]
}
```

如果你按第 2 课练习把"**天气查询助手**"真正做出来，它会长这样：

```python
weather_agent = {
    "name": sub_agents_content['weather']['name'],         # "天气查询助手"
    "description": sub_agents_content['weather']['description'],
    "system_prompt": sub_agents_content['weather']['system_prompt'],
    "tools": [get_weather]
}
```

**加一个子智能体的全部成本**：① YAML 加一段说明书 → ② 写一个工具函数 → ③ 定义一个字典 → ④ 注册进 subagents 列表。同一个模子，换料就出新员工——这就是这个架构最迷人的扩展性。

## 📌 概念卡

| 概念 | 一句话 |
|------|--------|
| 子智能体 = 字典 | 不需要 class：一个 4 键字典就是一名"员工" |
| 员工四件套 | name（点名）+ description（调度依据）+ system_prompt（规矩）+ tools（工具箱） |
| 函数不加括号 | 传的是"函数对象"（能力本身）；LangChain 能从它身上自动读出名字和说明 |
| 框架的魔法 | `create_deep_agent` 把每个字典注册成主智能体的 `task` 工具 |
| 调度本质 | 主智能体"派活" = 一次 `task` 工具调用，参数是子智能体名字 |
| 同一模子 | 三个子智能体只有"取哪份提示词 + 装哪些工具"不同 |

## ✍️ 复述题（先自己想，再展开对照）

1. 一个子智能体由哪四个键组成？哪些来自配置文件、哪个来自代码？
2. `"tools":[internet_search]` 里为什么不加括号？加了会怎样？
3. 如果 `description` 写得很敷衍（比如只写"一个助手"），会发生什么？
4. `"tools"` 的值是个**列表**——这意味着什么？能给一个子智能体配两个工具吗？
5. 这个文件没有类、没有函数定义，为什么它却能"干活"？（框架做了什么？）
6. 如果把 YAML 里的 name 改成"网搜小助手"，但主智能体 prompt 里的名册不改，会怎样？

<details>
<summary>💡 参考答案（用自己的话答对意思即可）</summary>

1. `name` / `description` / `system_prompt`（三者来自 prompts.yml）+ `tools`（来自代码）。前三个是"文字人设"，tools 是"动手能力"。
2. 不加括号 = 把函数对象（能力）放进工具箱，框架需要时再调用；加括号 = 当场执行函数——不仅概念错了，导入这个文件时就会真的发起一次搜索（或直接报错）。
3. `description` 是主智能体的**调度依据**——写得含糊，主智能体就难以判断"这个任务该不该派给它"，可能漏派、错派，或干脆自己硬着头皮上。好的 description 要像招聘 JD：写清"能干什么、什么时候找我"。
4. 列表 = 这个员工可以配**多个**工具，像一套工具箱。完全可以配两个（比如同时给它 `internet_search` 和 `get_weather`），它会按需要在里面挑。
5. deepagents 框架会读取字典，把它注册成主智能体的 `task` 工具；主智能体点名派活时，框架按字典的 system_prompt + tools 临时装配出真正干活的工作体。字典是"配置单"，框架是"施工队"。
6. 调度会断链：主智能体按名册里的"网络搜索助手"去点名，但注册表里叫"网搜小助手"，对不上——这正是第 2 课强调"**名字必须一字不差**"的实战后果。改名要两边同时改。

</details>

## 🎁 动手实验

1. 在项目根目录运行（会先刷出两段老熟人字典，正常）：
   ```bash
   python -c "from agent.subagents.network_search_agent import network_search_agent as a; print('名字:', a['name']); print('工具数:', len(a['tools'])); print('工具名:', a['tools'][0].name)"
   ```
   亲眼看看这个字典长什么样——把教程里的知识"打印"出来。
2. 打开 `database_query_agent.py` 和 `knowledge_base_agent.py`，找出和本课文件的**全部不同点**（提示：只有两处）。
3. 打开 `agent/main_agent.py`，搜索 `'task'` 这个词——找到框架"派活"的现场证据（第 5 课会逐行讲这段）。

<details>
<summary>💡 实验 2 答案</summary>

不同点只有两处：① 取用的提示词键不同（`'tavily'` vs `'db'` / `'ragflow'`）；② `tools` 列表里装的是各自不同的工具。其余结构一字不差。

</details>

## ➡️ 下一课

**第 4 课：`tools/tavily_tool.py`** —— 看一个普通 Python 函数如何被 `@tool` "点化"成 Agent 能用的工具，以及"**埋点**"是怎么回事（`internet_search` 的内部结构，终于要拆开了）。
