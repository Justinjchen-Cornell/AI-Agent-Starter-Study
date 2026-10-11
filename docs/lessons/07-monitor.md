# 第 7 课：api/monitor.py —— 直播背后的"导播室"

> **本节目标**：看懂 WebSocket 实时推送的机制、理解"事件循环归属判断"
> **预计时长**：40 分钟 ｜ **前置**：完成第 6 课

## 先建立直觉：消息是怎么"飞"到浏览器的？

前六课我们已经有了全链路：任务在后台跑（第 5、6 课）、埋点在工具和主智能体里到处发射（第 4、5 课）、WebSocket 电话线挂着（第 6 课）。

还缺最关键的一环：**埋点发出的消息，怎么安全地"送达"挂着的电话线？** 这一环由本文件（导播室）完成：

```
埋点发射（monitor.report_xxx）
     ↓
导播室（本文件）：组装消息 → 判断"我在哪个循环里" → 安全投递
     ↓
电话线总管 manager：按 thread_id 找到对应的连接
     ↓
浏览器上的实时进度
```

（把文件里的两个类对照"**快递系统**"理解，分工更清晰）

| 类 | 角色 | 职责 |
|---|---|---|
| `ToolMonitor`（单例 `monitor`） | **快递员** | 任何代码想发消息，都找它：`monitor.report_xxx(...)` |
| `ConnectionManager`（单例 `manager`） | **快递站** | 管着 `{thread_id: WebSocket连接}` 这张"地址表"，负责真正派送 |

另外，本课要连破**三个悬案**：

1. 启动日志里"**两个一模一样的数字**"是什么？
2. 日志里那句 `对比是不是同一个event_loop:True` 是干嘛的？
3. 为什么需要 `run_coroutine_threadsafe` 这么拗口的东西？

## 上半场：ToolMonitor —— 埋点发射台

### 单例模式：全项目共用一个发射台

```python
class ToolMonitor:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(ToolMonitor, cls).__new__(cls)
            cls._instance.websocket_manager = None
        return cls._instance
...
monitor = ToolMonitor()   # 全局单例实例
```

- `__new__` 是"造对象"时最先被调用的钩子；这段逻辑的效果：**第一次创建时记在 `_instance` 里，之后每次都返回同一个对象**——这就叫"**单例模式**"
- 为什么必须单例？工具函数遍布全项目（到处 `from api.monitor import monitor`）——它们必须共享**同一个发射台**，否则发射台 A 不知道发射台 B 手里有哪些连接
- `websocket_manager = None`：预留位——发射台还不知道"往哪送"，等服务器启动时接线（下方揭晓）

### 接线：set_websocket_manager

```python
def set_websocket_manager(self, manager):
    self.websocket_manager = manager
```

把电话线总管挂到自己身上。**什么时候调用？**——还记得第 6 课 server.py 启动时的 `manager.set_loop(loop)` 吗？那个方法内部就会调这一行（下半场揭晓）。

### 核心方法 `_emit`：一条消息的"三层投递" ⭐

所有 `report_xxx` 最终都汇聚到这一个方法。它按"**逐级降级**"的哲学，把消息投递三次。

**第一层：组装消息 + WebSocket 定向推送（主通道）**

```python
payload = {
    "type": "monitor_event",
    "event": event_type,
    "message": message,
    "data": data or {},
    "timestamp": datetime.datetime.now().isoformat()
}
```

这个 `payload` **就是浏览器收到的 JSON 格式**——学习网站"实时演示台"里的 JS 解析的就是这套字段（`event` 决定图标，`message` 显示文字，`data` 是详情）。

```python
if self.websocket_manager:
    thread_id = get_thread_context()            # ← 从 ContextVar 拿"当前会话是谁"（第5课存进去的！）
    manager_loop = self.websocket_manager.loop  # ← 总调度中心（第6课启动时绑好的）
```

