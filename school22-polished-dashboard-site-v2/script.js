const API_BASE = "https://school22-rating-api.onrender.com";

let state = {
  groupId: 2,
  classes: [],
  categories: [],
  allRating: [],
  uniformByClass: {},
  currentRows: [],
  ratingChart: null,
  directionChart: null,
  groupChart: null,
  modalChart: null,
  screenTimer: null,
  screenIndex: 0,
  screenElapsed: 0,
  idleEnabled: false,
  idleTimeout: null,
  idleTimer: null,
  idleIndex: 0,
  idleElapsed: 0
};

async function api(path){
  const response = await fetch(API_BASE + path);
  if(!response.ok) throw new Error(path);
  return response.json();
}

function toast(message){
  const el = document.getElementById("toast");
  el.textContent = message;
  el.classList.add("show");
  setTimeout(()=>el.classList.remove("show"), 2300);
}

async function loadData(refreshUniform = true){
  const [classes, categories, rating] = await Promise.all([
    api("/api/classes"),
    api("/api/categories"),
    api("/api/ratings/classes")
  ]);

  state.classes = classes;
  state.categories = categories;
  state.allRating = rating;

  if(refreshUniform || !Object.keys(state.uniformByClass).length){
    const summaries = await Promise.all(classes.map(async cls => {
      try { return [cls.id, await api(`/api/classes/${cls.id}/uniform-checks`)]; }
      catch(error) { return [cls.id, null]; }
    }));
    state.uniformByClass = Object.fromEntries(summaries);
  }

  hydrateMatrixRatings();
}

function hydrateMatrixRatings(){
  state.allRating.forEach(row => {
    const summary = state.uniformByClass[row.class_id];
    const responsibility = (row.categories || []).find(cat => cat.matrix_number === 8);
    if(responsibility && summary){
      responsibility.uniform_summary = summary;
      const uniformCriterion = (responsibility.subcategories || []).find(sub => sub.code === "КР-08.01");
      if(uniformCriterion){
        responsibility.points = Math.round((Number(responsibility.points || 0) - Number(uniformCriterion.points || 0) + Number(summary.average_points || 0)) * 100) / 100;
        uniformCriterion.points = Number(summary.average_points || 0);
        uniformCriterion.uniform_summary = summary;
      }
    }
    const possible = (row.categories || []).reduce((sum, cat) => sum + Number(cat.max_points || 0), 0);
    const earned = (row.categories || []).reduce((sum, cat) => sum + Number(cat.points || 0), 0);
    row.total = possible ? Math.round(earned / possible * 10000) / 100 : 0;
  });
  state.allRating.sort((a,b) => Number(b.total || 0) - Number(a.total || 0));
}

function rows(){
  if(state.groupId === "all") return state.allRating;
  return state.allRating.filter(row => row.group_id === state.groupId);
}

function groupName(){
  if(state.groupId === "all") return "Все классы";
  if(state.groupId === 1) return "Начальная школа";
  if(state.groupId === 2) return "Средняя школа";
  return "Старшая школа";
}

function rankClass(index){
  if(index === 0) return "first";
  if(index === 1) return "second";
  if(index === 2) return "third";
  return "";
}

function round(value){
  return Math.round((Number(value || 0)) * 10) / 10;
}

function uniformCategory(row){
  return (row.categories || []).find(cat => cat.uniform_summary);
}

