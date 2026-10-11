# 第 9 课：utils/path_utils.py —— Agent 文件安全与"路径翻译官"

> **本节目标**：看懂 Agent 的文件路径是怎么被"翻译"和保护的（12 种边界场景）
> **预计时长**：35 分钟 ｜ **前置**：完成第 1~8 课（**这是全课程最后一课**）

## 先建立直觉：大模型的"路径乡愁"

回顾链条：第 2 课提示词立规矩"文件必须存在工作目录"；第 5 课把"相对路径给大模型、绝对路径给系统"分好工；第 6 课给下载接口装了门禁。现在到了最后一环——**工具真正要打开/写入文件时**，拿到的那串路径，是谁给的？

答案是：**大模型**——而大模型给出的路径，会出乎你的意料：

- 它可能写 `/workspace/report.md`——它"以为"自己在某个云端沙箱里（训练数据里全是这些路径）
- 它可能写 `session_123/session_123/report.md`——目录**套娃**
- 它可能写 `abc/updated/upload/file.pdf`——把上传文件的路径记得乱七八糟
- 它可能写 `/sub/test.md`——Windows 上也照样给你 Unix 风格的路径

把这些"方言"直接拿去开文件，结果就是**到处乱存、找不到文件**。`resolve_path` 就是那位"**路径翻译官**"（也可以叫他"**守门员**"——所有碰文件的工具，写文件前都要先把路径交给他安检）：把 LLM 千奇百怪的路径输入，翻译成**正确位置的绝对路径**。

### 三层防线，各司其职（一次说清）

| 层 | 位置 | 时机 | 管什么 |
|---|---|---|---|
| 第一道：提示词约束 | `prompts.yml` | **事前预防** | "必须且只能在**该工作目录**下操作文件"——**软约束**，靠模型自觉 |
| 第二道：路径翻译官 | **本文件** | **事中纠偏** | 把五花八门的输入**归位**到正确位置（以防呆为主） |
| 第三道：接口门禁 | `server.py` 的 `/api/download`、`/api/files` | **事后兜底** | 只允许访问 `output/` 内——**硬门禁**，对"外人"（HTTP 请求）把关 |

注意第二道的定位很妙：它主要防的不是黑客，而是**"模型自己犯迷糊"**；真正的对外硬门禁在第三道。各司其职、层层设防——这就是第 2 课说的"双保险"的完整版（实际是三层）。

> ⚠️ **永远不要只靠第 1 层**——提示词是"劝说"，LLM 可能不听；代码检查才是"门禁"。

## 全景：一个函数 + 一张"官方规格表"

整个文件只有一个函数 `resolve_path(filename, session_dir)`。但它开头的 docstring——**是一张 12 个场景的规格表**。摘几行感受一下（完整表在文件里）：

| 输入场景 | filename | 最终结果（session_dir = D:/P/output/session_123） |
|---|---|---|
| 虚拟路径清洗 | `/workspace/report.md` | `D:/P/output/session_123/report.md` |
| updated 特殊处理 | `abc/updated/upload/file.pdf` | `D:/P/updated/upload/file.pdf` |
| Windows 伪绝对路径 | `/sub/test.md` | `D:/P/output/session_123/sub/test.md` |
| 路径嵌套防护 | `…/session_123/session_123/report.md` | 修正为 `…/session_123/report.md` |
| 相对路径（含 session 名） | `session_123/report.md` | `D:/P/output/session_123/report.md` |
| 普通相对路径 | `sub1/sub2/test.md` | `D:/P/output/session_123/sub1/sub2/test.md` |

> 💡 **"文档即规格"**：作者先把"这个函数要处理的全部情况"列成表，再写实现——**这张表同时还是现成的测试用例清单**（想验证函数对不对？12 个场景各跑一遍即可）。你以后写处理"不可预测输入"的核心函数，也可以先列这样一张表。

## 逐段解读

### 彩蛋：开头的"考古地层"（第 6~11 行）

打开文件，你会先看到一段奇怪的东西：

```python
def resolve_path(filename: str, session_dir: Optional[str] = None) -> str:
    import os
from pathlib import Path
from typing import Optional

def resolve_path(filename: str, session_dir: Optional[str] = None) -> str:
    """……（真正的完整实现从这里开始）"""
```

