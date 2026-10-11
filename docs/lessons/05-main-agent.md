# 第 5 课：agent/main_agent.py —— 整机装配与"指挥中心"的现场直播

> **本节目标**：看懂主智能体怎么创建、怎么编排子智能体、怎么流式执行
> **预计时长**：40 分钟（全项目的心脏，值得慢读）｜ **前置**：完成第 1~4 课

## 先建立直觉：零件到齐，开始拼装

前四课备齐了零件：

- 大脑 `model`（第 1 课）
- 岗位说明书 `prompts.yml`（第 2 课）
- 员工——三个子智能体字典（第 3 课）
- 工具 `@tool`（第 4 课）

这一课把它们**拼成整机**，并启动"干活 + 直播"的完整流程。文件比较长，我们分两大场来看，不一次甩全文：

- **上半场：装配车间** —— `create_deep_agent(...)` 把零件组装成 `main_agent`
- **下半场：指挥中心** —— `run_deep_agent(...)` 负责"接活 → 准备 → 干活 → 实时汇报"

## 上半场：装配车间

### 第一段：进货（import）—— 把零件搬过来

```python
from agent.subagents.knowledge_base_agent import knowledge_base_agent
from agent.subagents.database_query_agent import database_query_agent
from agent.subagents.network_search_agent import network_search_agent   # 第3课的三兄弟
from langgraph.checkpoint.memory import InMemorySaver                    # 记忆装置

# main_agent 自己的工具（注意：不是子智能体的工具）
from tools.markdown_tools import generate_markdown
from tools.pdf_tools import convert_md_to_pdf
from tools.upload_file_read_tool import read_file_content

from deepagents import create_deep_agent      # 装配线
from agent.llm import model                   # 大脑（第1课）
from agent.prompts import main_agent_content  # 说明书（第2课）
from api.monitor import monitor               # 直播设备（第7课预告）
import asyncio
import uuid
import shutil
from pathlib import Path
from api.context import set_session_context, reset_session_context, set_thread_context  # 第8课预告
```

点三个细节：

- 主智能体自己的工具是**文件三件套**（生成 Markdown、转 PDF、读上传文件）——"查信息"外包给子智能体，"写文档"主智能体自己干（第 2 课提示词里约定的分工，代码里兑现了）
- `InMemorySaver` = **记忆装置**：把每轮对话的状态记在内存里（重启就忘）。基础版够用；想持久化可换 `SqliteSaver`（README 的进阶练习）
- `shutil`（文件复制）、`uuid`（生成唯一编号）、`Path`（路径处理）——下半场全都要用

### 第二段：装配！

```python
main_agent = create_deep_agent(
   model = model,                                     # 大脑
   system_prompt=main_agent_content['system_prompt'], # 说明书
   tools= [generate_markdown,convert_md_to_pdf,read_file_content],  # 自己的工具
   checkpointer=InMemorySaver(),                      # 记忆
   subagents=[                                        # 手下三名员工
       database_query_agent,
       network_search_agent,
       knowledge_base_agent
   ]
)
```

数一数：**五个参数 = 前四课的所有零件**。这一行执行完，`main_agent` 就是一个随时能接待任务的"团队负责人"。

（还记得第 3 课说的吗——三个子智能体字典在这里被框架注册成一个个 `task` 工具。就是这一行干的。）

### 第三段：一段"导演手记"（注释）

文件里紧跟一段长注释，是作者写给自己的"设计说明"，大意是：

1. 执行必须用**异步**——因为要同时服务多个客户端
2. 触发链路：客户端 → `POST /api/task` → FastAPI 接口 → 异步执行 → main_agent 运行
3. 流式处理时，关于子智能体调用 / 最终结果 / 会话目录，都要**推送给前端**
4. 调用工具、调用子智能体（`name = task` → monitor）、发送结果的方法……都已经埋好了点

这段注释就是下半场的目录。带着它读代码。