function directionStats(data){
  return [...state.categories]
    .sort((a,b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
    .map(base => {
      const values = data.map(row => {
        const category = (row.categories || []).find(cat =>
          (base.matrix_number && cat.matrix_number === base.matrix_number) || cat.id === base.id
        );
        return { row, points: Number(category?.points || 0) };
      });
      const leader = [...values].sort((a,b) => b.points - a.points)[0];
      const average = values.length ? values.reduce((sum,item) => sum + item.points, 0) / values.length : 0;
      return {
        id: base.id,
        number: base.matrix_number || base.sort_order,
        name: base.name,
        average: round(average),
        leaderName: leader?.row?.class_name || "—",
        leaderPoints: round(leader?.points || 0)
      };
    });
}

function shortDirectionName(name){
  return String(name || "")
    .replace(/^Самый\s+/i, "")
    .replace(/^Самая\s+/i, "")
    .replace(/^Самое\s+/i, "")
    .replace(/\s+класс$/i, "");
}

function classRowHTML(row, index, compact = false){
  const total = round(row.total);
  const uniform = uniformCategory(row);
  return `
    <article class="class-row" onclick="openClass(${row.class_id})">
      <div class="rank ${rankClass(index)}">${index + 1}</div>
      <div>
        <h4>${row.class_name} класс</h4>
        <p>${row.students_count || 0} учеников · форма: ${round(uniform?.points)} б.</p>
      </div>
      ${compact ? "" : `<div class="bar"><span style="width:${Math.min(100,total)}%"></span></div>`}
      <div class="score">${total}</div>
    </article>
  `;
}

function render(){
  state.currentRows = rows();
  const data = state.currentRows;
  const avg = data.length ? round(data.reduce((s,r)=>s + Number(r.total || 0),0) / data.length) : 0;
  const students = data.reduce((s,r)=>s + Number(r.students_count || 0),0);
  const totals = data.map(row => Number(row.total || 0));
  const spread = totals.length > 1 ? round(Math.max(...totals) - Math.min(...totals)) : 0;
  const checkedUniform = data.filter(row => uniformCategory(row)?.uniform_summary?.is_checked_current_month).length;

  document.getElementById("pageTitle").textContent = groupName();
  document.getElementById("leaderClass").textContent = data[0]?.class_name || "—";
  document.getElementById("classesCount").textContent = data.length;
  document.getElementById("avgScore").textContent = avg;
  document.getElementById("studentsTotal").textContent = students;
  document.getElementById("scoreSpread").textContent = spread;
  document.getElementById("uniformCoverage").textContent = `${checkedUniform}/${data.length}`;

  document.getElementById("classCards").innerHTML = data.map((row,index)=>classRowHTML(row,index)).join("");
  renderChart(data);
  renderDirectionMini(data);
  renderAnalytics(data);
  renderTable(data);
  renderUniform(data);
  renderScreen();
}

function renderChart(data){
  const canvas = document.getElementById("ratingChart");
  if(!canvas) return;
  if(state.ratingChart) state.ratingChart.destroy();

  state.ratingChart = new Chart(canvas, {
    type: "bar",
    data: {
      labels: data.map(row => row.class_name),
      datasets: [{
        data: data.map(row => round(row.total)),
        borderRadius: 12,
        maxBarThickness: 44,
        backgroundColor: "rgba(91,53,245,.82)"
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display:false } },
      scales: {
        x: { grid: { display:false }, ticks: { font: { weight:"800" } } },
        y: { beginAtZero:true, suggestedMax:100, grid:{ color:"rgba(17,24,47,.08)" }, ticks:{ font:{ weight:"700" } } }
      }
    }
  });
}

function renderDirectionMini(data){
  const top = directionStats(data).sort((a,b) => b.average - a.average).slice(0,4);
  document.getElementById("directionMini").innerHTML = top.map((item,index) => `
    <div class="direction-mini-row">
      <div class="direction-mini-place">${index + 1}</div>
      <div>
        <b>${shortDirectionName(item.name)}</b>
        <small>Лидер: ${item.leaderName} · ${item.leaderPoints} б.</small>
      </div>
      <strong>${item.average}</strong>
    </div>
  `).join("") || `<p class="empty">Показателей пока нет</p>`;
}

function renderAnalytics(data){
  const directions = directionStats(data);
  const ranked = [...directions].sort((a,b) => b.average - a.average);
  const best = ranked[0];
  const weak = ranked[ranked.length - 1];
  const active = data.filter(row => Number(row.total || 0) > 0).length;

  document.getElementById("bestDirection").textContent = best ? shortDirectionName(best.name) : "—";
  document.getElementById("bestDirectionValue").textContent = best ? `Средний балл: ${best.average} из 100` : "Пока нет данных";
  document.getElementById("weakDirection").textContent = weak ? shortDirectionName(weak.name) : "—";
  document.getElementById("weakDirectionValue").textContent = weak ? `Средний балл: ${weak.average} из 100` : "Пока нет данных";
  document.getElementById("activeClasses").textContent = `${active}/${data.length}`;

  document.getElementById("directionLeaders").innerHTML = directions.map(item => `
    <article class="direction-leader-card">
      <span>${item.number}</span>
      <div>
        <h4>${shortDirectionName(item.name)}</h4>
        <p>${item.leaderName} класс</p>
      </div>
      <strong>${item.leaderPoints}</strong>
    </article>
  `).join("");

  if(!document.getElementById("analytics").classList.contains("active")) return;
  renderDirectionChart(directions);
  renderGroupChart();
}

function renderDirectionChart(directions){
  const canvas = document.getElementById("directionChart");
  if(state.directionChart) state.directionChart.destroy();
  state.directionChart = new Chart(canvas, {
    type: "bar",
    data: {
      labels: directions.map(item => shortDirectionName(item.name)),
      datasets: [{
        data: directions.map(item => item.average),
        borderRadius: 9,
        backgroundColor: directions.map((item,index) => index % 2 ? "rgba(124,92,255,.76)" : "rgba(91,53,245,.9)")
      }]
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display:false } },
      scales: {
        x: { beginAtZero:true, suggestedMax:100, grid:{ color:"rgba(17,24,47,.07)" } },
        y: { grid:{ display:false }, ticks:{ font:{ weight:"800" } } }
      }
    }
  });
}