真实世界的代码也有"**考古地层**"：这里明显是一次复制粘贴事故留下的残迹——一个只含 `import os` 的"废弃桩函数"，紧接着真正的定义又写了一遍。**读开源项目遇到这种，别怀疑自己看错了**——好代码和"事故地层"经常共存。

**为什么它不影响运行？** 因为 Python 模块从上往下执行：第二次 `def resolve_path` 把第一次的定义**覆盖**了——你 import 到手的始终是第二版。（文末的"毕业作业"就是清理它 😄）

### 步骤 0：统一"书写方式"

```python
path = Path(filename)
path_str = filename.replace("\\", "/")   # 统一正斜杠，方便字符串匹配
```

- 内部保留两个"表示"：`path`（Path 对象，做路径运算和判断）、`path_str`（字符串，做前缀/包含检测）
- `\ → /`：Windows 反斜杠统一成正斜杠，避免字符串匹配踩坑（第 5 课同款操作）

### 步骤 1：虚拟路径清洗 —— 防"模型乡愁"

```python
virtual_prefixes = ["/workspace", "/mnt/data", "/home/user"]
for prefix in virtual_prefixes:
    if path_str.startswith(prefix):
        cleaned = path_str[len(prefix):].lstrip("/")   # 剥掉前缀
        path = Path(cleaned)
        break
```

- LLM 的训练数据里有大量 `/workspace`、`/mnt/data`（在线沙箱）、`/home/user`（Linux 家目录）——它经常"顺手"把这些写进路径
- 这一步就是把**幻觉前缀剥掉**，剩下的部分继续走流程
- 💡 记住这个思路：**给 LLM 擦屁股要把已知的"毛病"列成清单逐个修**——而不是期望它犯错为零

### 步骤 2：`updated/` 特殊处理 —— 上传文件归位

```python
if "updated/" in path_str:
    idx = path_str.find("updated/")
    relative_part = path_str[idx:]                 # 从 updated/ 开始截取
    return str(Path(relative_part).resolve())      # 相对 CWD 解析
```

- 用户上传的文件住在项目的 `updated/session_xxx/` 里（第 6 课 upload 接口写的那个目录）
- LLM 引用上传文件时，路径常带着各种前缀（如 `abc/updated/upload/file.pdf`）——**只要包含 `updated/`，就从它开始截取**，相对当前工作目录解析 → 精准落回真实的 `updated/` 目录
- 注意这是个"**读文件**"场景（和"写文件进会话目录"的安全要求不同），所以走单独通道
- 前提：程序是**从项目根目录**运行的（这就是为什么第 1 课的 `find_dotenv`、第 5 课的相对路径设计，都在反复强调这件事）

### 兜底：没有会话目录时

```python
if not session_dir:
    return str(path.resolve())
```

没有会话上下文（比如单独测试工具时）——就直接解析，不做会话归位。

### 步骤 3：绝对路径分支

```python
is_unix_abs = path_str.startswith("/")
if path.is_absolute() or (os.name == 'nt' and is_unix_abs):
    if os.name == 'nt' and is_unix_abs and not path.drive:
        # Windows 上以 / 开头但没盘符 → 视为"相对"，拼到会话目录
        full_path = session_path / path_str.lstrip("/")
    else:
        full_path = path.resolve()
```

- `os.name == 'nt'`：判断是否 Windows 系统
- **Windows 的特殊照顾**：`/sub/test.md` 这种"Unix 式假绝对路径"（没有盘符）→ 当成相对路径，拼到会话目录——继续给"模型乡愁"擦屁股

随后两个检查：

```python
    if session_path in full_path.parents or full_path == session_path:
        parts = full_path.parts
        for i in range(len(parts) - 1):
            if parts[i] == session_name and parts[i + 1] == session_name:
                return str(session_path / full_path.name)   # 修正"套娃"
        return str(full_path)
    return str(full_path)   # 绝对路径但不在会话内 → 保留原样
```

- **套娃检测**：`…/session_123/session_123/report.md`（LLM 把会话目录名重复拼了）→ 检出**连续两个相同的 session_name** → 修正为 `session_path / 文件名`
- **值得注意的取舍**：绝对路径不在会话目录时，函数**保留原样**而不是拦截——再次印证它的定位是"翻译官+防呆"（让正常输入归位），不是"牢门"；硬门禁在第 6 课的对外接口层