## 下半场：指挥中心 run_deep_agent

```python
async def run_deep_agent(task_query, session_id):
```

两个参数：`task_query` = 用户的问题；`session_id` = 本次会话的唯一编号（每个客户端一个）。函数开头先打印一句"开工宣言"，然后进入准备阶段。

### 步骤 1：给这次会话准备"办公室"（文件夹）

```python
project_root_path = Path(__file__).parents[1].resolve()   # ← 又见 Path(__file__)（第 1 课同款！）
...
session_dir = project_root_path / "output" / f"session_{session_id}"
session_dir.mkdir(parents=True, exist_ok=True)
```

每次任务都在 `output/session_{会话id}/` 下开一间"专属办公室"——生成的所有文件放这里，互不串门。

然后做了一件"一眼看懂、深想有料"的事：**同时准备两种路径**：

```python
session_dir_str = str(session_dir).replace("\\","/")                                          # 绝对路径 → 给系统用
relative_session_dir_str = str(session_dir.relative_to(project_root_path)).replace("\\","/")  # 相对路径 → 给大模型用
```

- **绝对路径**存进"随身口袋"（ContextVar，见步骤 3），供工具函数使用——工具在服务器里跑，得用完整路径才定位得到
- **相对路径**写进给大模型的指令（步骤 4 的"禁止使用绝对路径"）——让模型在相对语义下干活，更稳定、更安全
- `.replace("\\","/")`：把 Windows 的反斜杠统一转成正斜杠（跨平台格式化，避免路径转义踩坑）

### 步骤 2：处理"用户上传的文件"

```python
updated_dir_path = project_root_path / "updated" / f"session_{session_id}"
if updated_dir_path.exists():
    files = [ f.name for f in updated_dir_path.iterdir() if f.is_file()]
    if files:
        for filename in files:
            shutil.copy2(updated_dir_path / filename, session_dir / filename)   # 复制到办公室
        updated_info_prompt = ("\n    [已上传文件] 已加载到工作目录:\n" +
                               "\n".join([f"    - {f}" for f in files]) +
                               "\n    请优先使用工具（read_file_content）读取并参考这些文件。")
```

- 如果用户在聊天里传过文件（存在 `updated/` 里），先**复制**到本次会话的办公室（`copy2` 会保留修改时间等元数据）
- 然后**拼一段提示词**告诉大模型："有上传文件，请先用 `read_file_content` 工具读取"——**用提示词指挥行为**（第 2 课学的要素再次出现）

### 步骤 3：把"会话信息"装进口袋（ContextVar）

```python
session_dir_token = set_session_context(session_dir_str)   # 存：本次会话的文件夹地址
session_id_token = set_thread_context(session_id)          # 存：本次会话的编号
monitor.report_session_dir(session_dir_str)                # 发广播：工作目录已创建
```

- 前两行把"**当前是谁在干活**"记进**协程级随身口袋**（ContextVar）——之后任何深处的工具函数都能"伸手拿出来"（比如埋点上报时要知道"这条消息属于哪个会话"）
- 为什么不用全局变量？第 8 课专讲。现在记住一句话：**多用户并发时不串台**
- 第三行立刻发出广播——你日志里的 `[Monitor:session_created]` 就是它

### 步骤 4：把活"递"给大模型——拼接指令

```python
config = {"configurable": {"thread_id": session_id}}   # 会话身份（记忆装置按它区分"谁是谁"）

path_instruction = f"""
【工作环境指令】
工作目录: {relative_session_dir_str}
{updated_info_prompt}
规则：
1. 新生成文件必须保存到工作目录：'{relative_session_dir_str}/filename'
2. 读取已上传的文件时，请直接将文件名作为 filename 参数传入（read_file_content），不要带目录前缀
3. 使用相对路径，禁止使用绝对路径
4. 若存在上传文件，请先分析内容
"""
```

