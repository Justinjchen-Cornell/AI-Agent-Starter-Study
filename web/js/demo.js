/* 实时演示台：连接本地 FastAPI 服务器，WebSocket 直播 Agent 干活 */
(function(){
  var $ = function(s){ return document.querySelector(s); };
  var serverInput = $("#serverInput");
  var statusDot = $("#statusDot"), statusText = $("#statusText");
  var logEl = $("#log"), tidBox = $("#tidBox"), timerBox = $("#timerBox");
  var sendBtn = $("#sendBtn"), stopBtn = $("#stopBtn"), clearBtn = $("#clearBtn"), pingBtn = $("#pingBtn");

  var ws = null, startTs = 0, timer = null, running = false;
  serverInput.value = localStorage.getItem("AAS_SERVER") || "http://localhost:8000";

  function serverUrl(){ return serverInput.value.trim().replace(/\/+$/, ""); }
  function newId(){
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "t-" + Date.now() + "-" + Math.random().toString(16).slice(2, 10);
  }
  function setStatus(state, text){
    statusDot.className = "status-dot" + (state ? " " + state : "");
    statusText.textContent = text;
  }
  function fmt(ms){ return Math.floor(ms / 1000) + "s"; }
  function setRunning(v){
    running = v;
    sendBtn.disabled = v;
    stopBtn.disabled = !v;
    if (v){
      startTs = Date.now();
      timer = setInterval(function(){ timerBox.textContent = fmt(Date.now() - startTs); }, 500);
    } else if (timer){ clearInterval(timer); timer = null; }
  }

  function checkServer(){
    setStatus("wait", "检测中…");
    fetch(serverUrl() + "/openapi.json").then(function(r){
      if (r.ok){ setStatus("on", "服务器在线 ✓"); }
      else { setStatus("off", "服务器响应异常（HTTP " + r.status + "）"); }
    }).catch(function(){
      setStatus("off", "无法连接 —— 请先在项目里运行 python api/server.py");
    });
  }
  pingBtn.onclick = checkServer;

  function el(tag, cls, text){
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function addEvent(m){
    var spec = {
      "session_created": ["📁", "工作目录已创建"],
      "assistant_call":  ["🤖", m.message || "调用子智能体"],
      "tool_start":      ["🔧", m.message || "执行工具"],
      "task_result":     ["✅", "任务完成"],
      "error":           ["❌", m.message || "发生错误"],
      "local":           ["🚀", m.message || ""],
      "closed":          ["🔌", m.message || "连接已断开"]
    }[m.event] || ["•", m.message || m.event || ""];

    var li = el("li");
    li.appendChild(el("span", "ico", spec[0]));
    var body = el("div", "body");
    var line = el("div", null, spec[1]);
    if (startTs) line.appendChild(el("span", "t", fmt(Date.now() - startTs)));
    body.appendChild(line);

    var d = m.data || {};
    if (m.event === "assistant_call" && d.args && d.args.description) body.appendChild(el("div", "detail", d.args.description));
    if (m.event === "tool_start" && d.args) body.appendChild(el("div", "detail", JSON.stringify(d.args)));
    if (m.event === "session_created" && d.path) body.appendChild(el("div", "detail", d.path));
    if (m.event === "task_result" && d.result){
      var box = el("div", "evt-result md");
      box.innerHTML = window.marked ? marked.parse(d.result) : "";
      body.appendChild(box);
      setRunning(false);
    }
    if (m.event === "error") li.classList.add("evt-error");
    li.appendChild(body);
    logEl.appendChild(li);
    li.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  sendBtn.onclick = function(){
    var q = $("#queryInput").value.trim();
    if (!q){ $("#queryInput").focus(); return; }
    var s = serverUrl();
    localStorage.setItem("AAS_SERVER", s);
    logEl.innerHTML = "";
    setRunning(true);

    var tid = newId();
    tidBox.textContent = tid;

    try{ ws && ws.close(); }catch(e){}
    try{ ws = new WebSocket(s.replace(/^http/, "ws") + "/ws/" + tid); }
    catch(e){ addEvent({ event:"error", message:"WebSocket 地址无效：" + e.message }); setRunning(false); return; }

    ws.onopen = function(){
      fetch(s + "/api/task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, thread_id: tid })
      }).then(function(r){ return r.json(); }).then(function(data){
        addEvent({ event:"local", message:"任务已派出：" + JSON.stringify(data) });
      }).catch(function(e){
        addEvent({ event:"error", message:"派发失败：" + e.message });
        setRunning(false);
      });
    };
    ws.onmessage = function(ev){
      var m; try{ m = JSON.parse(ev.data); }catch(e){ return; }
      if (m.type === "pong") return;
      addEvent(m);
    };
    ws.onerror = function(){
      addEvent({ event:"error", message:"无法连接 WebSocket —— 请确认服务器已启动（python api/server.py）" });
      setRunning(false);
    };
    ws.onclose = function(){
      if (running) addEvent({ event:"closed", message:"连接已关闭" });
    };
  };

  stopBtn.onclick = function(){
    try{ ws && ws.close(); }catch(e){}
    addEvent({ event:"closed", message:"已手动停止监听（后台任务可能仍在执行）" });
    setRunning(false);
  };
  clearBtn.onclick = function(){ logEl.innerHTML = ""; timerBox.textContent = "-"; };

  checkServer();
})();