function renderGroupChart(){
  const groups = [
    { id:1, name:"1–4 классы" },
    { id:2, name:"5–8 классы" },
    { id:3, name:"9–11 классы" }
  ].map(group => {
    const values = state.allRating.filter(row => row.group_id === group.id);
    const average = values.length ? values.reduce((sum,row) => sum + Number(row.total || 0),0) / values.length : 0;
    return { ...group, average:round(average) };
  });

  const canvas = document.getElementById("groupChart");
  if(state.groupChart) state.groupChart.destroy();
  state.groupChart = new Chart(canvas, {
    type: "bar",
    data: {
      labels: groups.map(group => group.name),
      datasets: [{
        data: groups.map(group => group.average),
        borderRadius: 14,
        maxBarThickness: 76,
        backgroundColor: ["#7c5cff", "#5b35f5", "#11182f"]
      }]
    },
    options: {
      responsive:true,
      maintainAspectRatio:false,
      plugins:{ legend:{ display:false } },
      scales:{
        x:{ grid:{ display:false }, ticks:{ font:{ weight:"800" } } },
        y:{ beginAtZero:true, suggestedMax:100, grid:{ color:"rgba(17,24,47,.07)" } }
      }
    }
  });
}

function categoryNames(data){
  const first = data.find(row => row.categories && row.categories.length);
  return first ? first.categories.map(cat => cat.name) : state.categories.map(cat => cat.name);
}

function renderTable(data){
  const names = categoryNames(data);

  document.getElementById("classesTableHead").innerHTML = `
    <tr>
      <th>Место</th>
      <th>Класс</th>
      <th>Ученики</th>
      ${names.map(name => `<th>${name}</th>`).join("")}
      <th>Итог</th>
    </tr>
  `;

  document.getElementById("classesTable").innerHTML = data.map((row,index)=>`
    <tr onclick="openClass(${row.class_id})">
      <td><div class="rank ${rankClass(index)}">${index + 1}</div></td>
      <td>${row.class_name} класс</td>
      <td>${row.students_count || 0}</td>
      ${(row.categories || []).map(cat => `<td>${round(cat.points)}</td>`).join("")}
      <td class="score">${round(row.total)}</td>
    </tr>
  `).join("");
}

function renderUniform(data){
  const sorted = [...data].sort((a,b)=>round(uniformCategory(b)?.points)-round(uniformCategory(a)?.points));

  document.getElementById("uniformMini").innerHTML = sorted.slice(0,5).map((row,index)=>{
    const u = uniformCategory(row);
    return `
      <button class="mini-row" onclick="openClass(${row.class_id})">
        <span>${index + 1}. ${row.class_name}</span>
        <b>${round(u?.points)}</b>
      </button>
    `;
  }).join("");

  document.getElementById("uniformBoard").innerHTML = sorted.map(row=>{
    const u = uniformCategory(row);
    const checks = u?.uniform_summary?.checks_count || 0;
    const checked = u?.uniform_summary?.is_checked_current_month;
    return `
      <article class="uniform-card ${checked ? "checked" : "unchecked"}" onclick="openClass(${row.class_id})">
        <h4>${row.class_name} класс</h4>
        <strong>${round(u?.points)}</strong>
        <p>${checked ? "Проверено в текущем месяце" : "Не проверено в текущем месяце"}</p>
        <p>${checks} проверок · ${row.students_count || 0} учеников</p>
      </article>
    `;
  }).join("");
}

