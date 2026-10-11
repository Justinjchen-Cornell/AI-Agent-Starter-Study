/* 课程元数据：新增课程时只需要改这里 */
const LESSONS = [
  { id:"01", file:"01-llm.md",        title:"llm.py：给项目装上大脑",   desc:"10 行代码如何接入大模型（DeepSeek 等）", ready:true },
  { id:"02", file:"02-prompts.md",    title:"prompts.yml：人设与家规",  desc:"系统提示词怎么写，如何约束 Agent 行为", ready:true },
  { id:"03", file:"03-subagent.md",   title:"子智能体 = 一个字典",      desc:"network_search_agent.py 的极简魔法", ready:true },
  { id:"04", file:"04-tavily-tool.md",title:"@tool：自定义工具",        desc:"一个完整的工具函数怎么写、埋点怎么做", ready:true },
  { id:"05", file:"05-main-agent.md", title:"总指挥：主智能体",         desc:"如何创建、编排、流式执行", ready:true },
  { id:"06", file:"06-server.md",     title:"FastAPI 服务器",           desc:"接口设计与异步任务触发", ready:true },
  { id:"07", file:"07-monitor.md",    title:"WebSocket 实时推送",       desc:"事件循环归属判断的奥妙", ready:true },
  { id:"08", file:"08-context.md",    title:"ContextVar 协程隔离",      desc:"为什么比全局变量更安全", ready:false },
  { id:"09", file:"09-path-utils.md", title:"文件安全边界",             desc:"path_utils.py 的 12 种场景", ready:false },
];

const PROGRESS_KEY = "AAS_PROGRESS";
function getProgress(){ try{ return JSON.parse(localStorage.getItem(PROGRESS_KEY) || "{}"); }catch(e){ return {}; } }
function setProgress(id, done){ const p = getProgress(); done ? (p[id] = true) : delete p[id]; localStorage.setItem(PROGRESS_KEY, JSON.stringify(p)); }
function isDone(id){ return !!getProgress()[id]; }
function countDone(){ return LESSONS.filter(function(l){ return isDone(l.id); }).length; }
