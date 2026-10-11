# 第 8 课：api/context.py —— "随身口袋"的完整揭秘：ContextVar

> **本节目标**：理解 ContextVar 是什么、为什么比全局变量好（"绝不串台"的秘密）
> **预计时长**：30 分钟 ｜ **前置**：完成第 5~7 课

## 先建立直觉：全课程反复出现的"口袋"，本尊登场

这门课里我们反复提到一个词——**"随身口袋"**：

- 第 5 课（**存**）：`set_session_context` / `set_thread_context` —— "把'当前是谁在干活'装进口袋"，结束时 `reset` 归还
- 第 7 课（**取**）：`monitor._emit` 里 `thread_id = get_thread_context()` —— "从口袋里摸出'这条消息该发给谁'"

这个"口袋"的全套实现，就是这个不到 90 行的文件。它要回答一个惊悚的问题：

> **张三的任务，凭什么不会把消息发给李四？**

先想象一个"穿帮"事故现场：

> 张三和李四同时用系统。张三的 Agent 正在跑，准备推送进度"正在搜索…"——结果这条消息发到了**李四的浏览器**上；张三生成的报告，也存进了**李四的文件夹**。

要搞清楚这个事故为什么**不会**发生（以及差点怎么发生），得先看清 asyncio 的"并发真相"。

## 三种方案，两死一生（文件开头的"教科书"）

这个文件开头有一段很长的注释——作者其实写了半篇"论文"。核心是一个方案对比：

### 方案一：全局变量 ❌ —— 会"串台"

```
User A 的任务跑到一半 → 修改了全局变量
User B 的任务进来了    → 又改了全局变量
User A 继续跑          → 读到的是 User B 改过的值！
```

**先看清 asyncio 的"并发真相"：假并行。**

FastAPI 能同时服务几百个用户，靠的不是几百个线程，而是**一个线程里的多个协程轮流跑**：

```
线程（只有一个）
 └── 事件循环：跑张三的协程一会儿 → 暂停 → 跑李四的协程一会儿 → 暂停 → 跑回张三的…
```

协程们遇到 I/O 等待（等 LLM 回复、等搜索结果）时会主动让出，轮流使用**同一个线程**——这叫**协作式并发**。效率高，但埋着隐患："**现在手头这批数据是张三的还是李四的？**"

用全局变量管理，就会连环出事故：

```python
# ❌ 假如这么写
CURRENT_THREAD_ID = None   # 全局变量，内存里只有一份

# 张三的请求进来：CURRENT_THREAD_ID = "张三"
# 张三角程在等 LLM 回复，让出执行权…
# 李四的请求进来：CURRENT_THREAD_ID = "李四"   ← 覆盖！
# 张三角程恢复执行，读 CURRENT_THREAD_ID → 拿到"李四" ← 串台！
```

全局变量像一块**办公室公共白板**——谁后写就是谁的：张三写到一半，李四上来擦了重写。

### 方案二：threading.local ❌ —— 在异步世界里失效

`threading.local`（线程级局部变量）的思路是"每个线程发一块自己的白板"。听起来对症？坑在于：**asyncio 里所有请求都在同一个线程跑**——所有协程共用一块白板，"隔离"等于没有。

### 方案三：ContextVar ✅ —— "协程级局部变量"

ContextVar 是 Python 3.7+ **专门为异步编程设计**的：隔离的粒度不是"线程"，而是**每个 asyncio Task（也就是每个用户请求）**。

它的魔法在于：**变量名全局共享，但"值"存储在每个协程各自的上下文（Context）里**——每个 Task 都有独立的一份：

```
ContextVar("thread_id")   ← 变量只有一个
  ├── 张三的 Task 上下文里：值 = "abc"
  └── 李四的 Task 上下文里：值 = "def"
```

同一个 `get()`，在张三的协程里返回 `"abc"`、在李四的协程里返回 `"def"`——**自动对号入座，业务代码一个字不用改**。

> 一句话总结：threading.local 认的是"**线程**"，ContextVar 认的是"**任务（协程）**"。在 asyncio 的世界里，隔离必须细到协程这一级——这就是它存在的全部理由。

## 两个"口袋"的申报单

```python
_session_dir_ctx: ContextVar[Optional[str]] = ContextVar("session_dir", default=None)
_thread_id_ctx: ContextVar[Optional[str]]  = ContextVar("thread_id", default=None)
```