async function openClass(classId){
  stopIdleMode(false);
  const details = await api(`/api/classes/${classId}/details`);
  const row = details.class;
  const uniform = details.uniform || {checks:[], checks_count:0, average_points:0};
  const responsibility = (row.categories || []).find(cat => cat.matrix_number === 8);
  if(responsibility){
    responsibility.uniform_summary = uniform;
    const uniformCriterion = (responsibility.subcategories || []).find(sub => sub.code === "КР-08.01");
    if(uniformCriterion){
      responsibility.points = Math.round((Number(responsibility.points || 0) - Number(uniformCriterion.points || 0) + Number(uniform.average_points || 0)) * 100) / 100;
      uniformCriterion.points = Number(uniform.average_points || 0);
      uniformCriterion.uniform_summary = uniform;
    }
  }
  const possible = (row.categories || []).reduce((sum, cat) => sum + Number(cat.max_points || 0), 0);
  const earned = (row.categories || []).reduce((sum, cat) => sum + Number(cat.points || 0), 0);
  row.total = possible ? Math.round(earned / possible * 10000) / 100 : 0;

  document.getElementById("modalTitle").textContent = `${row.class_name} класс`;
  document.getElementById("modalScore").textContent = round(row.total);
  document.getElementById("modalStudents").textContent = row.students_count || 0;
  document.getElementById("modalUniformChecks").textContent = uniform.checks_count || 0;
  document.getElementById("modalUniformAverage").textContent = round(uniform.average_points);

  const categories = row.categories || [];

  document.getElementById("modalCategories").innerHTML = categories.map(cat => `
    <section class="direction-item">
      <div class="direction-top">
        <span>${cat.name}</span>
        <b>${round(cat.points)}</b>
      </div>
      <div class="bar"><span style="width:${Math.min(100,(Number(cat.points||0)/Number(cat.max_points||100))*100)}%"></span></div>
      <div class="subcategory-list">
        ${(cat.subcategories || []).map(sub => `
          <div class="subcategory-row">
            <span>${sub.code ? `${sub.code} · ` : ""}${sub.name}${sub.formula_code ? ` · ${sub.formula_code}` : ""}</span>
            <b>${round(sub.points)} / ${sub.max_points}</b>
          </div>
          ${(sub.events || []).map(event => `
            <div class="event-row">
              <span>${event.event_date} · ${event.title}</span>
              <b>+${round(event.points)}</b>
            </div>
          `).join("")}
        `).join("")}
      </div>
    </section>
  `).join("");

  document.getElementById("modalUniformHistory").innerHTML = (uniform.checks || []).map(check => `
    <article class="history-item">
      <div>
        <h4>${check.check_date}</h4>
        <p>Без формы: ${check.without_uniform} · В форме: ${check.in_uniform} · ${check.percent_in_uniform}%</p>
      </div>
      <strong>${check.points}</strong>
    </article>
  `).join("") || `<p class="empty">Проверок формы пока нет</p>`;

  const canvas = document.getElementById("modalChart");
  if(state.modalChart) state.modalChart.destroy();

  state.modalChart = new Chart(canvas, {
    type: "radar",
    data: {
      labels: categories.map(cat => cat.name),
      datasets: [{
        data: categories.map(cat => round(cat.points)),
        borderColor: "rgba(91,53,245,.9)",
        backgroundColor: "rgba(91,53,245,.14)",
        pointBackgroundColor: "rgba(91,53,245,.95)"
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display:false } },
      scales: { r: { min:0 } }
    }
  });

  document.getElementById("classModal").classList.add("active");
}

function switchPage(page){
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.getElementById(page).classList.add("active");
  document.querySelectorAll(".nav-link").forEach(btn => btn.classList.toggle("active", btn.dataset.page === page));

  if(page === "screen") startScreenMode();
  else stopScreenMode();
  if(page === "analytics") requestAnimationFrame(() => renderAnalytics(state.currentRows));

  resetIdleTimer();
}

function directionScreenHTML(data){
  return directionStats(data)
    .sort((a,b) => b.average - a.average)
    .slice(0,6)
    .map((item,index) => `
      <div class="screen-metric">
        <span>${index + 1}</span>
        <b>${shortDirectionName(item.name)}</b>
        <strong>${item.average}</strong>
      </div>
    `).join("");
}

function renderScreen(){
  const data = state.currentRows;
  const slides = [
    {label: groupName(), title: "Рейтинг классов", html: data.slice(0,6).map((r,i)=>classRowHTML(r,i,true)).join("")},
    {label: "Школьная форма", title: "Средний балл формы", html: [...data].sort((a,b)=>round(uniformCategory(b)?.points)-round(uniformCategory(a)?.points)).slice(0,6).map((r,i)=>classRowHTML({...r,total:round(uniformCategory(r)?.points)},i,true)).join("")},
    {label: "Аналитика", title: "Сильные направления", html: directionScreenHTML(data)}
  ];

  const slide = slides[state.screenIndex % slides.length];
  document.getElementById("screenLabel").textContent = slide.label;
  document.getElementById("screenTitle").textContent = slide.title;
  document.getElementById("screenContent").innerHTML = slide.html;
}