- `config` 里的 `thread_id` 喂给记忆装置（InMemorySaver）——**不同会话的记忆靠它隔离**
- `path_instruction` 是**工作环境指令**：告诉模型"在哪干活、有什么文件、守什么规矩"
- 真正发给大模型的是：`task_query + path_instruction`——用户问题 + 环境规则**拼成一条消息**送进去

### 步骤 5：流式执行 —— 本课最核心的 30 行 ⭐

```python
try:
    async for chunk in main_agent.astream({
        "messages":[{"role":"user","content":task_query+path_instruction}]
    }, config=config):
        for node_name, state in chunk.items():
            if not state or "messages" not in state: continue
            messages = state["messages"]
            if messages and isinstance(messages, list):
                last_msg = messages[-1]
                if node_name == 'model':
                    if last_msg.tool_calls:
                        for tool_call in last_msg.tool_calls:
                            if tool_call['name'] == 'task':                # ⭐ 子智能体调用！
                                monitor.report_assistant(
                                    tool_call['args']['subagent_type'],
                                    {'description': tool_call['args']['description']})
                    elif last_msg.content:                                     # ⭐ 最终答复
                        print(f"主智能体执行结果，最终结果：{last_msg.content[:100]}")
                        monitor.report_task_result(last_msg.content)
except Exception as e:
    monitor._emit("error", f"执行主智能发生异常信息：{str(e)}")
finally:
    reset_session_context(session_dir_token, session_id_token)
```

逐块拆解：

**① `async for` + `astream` = 边跑边收**
整个任务要跑 1~3 分钟。普通调用（`invoke`）得等全部结束才拿到结果；`astream`（流式）把执行过程切成许多小"块"（chunk），**每跑一步就吐出一块**——这是"实时直播"的技术前提。（代码里注释也曾自问：`invoke/stream/astream` 选哪个？答案是第三个。）

**② chunk 的结构：`{节点名: 状态}`**

```python
for node_name, state in chunk.items():
```

"节点"（node）是 LangGraph 的工作单元——agent 的执行像一条流水线：`model` 节点（大模型思考、下指令）↔ `tools` 节点（真正执行工具）来回流转。我们只盯 **model 节点**的最新消息。

**③ 两种分流——最后一条消息要么"喊工具"，要么"交作业"**

```python
if last_msg.tool_calls:                    # 喊工具（可能一次喊多个）
    for tool_call in last_msg.tool_calls:
        if tool_call['name'] == 'task':    # name == task → 这是在叫子智能体！
            monitor.report_assistant(tool_call['args']['subagent_type'], ...)
elif last_msg.content:                     # 没喊工具 + 有内容 = 最终答复
    monitor.report_task_result(last_msg.content)
```

- **`tool_calls`**：大模型"看说明书 → 下指令"（第 4 课机制）留下的**调用请求列表**
- 其中 `name == 'task'` 的调用 = **派活给子智能体**（第 3 课的伏笔在此收网）——参数 `subagent_type` 正是子智能体的名字。这里**拦截**并广播 → 日志里的 `[Monitor:assistant_call] 正在调用助手: 网络搜索助手` 就是这一处发出的！
- 既没 tool_calls 又有 `content` = 大模型不再派活，直接开口说话 → **最终结果** → 广播 `[Monitor:task_result]`
- （其他工具的调用不在这一层上报——它们的埋点藏在工具函数自己内部，第 4 课见过的那种）

**④ 出错与收尾——工程师的体面**

- `except`：任何意外都推送一条 error 事件（前端能显示失败原因）
- `finally`：无论成功失败，把 ContextVar **还原**（口袋清空）——防止下一位用户"捡到"上一个会话的信息（并发的安全习惯，第 8 课细讲）

## 一图总览