**两个"从哪里拿"都是前几课埋的伏笔**：会话编号从"随身口袋"（ContextVar）拿；目标循环从 manager 拿。

**然后是本课的灵魂——事件循环归属判断：**

```python
try:
    current_loop = asyncio.get_running_loop()      # 我现在在哪个循环里？
    print(f"对比是不是同一个event_loop:{manager_loop == current_loop}")
except RuntimeError:
    current_loop = None                            # 不在任何异步循环里

if current_loop and current_loop == manager_loop:
    # 情况 A：同一个循环 → 直接排队（最高效）
    current_loop.create_task(self.websocket_manager.send_to_thread(payload, thread_id))
else:
    # 情况 B：不同线程/循环 → 线程安全地跨循环投递
    asyncio.run_coroutine_threadsafe(
        self.websocket_manager.send_to_thread(payload, thread_id),
        manager_loop
    )
```

**先记一条铁律**：在 asyncio 世界里，**协程是"认主"的——属于哪个事件循环，就得在哪个循环里执行**。WebSocket 连接属于 FastAPI 的循环（`manager_loop`）——要往这根线上发消息，就必须"**回到那个循环里排队**"；从别的循环直接调用会报错：*"协程在错误的循环中运行"*。

于是分两种情况：

| 情况 | 场景 | 对策 |
|---|---|---|
| **A：同一循环** | 绝大多数情况——任务就是 FastAPI 循环里跑的协程 | `create_task` 把发送任务**直接排进当前队列** |
| **B：不同循环/线程** | 代码跑在**另一个线程**里——真实案例：LangChain 内部有时会把同步工具丢到**线程池**执行，那个线程有自己的世界、够不着主循环 | `run_coroutine_threadsafe`：**线程安全地**投递回那个循环 |

> 用快递比喻这段判断：先问自己"**我是不是就在快递站大楼里**？"——在楼里，直接把包裹放上传送带（`create_task`）；在楼外（别的线程），必须走官方"**跨楼安全通道**"（`run_coroutine_threadsafe`），并指定送到主循环接收。这是 asyncio 官方提供的**唯一**跨线程提交协程的安全方式——值得抄进你的笔记，以后写异步项目几乎必用。

（悬案 ② 提前揭晓：那行 `print` 就是为调试这个判断留的——`True` 表示"当前执行位置就在 FastAPI 的循环里"，走 A 快路径。）

**第二层：脚本模式兜底（兼容设计）**

```python
if builtins and hasattr(builtins, 'runtime') and hasattr(builtins.runtime, 'stream_writer'):
    builtins.runtime.stream_writer(payload)
```

给"不开服务器、纯脚本跑"的模式留的备用出口——有就用，没有就跳过。

**第三层：控制台保底输出**

```python
print(f"\n[Monitor:{event_type}] {message}")
```

**最终保底**——无论前两层成功失败，终端一定能看到。你在终端里看到的 `[Monitor:tool_start] 开始执行工具: 网络搜索工具` 就是这一行！

> 🧠 **三层投递的设计哲学**：主通道（WebSocket 推给浏览器）→ 兼容通道（脚本模式）→ 保底通道（本地日志）。**任何一层失败，信息都不丢**。换个角度说，这叫**优雅降级**——推送是增强体验、不是业务本身；推送挂了，任务照样跑。调试 Agent 时，终端永远是"最后的真相"。

### 四个"快捷按钮" report_xxx

```python
def report_tool(self, tool_name, args=None):        # → tool_start
def report_assistant(self, assistant_name, args):   # → assistant_call
def report_task_result(self, result):               # → task_result
def report_session_dir(self, path):                 # → session_created
```

就是四种事件的封装（拼好 message 和 data 再交给 `_emit`）。**和你见过的四种日志一一对应**：

| 方法 | 事件 | 谁调用它 |
|---|---|---|
| `report_tool` | `tool_start` | 工具函数内部（第 4 课埋点） |
| `report_assistant` | `assistant_call` | main_agent 拦截 task 调用时（第 5 课） |
| `report_task_result` | `task_result` | main_agent 收到最终答复时（第 5 课） |
| `report_session_dir` | `session_created` | run_deep_agent 建好办公室时（第 5 课） |