function startScreenMode(){
  stopScreenMode();
  state.screenElapsed = 0;
  renderScreen();

  state.screenTimer = setInterval(()=>{
    state.screenElapsed += 0.1;
    document.getElementById("screenProgress").style.width = `${Math.min(100,state.screenElapsed / 7 * 100)}%`;

    if(state.screenElapsed >= 7){
      state.screenElapsed = 0;
      state.screenIndex++;
      renderScreen();
    }
  },100);
}

function stopScreenMode(){
  if(state.screenTimer) clearInterval(state.screenTimer);
  state.screenTimer = null;
}

function idleSlides(){
  const data = state.currentRows;
  const uniformSorted = [...data].sort((a,b)=>round(uniformCategory(b)?.points)-round(uniformCategory(a)?.points));

  return [
    {
      label: groupName(),
      title: "Рейтинг классов",
      html: data.slice(0,6).map((r,i)=>classRowHTML(r,i,true)).join("")
    },
    {
      label: "Школьная форма",
      title: "Лучшие показатели формы",
      html: uniformSorted.slice(0,6).map((r,i)=>classRowHTML({...r,total:round(uniformCategory(r)?.points)},i,true)).join("")
    },
    {
      label: "Лидер рейтинга",
      title: data[0] ? `${data[0].class_name} класс` : "Пока нет данных",
      html: data[0] ? classRowHTML(data[0],0,true) : ""
    },
    {
      label: "Аналитика",
      title: "Сильные направления",
      html: directionScreenHTML(data)
    }
  ];
}

function renderIdleSlide(){
  const slides = idleSlides();
  const slide = slides[state.idleIndex % slides.length];

  document.getElementById("idleLabel").textContent = slide.label;
  document.getElementById("idleTitle").textContent = slide.title;
  document.getElementById("idleContent").innerHTML = slide.html;
}

function startIdleMode(){
  if(document.getElementById("classModal").classList.contains("active")) return;

  state.idleEnabled = true;
  state.idleIndex = 0;
  state.idleElapsed = 0;
  renderIdleSlide();

  document.getElementById("idleOverlay").classList.add("active");

  clearInterval(state.idleTimer);
  state.idleTimer = setInterval(()=>{
    state.idleElapsed += 0.1;
    document.getElementById("idleProgress").style.width = `${Math.min(100,state.idleElapsed / 7 * 100)}%`;

    if(state.idleElapsed >= 7){
      state.idleElapsed = 0;
      state.idleIndex++;
      renderIdleSlide();
    }
  },100);
}

function stopIdleMode(reset = true){
  state.idleEnabled = false;
  document.getElementById("idleOverlay").classList.remove("active");
  clearInterval(state.idleTimer);
  state.idleTimer = null;
  if(reset) resetIdleTimer();
}

function resetIdleTimer(){
  clearTimeout(state.idleTimeout);
  if(state.idleEnabled) return;
  state.idleTimeout = setTimeout(startIdleMode, 10000);
}

["mousemove","mousedown","keydown","touchstart","scroll"].forEach(eventName=>{
  window.addEventListener(eventName,()=>{
    if(state.idleEnabled) stopIdleMode();
    else resetIdleTimer();
  },{passive:true});
});

document.querySelectorAll(".nav-link").forEach(btn => btn.addEventListener("click",()=>switchPage(btn.dataset.page)));

document.getElementById("groupSelect").addEventListener("change", e => {
  state.groupId = e.target.value === "all" ? "all" : Number(e.target.value);
  render();
  resetIdleTimer();
});

document.getElementById("refreshBtn").addEventListener("click", async()=>{
  await loadData();
  render();
  toast("Обновлено");
  resetIdleTimer();
});

document.getElementById("exitIdle").addEventListener("click",()=>stopIdleMode());

document.getElementById("closeModal").addEventListener("click",()=>{
  document.getElementById("classModal").classList.remove("active");
  resetIdleTimer();
});

document.getElementById("classModal").addEventListener("click", e=>{
  if(e.target.id === "classModal") {
    document.getElementById("classModal").classList.remove("active");
    resetIdleTimer();
  }
});

loadData().then(()=>{
  render();
  resetIdleTimer();
  setInterval(async()=>{
    await loadData(false);
    render();
  },30000);
}).catch(error=>{
  console.error(error);
  toast("Ошибка загрузки данных");
});
