# 第 6 课：api/server.py —— 任务的"前台"：FastAPI 接活与 WebSocket 播报

> **本节目标**：看懂 FastAPI 怎么和 Agent 结合、异步任务怎么触发
> **预计时长**：35 分钟 ｜ **前置**：完成第 5 课

## 先建立直觉：上一课的谜底揭晓

第 5 课最后留了一个问题：`run_deep_agent(query, session_id)` 到底是谁调用的？答案就是这个文件——**它是整个系统的"前台"**：

- **接活**：用户从网页发来任务 → 前台登记（HTTP 接口）
- **派活**：把任务丢给后厨（调 `run_deep_agent`，后台跑)
- **播报**：把后厨进度实时喊给等候区（WebSocket 直播）

这个文件约 250 行，按功能区看只有 5 块：

| 区块 | 内容 | 作用 |
|---|---|---|
| ① 启动准备 | imports / 路径修复 / app / 目录 / CORS | 开门前的准备 |
| ② 任务接口 | `POST /api/task` | 接活 |
| ③ 直播通道 | `WebSocket /ws/{thread_id}` | 播报 |
| ④ 文件三接口 | upload / download / files | 上传下载与文件管理 |
| ⑤ 收尾 | `uvicorn.run(...)` | 开门营业 |

## ① 启动准备区：开门前的准备

### 文件头：又见老朋友 + 我们的修复现场

```python
import uuid
import asyncio
import sys          # ← 我们的修复用它
import uvicorn
from pathlib import Path
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, Form
...
# Add project root to sys.path
current_dir = Path(__file__).resolve().parent
project_root = current_dir.parent

# 【重要修复】……（把项目根目录插到搜索路径第一位）
sys.path.insert(0, str(project_root))

# 注意：agent.main_agent 导入时会初始化 main_agent，这可能需要几秒钟
from agent.main_agent import run_deep_agent
from api.monitor import manager
```

这一段你全都见过：

- `Path(__file__).resolve().parent` —— 第 1 课、第 5 课的同款"从文件自身算路径"
- `sys.path.insert(...)` —— **你亲手撞出来的那个 `ModuleNotFoundError` 的修复现场**，当时写的注释还在这里
- `from agent.main_agent import run_deep_agent` —— "import 即执行"（第 1 课）：这一行会当场构建整个主智能体，所以启动要花几秒
- `from api.monitor import manager` —— 连接池总管（第 7 课主角，先打个照面）

### 建目录 + 创建应用 + CORS

```python
app = FastAPI(title="DeepAgents API")

output_dir = project_root / "output"
output_dir.mkdir(exist_ok=True)
updated_dir = project_root / "updated"
updated_dir.mkdir(exist_ok=True)

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])
```

- `app = FastAPI(...)` —— 创建"应用对象"（前台的营业执照，后面所有接口都挂在它身上）
- 两个目录：`output/`（会话产物）、`updated/`（用户上传）——第 5 课已经在用它们了，这里是"开门前先建好"
- **CORS 中间件**：浏览器的安全规则规定"网页不能随便调用别家地址的接口"（跨域限制）。咱们的学习网站跑在别的地址，要调用 `localhost:8000` 的接口，就必须由服务器声明"允许谁来调"——`allow_origins=["*"]` = 都允许（学习项目图方便；生产环境要收紧成白名单）

## ② 任务接口：整个系统的心脏起搏器

### 先定义"请求长什么样"——TaskRequest

```python
class TaskRequest(BaseModel):
    query: str
    thread_id: str = None
```

这是 Pydantic 数据模型：告诉 FastAPI "请求体必须是这个形状"——`query` 必填（字符串），`thread_id` 可选（不填就是 None）。FastAPI 自动完成**校验**（缺 `query` 会返回 422 错误）并生成**文档**（/docs 里那个漂亮的输入表单就是它渲染的）。

### 接口本体

```python
@app.post("/api/task")
async def run_task(request: TaskRequest):
    # 1. [ID 初始化]
    thread_id = request.thread_id or str(uuid.uuid4())

    # 2. [后台执行] 异步运行 Agent，不阻塞主线程
    # 注意：这里简单的使用 asyncio.create_task 触发，由 main_agent 内部负责实时推送
    asyncio.create_task(run_deep_agent(request.query, thread_id))

    # 3. [立即响应]
    return {"status": "started", "thread_id": thread_id}
```