## 下半场：ConnectionManager —— 电话线总管

```python
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}    # 对号入座的总表
        self.loop = None                                      # 延迟绑定
```

### 延迟绑定：set_loop 与"两个相同数字"之谜

```python
def set_loop(self, loop):
    self.loop = loop
    monitor.set_websocket_manager(self)     # ← 顺手完成"发射台 ↔ 总管"的联姻
    print(f"[Monitor] ConnectionManager manually bound to loop: {id(self.loop)}")
```

- 为什么"延迟绑定"？——模块被 import 时（第 6 课文件头那一刻），**还没有运行中的事件循环**；只有服务器启动（`startup_event`）时才拿得到 loop。所以先留 `None`，启动时再填
- `monitor.set_websocket_manager(self)` 就是"接线"的那一手——总管把自己交给发射台；从这一刻起，所有 `_emit` 都能找到电话线了
- **悬案 ① 揭晓**：日志里"两个一模一样的数字"——

```
[Monitor] ConnectionManager manually bound to loop: 1572291443216   ← 本方法内部打的
[Server] WebSocket Manager bound to loop: 1572291443216             ← server.py 里打完收工后打的
```

它们是**同一次绑定事件的两条日志**！server.py 调用 `manager.set_loop(loop)` → set_loop 内部打印第一条 → 返回后 server.py 再打印第二条。`id(loop)` 是同一个对象，数字自然一模一样。当年我们对着这两行研究了半天的"谜案"，就此告破 😄

### 连接池三件套

```python
async def connect(self, websocket, thread_id):       # 接客：accept + 登记进表
def disconnect(self, websocket, thread_id):           # 送客：从表里除名
async def send_to_thread(self, message, thread_id):   # 送信：查表 + 发送
    if thread_id in self.active_connections:
        websocket = self.active_connections[thread_id]
        await websocket.send_json(message)
```

（第 6 课见过它们挂在 WebSocket 端点上；这里是内部实现。）

**注意 `send_to_thread` 的"沉默失败"**：如果 `thread_id` 不在表里（用户没连 / 已断开），**什么也不做、静默跳过**。这是有意的设计——任务不能因为"没人看直播"而崩溃；消息自动退守到第三层的终端日志。**这也解释了"没连 WS 就看不到直播、但任务照常跑完"的现象。**

## 三案全破 + 一图总览

| 悬案 | 答案 |
|---|---|
| 两个一模一样的数字？ | 同一次绑定的两条日志（set_loop 内部一条 + server.py 一条） |
| `对比是不是同一个event_loop:True`？ | `_emit` 里的调试打印：True = 当前就在 FastAPI 循环里，走 create_task 快路径 |
| `run_coroutine_threadsafe` 干嘛的？ | 跨循环投递的"铁律解法"——协程必须回到自己的循环里运行 |

```
工具/主智能体里的埋点
   monitor.report_xxx() → _emit()
        │  ① 组装 payload（前端 JSON 的标准格式）
        │  ② 事件循环归属判断
        │      ├─ 同循环 → create_task（直接排队）
        │      └─ 跨循环 → run_coroutine_threadsafe（安全投递）
        ▼
   manager.send_to_thread(payload, thread_id)   ← 查表"对号入座"
        ▼
   websocket.send_json(payload)                 ← 消息飞出服务器
        ▼
   浏览器 JS：按 event 渲染"正在调用助手…"（保底：终端 [Monitor:...] 日志）
```

## 📌 概念卡