- `ContextVar[Optional[str]]`：类型注解——口袋里装的要么是字符串、要么是"还没装"（None）
- `default=None`：没装东西时，摸出来的是 None
- ⭐ **最容易误解的一点**：**真正的值不在变量里**！`_thread_id_ctx` 只是一个"标识符"；同一个 `get()`，在张三的协程里摸出"张三的编号"，在李四的协程里摸出"李四的编号"——值存放在**每个请求自己那层上下文（Context）里**

两个口袋的分工（这部分我全局搜索核实过）：

| 口袋 | 装什么 | 谁在使用（项目实况） |
|---|---|---|
| `session_dir` | 本次会话的工作目录 | **三个工具函数**：`markdown_tools.py`（生成 Markdown）、`pdf_tools.py`（转 PDF）、`upload_file_read_tool.py`（读上传文件）——生成文件前先掏口袋："往哪个目录存？" |
| `thread_id` | 本次会话的编号 | **monitor**（`api/monitor.py`）：上报消息前掏口袋："发给哪个前端连接？"（第 7 课那行） |

> 😄 顺便发现：三个工具文件里都留了"**测试后门**"——直接运行文件单独测试时，会把 `get_session_context` 临时替换成固定值（没人发任务哪来的口袋）。真实世界的代码就是这样"长"出来的：先保证生产能用，再给自己留条测试小路。

## set / get / reset —— 口袋的三件套

### 存：set_xxx

```python
def set_session_context(path: str):
    return _session_dir_ctx.set(path)     # ← 注意：它返回了一个 Token
```

- 把值装进**当前请求的上下文**（只影响这个请求的协程链路，别人摸不到）
- 返回值是一个 **Token（凭证）**——剧透：归还口袋时要凭它

### 取：get_xxx

```python
def get_thread_context() -> Optional[str]:
    return _thread_id_ctx.get()
```

注释里那句是它的灵魂价值：**"可以在任何深层调用的工具函数中直接使用，无需层层传递参数"**。

- 没有它：session 目录要从 API 层一路当**函数参数**传下去 → agent → 子智能体 → 工具 → ……（"参数穿透地狱"：monitor 和接口层隔着五六层调用，靠传参的话**每一层函数签名都得加个 `thread_id` 参数**，极其丑陋；中间任何一层忘了传就断线）
- 有了它：**任何深度**的代码直接 `get`——哪怕工具函数埋在 LangChain 内部深深的调用栈里，也一摸就到

### 还：reset —— Token 机制的妙处

```python
def reset_session_context(session_token, thread_token=None):
    _session_dir_ctx.reset(session_token)
    if thread_token:
        _thread_id_ctx.reset(thread_token)
```

- 注意参数：**不是传新值，而是传 set 时拿到的 Token**
- `reset(token)` 的效果：把值**恢复成"我 set 之前"的样子**——像借还登记：借走口袋时留一张凭证，归还时凭凭证**原样还回**
- 为什么不直接 `set(None)` 清空？因为外层代码可能本来就有值（嵌套场景）——Token 方式能把状态**精确倒回**借出前的模样，而不是粗暴抹掉

## 全链路闭环：口袋的一生（三处代码呼应）

| 时刻 | 代码位置（真实行号） | 动作 |
|---|---|---|
| 任务开始 | `agent/main_agent.py` 第 95~96 行 | `set_session_context` / `set_thread_context` → **拿到两枚 Token** |
| 任务进行中 | `api/monitor.py` 第 56 行；三个工具文件 | `get_thread_context()` 摸"发给谁"；`get_session_context()` 摸"存哪" |
| 任务结束 | `agent/main_agent.py` 第 161 行（`finally`） | `reset_session_context(两枚 Token)` 凭凭证归还 |

一次"存 → 用 → 还"的完整循环，三个文件隔空协作——中间**没有传过一个参数**。这就是 ContextVar 的优雅之处。

> 🌍 **放到更大的坐标系看**："设一次、随处取、收尾清"是**请求级上下文管理**的标准范式——Flask 的 `request` 对象、Django 的 `request.user`，底层都是同样的思想。你在这里学到的这招，出门就是通用技能。

## 📌 概念卡

