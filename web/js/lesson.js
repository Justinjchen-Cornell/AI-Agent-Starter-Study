/* 课程阅读页：侧边栏、加载 Markdown、完成打卡 */
(function(){
  var params = new URLSearchParams(location.search);
  var lesson = LESSONS.filter(function(l){ return l.file === params.get("file"); })[0] || LESSONS[0];
  document.title = lesson.title + " - AI-Agent-Starter-Study";

  var sidebarEl = document.getElementById("sidebar");
  var contentEl = document.getElementById("content");
  var doneBtn = document.getElementById("doneBtn");

  // 侧边栏
  sidebarEl.innerHTML = '<h4>课程目录</h4>' + LESSONS.map(function(l){
    var cls = [];
    if (l.file === lesson.file) cls.push("active");
    if (isDone(l.id)) cls.push("done");
    if (!l.ready) cls.push("soon");
    return '<a class="' + cls.join(" ") + '" href="lesson.html?file=' + l.file + '"><span class="dot"></span>' +
      l.id + " · " + l.title + "</a>";
  }).join("");

  // 完成打卡按钮
  function refreshDone(){
    var d = isDone(lesson.id);
    doneBtn.classList.toggle("done", d);
    doneBtn.textContent = d ? "✓ 已完成本课（点击取消）" : "标记本课完成";
  }
  doneBtn.onclick = function(){ setProgress(lesson.id, !isDone(lesson.id)); refreshDone(); };
  refreshDone();

  // 上一课 / 下一课
  function renderNav(){
    var idx = LESSONS.indexOf(lesson);
    var prev = LESSONS[idx - 1], next = LESSONS[idx + 1];
    var html = "<span>";
    if (prev) html += '<a class="btn" href="lesson.html?file=' + prev.file + '">← 第 ' + prev.id + " 课</a>";
    html += "</span><span>";
    if (next) html += '<a class="btn" href="lesson.html?file=' + next.file + '">第 ' + next.id + " 课 →</a>";
    html += "</span>";
    document.getElementById("lessonNav").innerHTML = html;
  }
  renderNav();

  // 加载课程内容
  function load(){
    if (!lesson.ready){
      contentEl.innerHTML = "<h1>第 " + lesson.id + " 课 · " + lesson.title + "</h1>" +
        '<blockquote>🚧 本课教程正在制作中，将随学习进度陆续更新，敬请期待！</blockquote>';
      return;
    }
    fetch("../docs/lessons/" + lesson.file).then(function(res){
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.text();
    }).then(function(md){
      contentEl.innerHTML = marked.parse(md);
      if (window.hljs) contentEl.querySelectorAll("pre code").forEach(function(el){ hljs.highlightElement(el); });
    }).catch(function(err){
      contentEl.innerHTML = "<h1>课程加载失败</h1>" +
        "<blockquote>无法读取课程文件（" + err.message + "）。<br><br>" +
        "如果你是<b>双击打开</b>的网页（file:// 协议），浏览器会禁止读取本地文件。<br>" +
        "解决办法：在项目根目录运行 <code>python -m http.server 8080</code>，" +
        "然后访问 <code>http://localhost:8080/web/</code>；<br>或直接访问在线版（GitHub Pages）。</blockquote>";
    });
  }
  load();
})();