```
POST /api/task（第6课会看到是谁调的）
   ↓ 调用 run_deep_agent(query, session_id)（本课）
准备阶段：建办公室 → 处理上传文件 → 写进 ContextVar 口袋 → 拼接环境指令
   ↓
main_agent.astream(...)  流式执行（本课）
   ├─ model 节点吐 chunk → 有 task 调用？→ [Monitor:assistant_call]（派活直播）
   ├─ tools 节点执行 → 工具内部埋点 → [Monitor:tool_start]（第4课）
   └─ 最终 content → [Monitor:task_result]（交作业直播）
   ↓
finally：清理口袋
```

## 📌 概念卡

| 概念 | 一句话 |
|------|--------|
| create_deep_agent | 装配线：大脑+说明书+工具+记忆+子智能体 → 一台整机 |
| InMemorySaver | 记忆装置：按 thread_id 隔离会话记忆（存内存） |
| astream 流式 | 把执行切成 chunk 边跑边吐——实时直播的前提 |
| chunk = {节点: 状态} | 执行流水线的一步；盯 `model` 节点的最新消息 |
| 两种分流 | `tool_calls` → 喊工具/派子智能体；`content` → 最终答复 |
| name=='task' | 派活子智能体的信号——被拦截后广播 assistant_call |
| ContextVar + finally | 会话信息装进口袋，结束必须清理（防串台） |

## ✍️ 复述题（先自己想，再展开对照）

1. `create_deep_agent(...)` 的五个参数分别是前几课的哪些"零件"？
2. 为什么要同时准备"绝对路径"和"相对路径"两个版本？
3. `astream` 和 `invoke` 有什么区别？为什么本项目必须用流式？
4. 流式循环里判断"这是最终结果"的条件是什么？
5. 日志里 `[Monitor:assistant_call] 正在调用助手：网络搜索助手` 是在代码哪一处触发的？
6. `finally` 里为什么必须 `reset_session_context(...)`？不清理会怎样？

<details>
<summary>💡 参考答案（用自己的话答对意思即可）</summary>

1. `model`=大脑（第1课）；`system_prompt`=说明书（第2课）；`subagents`=三个员工字典（第3课）；`tools`=自己的工具（第4课的 @tool 类型）；`checkpointer`=记忆装置（本课新知识）。
2. 绝对路径给"系统侧"（工具函数、文件操作）用——服务器环境需要完整路径；相对路径给"大模型"用——指令要求"禁止绝对路径"，让模型在相对语义下描述文件，更稳定、换环境不失效、更安全。
3. `invoke` 要等整个任务跑完才拿到结果；`astream` 把过程切成一块块逐步吐出。本项目要把每一步进度实时推给前端（"正在搜索…"），所以必须流式；长任务也让用户不必干等 1~3 分钟。
4. `model` 节点的最新消息**没有 `tool_calls`、但有 `content`**——模型不再需要干活、直接开口说话，那就是最终答复。（`if` 分支管"喊工具"，`elif` 分支管"交作业"。）
5. 在 `astream` 循环里：`node_name == 'model'` 且最新消息的 `tool_calls` 里出现 `name == 'task'` 时，调用 `monitor.report_assistant(...)`。
6. ContextVar 里记着"当前会话的文件夹和 id"。若不清理，下一个任务/另一个用户可能读到**上一个会话的残留**——消息发错人、文件存错目录（"串台"）。`finally` 保证无论成功失败都清理现场。

</details>

## 🎁 动手实验

1. 打开 `agent/main_agent.py`，数 `create_deep_agent(...)` 的参数，对照上文说出每个零件来自第几课。
2. 找到 `if tool_call['name'] == 'task':` 这行——第 3 课伏笔的收网点，画个记号。
3. 【观察】下次跑任务时盯日志：`assistant_call`（派活）→ `tool_start`（工具干活）→ `task_result`（交作业），正好对应本课的三处广播。

## ➡️ 下一课

**第 6 课：`api/server.py`** —— 任务的"前台"：FastAPI 怎么接活、异步任务怎么触发（`run_deep_agent` 到底是谁调用的？答案在下一课）。