| 概念 | 一句话 |
|------|--------|
| 单例模式 | `__new__` 里藏一个 `_instance`：全项目共用一个发射台/总管 |
| `_emit` 三层投递 | WebSocket 主通道 → 脚本兜底 → 控制台保底；信息不丢 |
| 事件循环归属判断 | 先问"我在哪个循环"——同循环直接排队，不同则安全跨投 |
| 协程铁律 | 协程必须在自己的事件循环里运行（否则报"错误的循环"） |
| run_coroutine_threadsafe | 跨循环/跨线程投递的标准工具 |
| send_to_thread 沉默失败 | 没人连 WS 也不崩：静默跳过，退守终端日志 |

## ✍️ 复述题（先自己想，再展开对照）

1. monitor 和 manager 为什么要做成"全项目唯一"（单例）？
2. `_emit` 的"三层投递"是哪三层？设计三层的好处是什么？
3. "事件循环归属判断"到底在判断什么？两种结果分别走哪条路？
4. `run_coroutine_threadsafe` 是为谁准备的？如果不做归属判断、一律用 `create_task`，在"工具跑在线程池"的场景会报什么错？
5. "两个一模一样的数字"到底是什么？为什么会一模一样？
6. 用户没连 WebSocket 就发了任务，消息去哪了？——反过来，如果 `send_to_thread` 不先检查连接表，用户关掉网页后 Agent 还在推消息会怎样？
7. 四个 `report_*` 方法为什么不直接写发送逻辑，而是统一收口到 `_emit`？

<details>
<summary>💡 参考答案（用自己的话答对意思即可）</summary>

1. 发射台和管理器都必须是"共享的公共设施"：工具函数遍布全项目，必须都向同一个 monitor 上报；连接池也必须是同一张表，否则发射台找不到任何连接。（`__new__` + `_instance` 保证无论 import 多少次都是同一个对象。）
2. 第一层 WebSocket（推给浏览器）；第二层脚本模式（`stream_writer`，兼容不跑服务器的场景）；第三层控制台 print（保底）。好处：任何一层失败信息都不丢（优雅降级，推送挂了任务照常跑）——调试时终端永远是最后真相。
3. 判断"执行 `_emit` 的代码现在身处哪个事件循环"。同一循环（常态）→ `create_task` 直接排队；不同循环/线程 → `run_coroutine_threadsafe` 跨循环安全投递。
4. 给"从别的线程调用"的场景——比如 LangChain 把同步工具丢进线程池执行时。协程"认主"、必须在自己的循环里运行；一律 `create_task` 会在跨线程时直接报"协程在错误的循环中运行"。
5. 它们是**同一次绑定事件的两条日志**：server.py 调 `manager.set_loop(loop)` 时，set_loop 内部打印一条；返回后 server.py 又打印一条。`id(loop)` 是同一个对象，数字自然相同。
6. 没连/已断开时，`send_to_thread` 查表找不到 → **静默跳过**（任务照常跑完，消息退守终端日志）。若不检查就 `self.active_connections[thread_id]` 直接取——会抛 `KeyError`，且它发生在异步投递里、轮到执行时才爆（日志出现"Task exception was never retrieved"之类的报错刷屏）。
7. 统一收口的好处：**单一职责 + 改一处全局生效**——四个按钮只负责"拼文案"；格式、三层投递、异常兜底全部逻辑只写在 `_emit` 一处；将来改推送策略（比如加字段）只动 `_emit`。

</details>

## 🎁 动手实验

1. 打开 `api/monitor.py`，把四个 `report_xxx` 方法与四种日志事件一一对上（`tool_start` / `assistant_call` / `task_result` / `session_created`）。
2. 下次跑任务时，在终端里找 `对比是不是同一个event_loop:` 这行——它出现了几次？（数一数它对应几次埋点上报）
3. 【验证】故意不打开演示台页面跑一次任务：浏览器没消息，但终端一定仍能刷出 `[Monitor:...]`——说出这是哪两层设计在起作用。

## ➡️ 下一课

**第 8 课：`api/context.py`** —— "随身口袋"的完整揭秘：ContextVar 为什么比全局变量好（每个会话怎么做到"绝不串台"的答案之书）。
