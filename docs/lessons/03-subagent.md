# 第 3 课：agent/subagents/network_search_agent.py —— 子智能体 = 一个字典

> **本节目标**：理解"子智能体 = 字典配置"的极简设计
> **预计时长**：20 分钟 ｜ **前置**：完成第 1、2 课

## 先建立直觉：前两课缺的那块拼图

到目前为止：

- 第 1 课：造好了"大脑"（`model`）
- 第 2 课：写好了"岗位说明书"（`prompts.yml`）

还差一步：**把"说明书"和"工具箱"打包成一个个"能上岗的员工"**——这就是"子智能体"。

你可能以为这得写一个类（class）、一堆方法……这个文件会给你惊喜：**一个子智能体 = 一个字典**。全文如下（真的是全文）：

```python
# 目标： 创建网络搜索子智能体
# 方式1： dict -> deepagents  方式2： compiledSubAgent -> langchain langgraph
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

```python
# 目标： 创建网络搜索子智能体
# 方式1： dict -> deepagents  方式2： compiledSubAgent -> langchain langgraph
```

注释透露了一个知识：创建子智能体有**两条路**——

- **方式 1（本项目的选择）**：写一个**字典**，交给 deepagents 框架。轻量、直观，适合绝大多数场景
- 方式 2：用 LangGraph 把子智能体"编译"成一个复杂对象（compiled subagent），适合需要自定义流程的进阶场景

先掌握方式 1——它是理解一切的基石。

### 第 3~4 行：进货（import）—— 拿"说明书"和"工具"

```python
from agent.prompts import sub_agents_content    # 拿第 2 课的提示词字典
from tools.tavily_tool import internet_search   # 拿网络搜索工具
```

- 第一行：还记得第 2 课启动时打印的两大段字典吗？`sub_agents_content` 就是其中**第二段**（从 prompts.yml 读出来的子智能体配置）。这里取里面 `tavily` 那份
- 第二行：从工具模块里拿 `internet_search`（这个工具的内部实现是第 4 课的主角）

### 第 7~12 行：本体 —— 一个只有 4 个键的字典

```python
network_search_agent = {
    "name":          ...,   # 名字
    "description":   ...,   # 简介（调度依据）
    "system_prompt": ...,   # 岗位说明书
    "tools":         [internet_search]   # 工具箱
}
```

对照第 2 课那张三字段表，你会发现四个键恰好拼出一个"完整员工"：

| 键 | 内容来自 | 给谁看 / 作用 |
|---|---|---|
| `name` | `prompts.yml` | 给主智能体**点名**用 |
| `description` | `prompts.yml` | 给主智能体**判断派活**用 |
| `system_prompt` | `prompts.yml` | 给**自己**干活时遵守 |
| `tools` | **代码** | 它**能干哪些活**（本课唯一的新东西） |

> 💡 一个"员工" = 名字 + 简介 + 岗位说明书 + 工具箱。前三个全是"文字"（来自配置文件），只有"工具箱"是代码。

### 细节里的魔鬼：`internet_search` 为什么没有括号？

```python
"tools":[internet_search]     # ✓ 正确
"tools":[internet_search()]   # ✗ 错误——会当场把函数执行掉！
```

对初学者这是最容易看错的一处：

- **不加括号** = 把"函数本身"交出去（相当于把锤子放进工具箱）
- **加括号** = 当场挥一锤（马上执行搜索，然后把结果塞进列表）

框架要的是"**能力**"（函数本身），等到真正需要搜索时，**框架再去调用它**。记住这个区别——第 4 课还会再见。

## 它被谁使用？把调度链串起来

这个字典造出来后，会交到 `main_agent.py` 手里（摘录简化示意，第 5 课逐行细讲）：

```python
main_agent = create_deep_agent(
    model=model,
    system_prompt=...,
    tools=[...],
    subagents=[database_query_agent, network_search_agent, knowledge_base_agent]
)
```

完整调度链：

```
用户任务
   ↓
主智能体（LLM）读名册 → 决定："这个任务派给【网络搜索助手】"
   ↓
deepagents 在注册列表里找到 network_search_agent 这个字典
   ↓
按字典"装配"出一个能干活的工作体：
   · 告诉它规矩（system_prompt）
   · 给它工具箱（tools）
   ↓