逐行看：

- `@app.post("/api/task")` —— 注册路由："凡是 POST /api/task 的请求，交给下面这个函数处理"（`@tool` 是给工具"点化"，`@app.post` 是给接口"挂牌"）
- **第 1 步**：`request.thread_id or ...` —— 用户带了编号就用；没带就 `uuid.uuid4()` 生成一个。**这就是第 5 课 `session_id` 的来源**（一个编号，从进门贯穿到房间命名）
- **第 2 步（本课核心）**：`asyncio.create_task(...)` —— "**发射后不管**"：把 `run_deep_agent` 交给事件循环**后台执行**，代码立刻继续往下走
- **第 3 步**：立即返回 `{"status": "started", ...}`

**这一刻解答了两个"为什么"：**

1. 为什么在 /docs 点 Execute 后**马上**收到 `started`、而任务要跑 1~3 分钟？——因为接口只负责"登记 + 发射"，不等结果
2. 如果写成 `await run_deep_agent(...)` 会怎样？——接口会**卡住 1~3 分钟**等任务跑完才响应；多来几个用户，服务器直接堵死

> 比喻：`create_task` = 服务员把订单交给后厨、给你一张**取餐号小票**（thread_id）就让你坐下等；`await` = 服务员站在厨房门口等菜做完。

> 🧠 **记住这个模式的名字：异步任务 + 立即响应**——先给号、后台做、做完通知。几乎所有"AI 长任务"的后端都长这样。

那"做完通知"和"查产出"怎么办？这个项目给了两条路：

- **WebSocket**：后厨进度实时播报（下一个区块）
- **`thread_id`**：凭小票随时查产出文件（④ 区的 `/api/files`）

## ③ 直播通道：WebSocket

HTTP 是"**一问一答**"：客户端不开口，服务器不能主动说话。但进度直播要求"服务器随时喊一声"——所以需要 **WebSocket**：

> 比喻：HTTP = 寄信（你来我往）；WebSocket = 打电话（接通后双方随时说话）。

```python
@app.websocket("/ws/{thread_id}")
async def websocket_endpoint(websocket: WebSocket, thread_id: str):
    # 1. [注册] 建立连接并绑定到管理器
    await manager.connect(websocket, thread_id)

    try:
        # 2. [循环] 保持连接活跃
        while True:
            # 3. [监听] 接收前端消息 (通常是 ping 心跳)
            data = await websocket.receive_text()
            # 4. [响应] 回复 pong 消息
            await websocket.send_json({"type": "pong", "message": f"服务端已收到: {data}"})
    except WebSocketDisconnect:
        # 5. [清理] 客户端主动断开
        manager.disconnect(websocket, thread_id)
```

- URL 里的 `{thread_id}` = **对号入座**：每根"电话线"绑定一个会话；`manager` 内部维护一张 `{thread_id: websocket 连接}` 的表，Agent 推消息时报编号，manager 就知道该往哪条线发（第 7 课细讲）
- `manager.connect(...)`：把连接登记进这张表
- `while True` 循环：挂着这根线，干两件事——**收消息**（前端心跳 ping）和**回 pong**（"我还在"），防止连接被判定超时
- 前端断开时必须捕获 `WebSocketDisconnect` 并从连接池**注销**——不清理的话，一是断开事件会报错刷屏，二是那张表越积越多（**内存泄漏**）

⚠️ 注意一个"最熟悉的陌生人"：你看到的 `[Monitor:assistant_call] 正在调用助手` 等**直播消息并不从这个循环里发出**——是 monitor 从"另一头"通过 `manager` 直接推送的（第 7 课讲）。这个端点主要负责"接线 + 保活 + 清理"。

（😄 彩蛋：这个函数第一行的 print 里把"要求**建立**连接"打成了"要求**简历**连接"——又一个真实世界的指纹。）

## ④ 文件三接口：上传、下载、浏览

### POST /api/upload —— 收上传文件

```python
@app.post("/api/upload")
async def upload_files(files: List[UploadFile] = File(...), thread_id: str = Form(...)):
    target_dir = updated_dir / f"session_{thread_id}"
    target_dir.mkdir(parents=True, exist_ok=True)
    for file in files:
        file_path = target_dir / file.filename
        with file_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    return {"status": "uploaded", "files": saved_files}
```