| 概念 | 一句话 |
|------|--------|
| 协作式并发 | asyncio 的"假并行"：单线程里协程轮流跑，I/O 时让出 |
| 串台 | 全局变量在并发下互相覆盖：张三的数据进李四的目录 |
| threading.local 的坑 | 隔离粒度是"线程"——但 asyncio 全挤在一个线程里，失效 |
| ContextVar | 协程级局部变量：每个请求独立一份，同一个 get 各摸各的 |
| "值不在变量里" | 变量只是标识符；值存在当前请求的 Context 里 |
| set → Token → reset | 记账式归还：恢复成 set 之前的状态，而非暴力清空 |
| 无需传参 | 任何深度的代码直接 get——告别"参数穿透地狱" |

## ✍️ 复述题（先自己想，再展开对照）

1. 为什么不能用全局变量存"当前会话"？（请描述串台的**发生机制**）
2. `threading.local` 为什么在 FastAPI / asyncio 里失效？
3. ContextVar 为什么叫"协程级局部变量"？它和全局变量的关键区别是什么？
4. 如果把第 5 课 `run_deep_agent` 里的 `set_thread_context` 删掉，功能上哪个环节最先坏掉？
5. `set` 返回的 Token 是干嘛的？`reset(token)` 和 `set(None)` 有什么区别？（提示：想想嵌套任务）
6. "无需层层传递参数"指的是什么？不用 ContextVar 的话会有多痛苦？
7. `session_dir` 这个口袋是给谁用的？请一并指出"存 / 用 / 还口袋"三个动作在项目里的位置。

<details>
<summary>💡 参考答案（用自己的话答对意思即可）</summary>

1. 全局变量相当于公共白板：asyncio 的并发请求全在同一线程里"交替"执行，A 的请求改完值、切到 B 的请求改掉同一个变量，切回 A 时读到的已经是 B 的值——数据交叉污染（消息发错人、文件存错目录）。
2. 因为 threading.local 的隔离粒度是"线程"，而 FastAPI/asyncio 里**所有协程都在同一个线程里跑**——隔离维度对不上实际需求，等于没有隔离。
3. 因为它的隔离粒度是"每个 asyncio Task（协程）"：每个用户请求有自己的上下文副本，同一条 `get()` 在不同请求里读到各自的值。全局变量则全项目一份、互相覆盖。
4. `monitor._emit` 里的 `thread_id = get_thread_context()` 会拿到 `None` → 消息找不到收件人（`if thread_id:` 判断直接跳过）→ **WebSocket 实时推送全线失效**，只剩终端的保底打印。最先坏的就是"直播"。
5. Token 是 set 时领的"存档凭证"；`reset(token)` 把变量状态**恢复成 set 之前的样子**。嵌套场景（任务里又开了子任务、子任务 set 了新值）尤其能看出差别：`set(None)` 会把外层的值一起抹掉，而 token 能精确还原旧值。
6. 指深层函数（工具、子智能体等）能直接 `get` 到会话信息，不必让上层把 session_dir / thread_id 一路作为函数参数层层传下去（monitor 和接口层隔着五六层调用，靠传参每一层签名都要加参数）。不这样做的话，调用链上任何一环忘了透传参数就断线——"参数穿透地狱"。
7. `session_dir` 给**三个工具函数**用（markdown_tools / pdf_tools / upload_file_read_tool——它们拿不到接口层的参数，直接从口袋摸出"存哪"）。位置：存 = `agent/main_agent.py` 95~96 行；用 = `api/monitor.py` 56 行 + 三个工具文件；还 = `agent/main_agent.py` 161 行（finally）。

</details>

## 🎁 动手实验

1. 打开 `api/context.py`，对照上文表格，说出两个 ContextVar 各自的"使用者"是谁。
2. 用编辑器全局搜索 `get_thread_context` 和 `get_session_context`——体验"口袋"在各处被掏出的现场（你应该能列出：monitor + 三个工具文件，共 4 处 import）。
3. 【脑内模拟】如果第 5 课的 `finally` 里没有 `reset`，张三的任务刚结束、李四的任务刚开始——李四的任务里 `get_thread_context()` 可能读到什么值？会造成什么后果？

## ➡️ 下一课

**第 9 课：`utils/path_utils.py`** —— Agent 文件安全（上）：第 2 课说的"第二道代码防线"终于登场，12 种边界场景的攻防大全（也是全课程最后一课！）。