它干活（需要搜索时，框架调用 internet_search）
   ↓
结果交回主智能体
```

你在终端日志里看到的 `[Monitor:assistant_call] 正在调用助手: 网络搜索助手`——那个名字，就是这个字典的 `name` 字段。

## 另外两个子智能体：同一个模子

打开 `database_query_agent.py` 和 `knowledge_base_agent.py`，你会发现它们和本课文件**长得一模一样**，只有两处不同：

1. 取的是 `prompts.yml` 里不同的键（`'db'` / `'ragflow'`）
2. `tools` 列表里换了不同的工具

```python
# database_query_agent.py 的关键行
database_query_agent = {
    "name": sub_agents_content['db']['name'],
    ...
    "tools":[list_sql_tables, get_table_data, execute_sql_query]
}
```

**同一个模子，换料就出新员工**——这就是"字典配置"设计的威力：加一个新助手，就是复制一份字典、换名字换工具（第 2 课练习里展望的"天气查询助手"就是这么加）。

## 📌 概念卡

| 概念 | 一句话 |
|------|--------|
| 子智能体 = 字典 | 不需要 class：一个 4 键字典就是一名"员工" |
| 员工四件套 | name（点名）+ description（调度依据）+ system_prompt（规矩）+ tools（工具箱） |
| 函数不加括号 | 传的是"能力本身"，由框架在需要时调用 |
| 声明式配置 | 你只描述"它是什么"，运行逻辑交给框架 |
| 同一模子 | 三个子智能体只有"取哪份提示词 + 装哪些工具"不同 |

## ✍️ 复述题（先自己想，再展开对照）

1. 一个子智能体由哪四个键组成？其中哪些来自配置文件、哪个来自代码？
2. `"tools":[internet_search]` 里为什么不加括号？加了括号会发生什么？
3. 这个文件没有 class、没有函数定义，为什么它却能"干活"？
4. 终端日志里 `正在调用助手: 网络搜索助手` 的名字，来自字典的哪个字段？
5. 如果明天要给系统加一个"天气查询助手"，你需要做什么？（先说思路）

<details>
<summary>💡 参考答案（用自己的话答对意思即可）</summary>

1. `name` / `description` / `system_prompt`（三者来自 prompts.yml）+ `tools`（来自代码）。前三个是"文字人设"，tools 是"动手能力"。
2. 不加括号 = 把函数本身（能力）放进工具箱，框架需要时再调用；加括号 = 当场执行函数——不仅概念错了，导入这个文件时就会真的发起一次搜索（或直接报错）。
3. deepagents 框架会读取这个字典，在运行时把 system_prompt 和 tools "装配"成一个真正干活的工作体。字典是"配置单"，框架是"施工队"。
4. `name` 字段——主智能体就是靠它点名的（这也是第 2 课强调"名字必须一字不差"的原因）。
5. 照本课模子复制一份：① 在 prompts.yml 给天气助手写一份"岗位说明书"（name/description/system_prompt 三件套）；② 写一个天气查询工具；③ 把三样打包成新字典，④ 注册进 main_agent.py 的 subagents 列表。

</details>

## 🎁 动手实验

1. 在项目根目录运行（会先刷出两段老熟人字典，正常）：
   ```bash
   python -c "from agent.subagents.network_search_agent import network_search_agent as a; print('名字:', a['name']); print('工具数:', len(a['tools'])); print('工具名:', a['tools'][0].name)"
   ```
   亲眼看看这个字典长什么样——把教程里的知识"打印"出来。
2. 打开 `database_query_agent.py` 和 `knowledge_base_agent.py`，找出它们和本课文件的**全部不同点**（提示：只有两处）。

<details>
<summary>💡 实验 2 答案</summary>

不同点只有两处：① 取用的提示词键不同（`'tavily'` vs `'db'` / `'ragflow'`）；② `tools` 列表里装的是各自不同的工具。其余结构一字不差。

</details>

## ➡️ 下一课

**第 4 课：`tools/tavily_tool.py`** —— 打开工具箱：一个 `@tool` 工具函数怎么写、埋点怎么做（`internet_search` 的内部结构，终于要拆开了）。
