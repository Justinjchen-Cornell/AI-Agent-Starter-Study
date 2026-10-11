/* 首页：渲染课程卡片与学习进度 */
(function(){
  var grid = document.getElementById("lessonGrid");
  grid.innerHTML = LESSONS.map(function(l){
    var done = isDone(l.id);
    var badge = done ? '<span class="badge done">已完成 ✓</span>'
                     : (l.ready ? '<span class="badge">可学习</span>' : '<span class="badge soon">建设中</span>');
    return '<a class="card" href="lesson.html?file=' + l.file + '">' + badge +
      '<div class="num">第 ' + l.id + ' 课</div><h3>' + l.title + '</h3><p>' + l.desc + '</p></a>';
  }).join("");

  var n = countDone();
  document.getElementById("progressText").textContent = n + " / " + LESSONS.length;
  document.getElementById("progressBar").style.width = (n / LESSONS.length * 100) + "%";

  var next = LESSONS.filter(function(l){ return l.ready && !isDone(l.id); })[0] || LESSONS[0];
  var startBtn = document.getElementById("startBtn");
  startBtn.href = "lesson.html?file=" + next.file;
  startBtn.textContent = n > 0 ? ("继续学习：第 " + next.id + " 课") : "开始第 1 课";
})();