- 接收文件 + 会话编号，存进 `updated/session_{thread_id}/`
- **闭环时刻**：第 5 课 `run_deep_agent` 里"检查 updated/ → 复制到办公室"的那段代码，接手的就是这里存下的文件！
- `shutil.copyfileobj`：**流式**复制（一块一块搬运），大文件不会一次性塞爆内存

### GET /api/download —— 下载（带安全门禁）

```python
abs_path = Path(path).resolve()
output_abs = output_dir.resolve()
if not abs_path.is_relative_to(output_abs):
    return {"error": "拒绝访问: 只能下载输出目录下的文件"}
```

- 用户要下载文件，报上完整路径
- **安全检查**：`resolve()` 解析成真实路径后，判断"**是不是在 output/ 目录里面**"——不在就打回！
- 这是在防**路径穿越攻击**：有人可能传 `../../etc/passwd` 之类的路径，试图读取服务器上的任意文件。`resolve()` 把路径解析成绝对路径后，`is_relative_to()` 确认它确实在 `output/` 里
- **凡是接受用户传入路径的接口，这是必做检查**——否则等于把整个文件系统暴露出去。这就是第 2 课说的"第二道代码防线"——第 9 课 `path_utils.py` 的主角，先记住这个写法

### GET /api/files —— 浏览会话文件

- 同样的门禁（必须 output/ 内）+ `rglob` 递归列出所有文件
- 每个文件附元数据：名字、路径、**大小**、**修改时间**
- 最后按修改时间**倒序**排列（最新的在最前）——供前端展示

（文件三接口是给"学习网站的演示台/文件面板"准备数据支撑的——将来接上它们，网站就能展示"这次生成了哪些文件"。）

## ⑤ 收尾：启动开关

```python
@app.on_event("startup")
async def startup_event():
    loop = asyncio.get_running_loop()
    manager.set_loop(loop)
    print(f"[Server] WebSocket Manager bound to loop: {id(loop)}")
```

- 服务器启动时做的事：**把"事件循环"记下来，绑定给连接池管家**
- **什么是事件循环？** 可以理解为 asyncio 的"**总调度中心**"——所有异步任务（协程）都排在这个中心的队列里轮流执行。绑定它 = 记下"总调度中心的联系方式"：将来 Agent 在后台跑任务、要推消息给前端时，**推消息这个动作必须回到这个调度中心里排队执行**（第 7 课看具体用途）
- 日志里的 `[Server] WebSocket Manager bound to loop: 1572291443216` 就是它打的（还记得当初分析过的"两个一模一样的数字"吗？）
- 为什么需要这次绑定？——第 7 课的重头戏（"事件循环归属判断"），先埋个种子

```python
if __name__ == "__main__":
    uvicorn.run("api.server:app", host="0.0.0.0", port=8000, reload=True)
```

- `"api.server:app"` = "模块路径:应用对象"字符串——uvicorn 凭这个找到 `app`
- `host="0.0.0.0"`、`port=8000` —— 开门地址（0.0.0.0 = 监听本机所有网卡——就是聊 "Uvicorn running" 那行时的老朋友）
- `reload=True` —— 改代码自动重启（开发利器）；**还记得它导致"字典打印两遍"吗？**——现在你能完全解释了：reload 模式有"监工进程 + 干活进程"，两个进程各自 import 一遍 server.py（连带 prompts.py），各打印一遍
- `if __name__ == "__main__"` —— "直接运行这个文件时才启动"；被 import 时不启动（很重要——否则别人 import 一下就把服务器开起来了）

## 一图总览：一个任务的"前台之旅"

```
用户（学习网站 / /docs）
   │  POST /api/task {"query": "..."}
   ▼
② run_task：登记 thread_id → asyncio.create_task(后台派活) → 立刻返回 started
   │                                          ↓ 后台：run_deep_agent（第5课）
   │  WebSocket /ws/{thread_id} 接通           │
   ▼                                          ▼
③ manager 连接池 ←──────── monitor 推送 ──── 各种直播事件（第7课）
（浏览器实时收到：正在调用助手 / 正在搜索 / 任务完成）
   │
   └─ ④ 凭号取餐：GET /api/files 查产出 → GET /api/download 下载文件
```