### 步骤 4：相对路径分支 —— 防套娃三连

```python
else:
    parts = path.parts
    if session_name in parts:            # 形如 session_123/report.md
        return str(session_path / path.name)      # 只取文件名，防套娃
    if parts and parts[0] == "output":   # 形如 output/report.md
        return str(session_path / path.name)      # 只取文件名，防套娃
    return str(session_path / path)      # 普通相对路径 → 正常拼接
```

- 绝大多数场景落在这里：普通相对路径（`sub1/sub2/test.md`）→ 直接拼到会话目录 ✓
- 但如果 LLM 的路径里**已经带了会话名**（`session_123/report.md`）或 **output 前缀**（`output/report.md`），直接拼接会变成 `session_123/session_123/report.md`——所以**只取文件名**再重新接
- 一句话总结：**"多出来的前缀都是幻觉，文件名才是真的"** 😄

## 谁在用这位"翻译官"

| 工具 | 调用场景 |
|---|---|
| `markdown_tools.py` | 生成 Markdown 前：把 LLM 给的路径翻译成真实落盘位置 |
| `pdf_tools.py` | 转换 PDF：两处调用——既要找到刚写的 MD，又要决定 PDF 存哪 |
| `upload_file_read_tool.py` | 读上传文件：把 LLM 说的"文件名"翻译成真实路径 |

三个"碰文件"的工具**全部**经过它——任何文件操作都先过翻译官，这就是"统一入口"的含义。

## 📌 概念卡

| 概念 | 一句话 |
|------|--------|
| 路径乡愁 | LLM 爱写 /workspace、/home/user——训练数据残留，要剥掉 |
| 路径翻译官 | resolve_path：把 LLM 的方言路径归位到正确位置（兼"守门员"） |
| 四道安检门 | 洗前缀 → updated 通道 → 绝对校验+套娃修正 → 相对落位 |
| 套娃防护 | session_123/session_123/… → 只取文件名重接 |
| updated/ 归位 | 路径含 updated/ → 从该处截取、相对 CWD 解析 |
| 伪绝对路径 | Windows 上 / 开头无盘符 → 当相对路径处理 |
| 三层防线 | 提示词（软）→ 翻译官（防呆）→ 接口门禁（硬） |

## ✍️ 复述题（先自己想，再展开对照）

1. LLM 为什么会给出 `/workspace/report.md` 这类路径？步骤 1 在防什么？
2. `updated/` 路径为什么要特殊处理？（串联第 6 课的 upload 接口想）
3. 什么是"路径套娃"？怎么防？——为什么只查"**连续两个**相同"的 session 名，而不是"出现两次"？
4. Windows 上 `/sub/test.md` 这种"伪绝对路径"，函数怎么处理？
5. 【综合推演】LLM 传入 `/mnt/data/updated/数据.xlsx`，走完四道门最终落在哪？经过了哪几道门？
6. "绝对路径不在会话目录时保留原样"——这说明它的定位更像"什么"而不是"什么"？
7. 哪三个工具在调用 `resolve_path`？如果给这个函数写单元测试，你会拿什么现成材料当用例？

<details>
<summary>💡 参考答案（用自己的话答对意思即可）</summary>

1. 因为 LLM 的训练数据里满是 `/workspace`、`/mnt/data` 这类沙箱路径，它"顺手"就写出来了（模型乡愁）。步骤 1 把这些已知的幻觉前缀从路径头部剥掉，让后续流程能正常处理。
2. 因为用户上传的文件真实住在项目根的 `updated/session_xxx/` 下（第 6 课 upload 接口写入）。LLM 引用时路径里常夹带各种前缀，所以只要包含 `updated/` 就从该处截取，相对 CWD 解析，精准归位到真实上传目录。
3. 套娃 = 会话目录名被重复拼接（`session_123/session_123/report.md`）。防法有二：绝对路径分支里检测"连续两个相同 session_name"并修正；相对路径分支里如果发现路径已含 session 名或 output 前缀，就**只取文件名**重新拼接。只查"连续两个"是因为：合法路径里会话名本就出现**一次**（在会话目录那一段），"紧接着又来一个"才是"LLM 又拼了一遍"的错误特征——判得准又不误伤。
4. 判断系统是 Windows（`os.name == 'nt'`）且该路径以 `/` 开头、没有盘符 → 视为相对路径，拼到会话目录下。
5. 第 1 道门剥掉 `/mnt/data` 前缀 → 剩下 `updated/数据.xlsx`；第 2 道门检测到 `updated/` → 从该处截取、相对 CWD 解析 → 最终落在**项目根目录下的** `updated/数据.xlsx`（真实的上传目录）。经过第 1、2 道门就返回了，不再走 3、4 道。
6. 更像"**翻译官 + 防呆层**"，而不是"牢门"。它负责让正常输入归位；真正的对外硬门禁在 `server.py` 的下载/文件列表接口（只允许 output/ 内）。
7. 三个工具：`markdown_tools.py`（生成 MD 落盘）、`pdf_tools.py`（找 MD + 定 PDF 路径，两处）、`upload_file_read_tool.py`（读上传文件）。测试材料：**docstring 里那张 12 场景表就是现成的用例清单**——逐行跑一遍即可。

</details>

## 🎁 动手实验（最后一组，含毕业作业）

1. 数一数 docstring 里的规格表有多少行场景（**12 行**——"文档即规格"的典范）。
2. 【毕业作业】找到开头的"考古地层"（第 6~11 行的重复 def 残迹）——先说出它为什么无害，然后**把它清理掉并提交一次 commit**（命令照旧三连：`git add` → `git commit` → `git push`。这是你的第一次"真实代码清理"！）
3. 【推演】`session_dir = D:/P/output/session_123` 时，`resolve_path("session_123/report.md")` 返回什么？为什么？

<details>
<summary>💡 实验 2/3 参考答案</summary>

2. 无害原因：Python 模块从上往下执行，第二个 `def resolve_path` 覆盖了第一个（桩函数）；import 到手的始终是完整版。清理方法：删掉第 6~11 行的残迹（保留顶部 imports 和真正的函数定义）即可，删完运行一次项目确认一切正常。

3. 返回 `D:/P/output/session_123/report.md`。因为路径里已含 session 名，直接拼接会套娃（session_123/session_123/…），所以函数**只取文件名**再接到会话目录后面。

</details>

## 🎓 毕业致辞：9 节课，你读懂了什么

| 课 | 文件 | 一句话 |
|---|---|---|
| 1 | `agent/llm.py` | 造"大脑"：配置与代码分离 |
| 2 | `prompt/prompts.yml` | 写"岗位说明书"：用文字指挥 AI |
| 3 | `subagents/*.py` | 员工 = 一个字典：声明式配置 |
| 4 | `tools/tavily_tool.py` | 工具 = 点化 + 埋点：让模型"有手" |
| 5 | `agent/main_agent.py` | 装配 + 指挥 + 直播：整机的心脏 |
| 6 | `api/server.py` | 前台接活：异步任务 + WebSocket |
| 7 | `api/monitor.py` | 导播室：事件循环归属判断 |
| 8 | `api/context.py` | 随身口袋：并发世界不串台 |
| 9 | `utils/path_utils.py` | 路径翻译官：文件安全边界 |

从"这什么鬼"到"每一行都能讲出为什么"——**你已经不是那个打开项目就发慌的人了**。

**从这里出发（选一个开始）**：

- 📺 把项目本地跑起来发一个任务，对照第 5 课的 chunk 解析逻辑看控制台输出——**理论和亲眼所见完全是两回事**
- 🔧 按第 2 课练习，真正把"天气查询助手"加进项目（完整走一遍：YAML → 工具 → 字典 → 注册）
- 💾 按第 5 课插曲，把 `InMemorySaver` 换成 `SqliteSaver`（让记忆跨重启）
- 🌐 给学习网站加一个"文件面板"（调用第 6 课的 `/api/files` 和 `/api/download`）
- 🐛 上游贡献：把发现的几处小瑕疵（"信息收"、"简历连接"、prompt 里的"文件生成助手"矛盾）整理成 PR，提给原作者 [waseens/deep-search-pro](https://github.com/waseens/deep-search-pro)
- 📢 最大的挑战：**自己从零写一个小 Agent**——你手里已经有全部图纸了

课程结束了，但你的 Agent 之路刚开始。🚀