## 📌 概念卡

| 概念 | 一句话 |
|------|--------|
| FastAPI 路由 | `@app.post/get/websocket` = 给接口"挂牌"，URL 与方法配对 |
| Pydantic 模型 | `TaskRequest` 定义+校验请求体；/docs 的表单由它生成 |
| asyncio.create_task | "发射后不管"：任务丢后台跑，接口立刻返回 |
| WebSocket | 长连接双向通道——服务器可主动推（HTTP 只能一问一答） |
| manager 连接池 | 记着"哪个 thread_id 对应哪根连接线" |
| 路径门禁 | resolve + is_relative_to：只允许访问 output/ 内（防路径穿越） |
| uvicorn.run | 启动开关；reload=True = 监工+干活双进程 |
| 异步任务 + 立即响应 | AI 长任务后端标准模式：先给号、后台做、做完通知 |

## ✍️ 复述题（先自己想，再展开对照）

1. "立刻收到 started、任务却在后台跑"——靠哪一行实现？改成 `await run_deep_agent(...)` 会导致什么连锁反应？
2. 进度直播为什么必须用 WebSocket，而不是普通 HTTP 接口？
3. `TaskRequest` 这个类有什么用？（提示：校验 + 文档）
4. WebSocket 的 URL 为什么设计成 `/ws/{thread_id}`，而不是所有客户端共用一条 `/ws`？
5. `/api/upload` 把文件存到哪？随后是谁、在第 5 课的哪一步接手它们？
6. `/api/download` 里的 `is_relative_to` 检查在防什么？（举个攻击例子）为什么说"接收路径参数的接口必做"？
7. 一个任务跑完、用户关掉网页后，服务端有哪**两处**资源需要清理？

<details>
<summary>💡 参考答案（用自己的话答对意思即可）</summary>

1. `asyncio.create_task(run_deep_agent(...))`——任务交给事件循环后台执行，接口立刻返回 `started`。改成 `await` 会导致连锁反应：HTTP 请求要挂 1~3 分钟 → 前端超时 → 服务器并发能力骤降。
2. HTTP 是"一问一答"——客户端不请求，服务器不能主动推送；直播要求服务器随时把进度说出来，需要长连接双向通道，即 WebSocket。
3. 定义并校验请求体的形状：`query` 必填、`thread_id` 可选；FastAPI 还据此自动生成 /docs 的输入表单（校验失败自动 422）。
4. 为了"**对号入座**"：每条连接绑定一个会话，`manager` 才能把某个会话的进度精准推给对应的人。如果共用一条 `/ws`，多用户的消息会互相串线，也无法定向推送。
5. 存到 `updated/session_{thread_id}/`；随后第 5 课 `run_deep_agent` 的"准备阶段"检查该目录，把文件 `copy2` 到会话办公室，并拼提示词让大模型先读取。
6. 防**路径穿越攻击**：比如传 `../../etc/passwd` 想读服务器上的敏感文件。`resolve()` 解析真实路径 + `is_relative_to()` 限定在 output/ 内。凡接收路径参数的接口都必须做——否则等于把整个文件系统暴露出去。
7. 两处：① **WebSocket 连接**——用户断线要在 `manager` 里注销（本课）；② **ContextVar**——第 5 课 `run_deep_agent` 的 `finally` 里 `reset_session_context` 清理"会话身份"，防串台。

</details>

## 🎁 动手实验

1. 把任务发出去（/docs 或网站的演示台），对比返回的 `thread_id` 与 `output/` 里新出现的 `session_xxx` 文件夹名字——验证同一个编号如何"从头贯穿到尾"。
2. 打开 `api/server.py`，找到 `asyncio.create_task` 那一行——给第 5 课"接口立刻返回"的谜底画个记号。
3. 数一数这个文件一共"挂了几块牌"：搜索 `@app.` 出现了几次？（答案：post×2 + get×2 + websocket×1 + on_event×1 = 6 处）

## ➡️ 下一课

**第 7 课：`api/monitor.py`** —— 直播背后的"导播室"：WebSocket 实时推送、事件循环归属判断（`manager.set_loop` 到底为什么存在？）+ 那对"一模一样的数字"之谜，终于解开。
