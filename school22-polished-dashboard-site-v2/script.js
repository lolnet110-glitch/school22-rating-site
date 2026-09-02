const API_BASE = "";

let state = {
  groupId: "all",
  classes: [],
  categories: [],
  allRating: [],
  uniformByClass: {},
  currentRows: [],
  selectedDirectionId: null,
  ratingChart: null,
  directionChart: null,
  directionDetailChart: null,
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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 35000);
  try{
    const response = await fetch(API_BASE + path, {
      signal: controller.signal,
      cache: "no-store"
    });
    if(!response.ok) throw new Error(`${path}: ${response.status}`);
    return response.json();
  }finally{
    clearTimeout(timeout);
  }
}

function toast(message){
  const el = document.getElementById("toast");
  el.textContent = message;
  el.classList.add("show");
  setTimeout(()=>el.classList.remove("show"), 2300);
}

function setDataStatus(type, message){
  const status = document.getElementById("dataStatus");
  status.className = `data-status ${type}`;
  document.getElementById("dataStatusText").textContent = message;
  document.getElementById("retryDataBtn").classList.toggle("hidden", type !== "error");
}

async function loadAndRender({ announce = true, successToast = false, refreshUniform = true } = {}){
  if(announce) setDataStatus("loading", "Загружаем актуальный рейтинг…");
  try{
    await loadData(refreshUniform);
    render();
    const active = state.allRating.filter(row => Number(row.total || 0) > 0).length;
    setDataStatus("success", `Данные загружены · результаты внесены у ${active} из ${state.allRating.length} классов`);
    if(successToast) toast("Обновлено");
    resetIdleTimer();
    return true;
  }catch(error){
    console.error(error);
    setDataStatus("error", "Не удалось загрузить рейтинг. Нажмите «Повторить» — нули ниже не являются актуальными данными.");
    return false;
  }
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

function sortedDirections(){
  return [...state.categories].sort((a,b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
}

function selectedDirection(){
  const directions = sortedDirections();
  if(!state.selectedDirectionId && directions.length) state.selectedDirectionId = directions[0].id;
  return directions.find(item => item.id === state.selectedDirectionId) || directions[0] || null;
}

function directionForRow(row, base){
  if(!base) return null;
  return (row.categories || []).find(category =>
    category.id === base.id ||
    (base.matrix_number && category.matrix_number === base.matrix_number)
  );
}

function activePage(){
  return document.querySelector(".page.active")?.id || "overview";
}

function updatePageTitle(){
  const titles = {
    directions: "Направления рейтинга",
    analytics: "Аналитика",
    uniform: "Школьная форма",
    screen: "Экранный режим"
  };
  document.getElementById("pageTitle").textContent = titles[activePage()] || groupName();
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

  updatePageTitle();
  document.getElementById("leaderClass").textContent = data[0]?.class_name || "—";
  document.getElementById("classesCount").textContent = data.length;
  document.getElementById("avgScore").textContent = avg;
  document.getElementById("studentsTotal").textContent = students;
  document.getElementById("scoreSpread").textContent = spread;
  document.getElementById("uniformCoverage").textContent = `${checkedUniform}/${data.length}`;

  document.getElementById("classCards").innerHTML = data.map((row,index)=>classRowHTML(row,index)).join("");
  renderChart(data);
  renderDirectionMini(data);
  renderDirections(data);
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

function selectDirection(directionId){
  state.selectedDirectionId = Number(directionId);
  renderDirections(state.currentRows);
  document.getElementById("directionDashboard")?.scrollIntoView({ behavior:"smooth", block:"start" });
  resetIdleTimer();
}

function renderDirections(data){
  const directions = sortedDirections();
  const base = selectedDirection();
  if(!base) return;

  document.getElementById("directionCatalog").innerHTML = directions.map((direction,index) => {
    const values = data.map(row => Number(directionForRow(row,direction)?.points || 0));
    const average = values.length ? round(values.reduce((sum,value) => sum + value,0) / values.length) : 0;
    const active = values.filter(value => value > 0).length;
    return `
      <button class="direction-catalog-card ${direction.id === base.id ? "active" : ""}" onclick="selectDirection(${direction.id})">
        <span>${String(direction.matrix_number || direction.sort_order || index + 1).padStart(2,"0")}</span>
        <div><h4>${direction.name}</h4><p>${(direction.subcategories || []).length} критериев · ${active}/${data.length} классов</p></div>
        <strong>${average}</strong>
      </button>
    `;
  }).join("");

  const ranking = data.map(row => ({
    row,
    category:directionForRow(row,base),
    points:Number(directionForRow(row,base)?.points || 0)
  })).sort((a,b) => b.points - a.points || a.row.class_name.localeCompare(b.row.class_name,"ru"));
  const average = ranking.length ? round(ranking.reduce((sum,item) => sum + item.points,0) / ranking.length) : 0;
  const covered = ranking.filter(item => item.points > 0).length;
  const leader = ranking[0];
  const sampleCategory = ranking.find(item => item.category)?.category;
  const criteria = sampleCategory?.subcategories || base.subcategories || [];

  document.getElementById("directionDetailLabel").textContent = `Направление ${String(base.matrix_number || base.sort_order || 1).padStart(2,"0")}`;
  document.getElementById("directionDetailTitle").textContent = base.name;
  document.getElementById("directionDetailDescription").textContent = `${criteria.length} показателей · расчёты и формулы остаются без изменений`;
  document.getElementById("directionDetailAverage").textContent = average;
  document.getElementById("directionDetailLeader").textContent = leader?.row?.class_name || "—";
  document.getElementById("directionDetailLeaderScore").textContent = `${round(leader?.points)} из ${base.max_points || 100} баллов`;
  document.getElementById("directionDetailCoverage").textContent = `${covered}/${ranking.length}`;
  document.getElementById("directionDetailCriteriaCount").textContent = criteria.length;

  document.getElementById("directionRanking").innerHTML = ranking.map((item,index) => `
    <button class="direction-rank-row" onclick="openClass(${item.row.class_id})">
      <span class="rank ${rankClass(index)}">${index + 1}</span>
      <div><b>${item.row.class_name} класс</b><small>${item.row.students_count || 0} учеников</small></div>
      <strong>${round(item.points)}</strong>
    </button>
  `).join("");

  document.getElementById("directionCriteria").innerHTML = criteria.map(criterion => {
    const values = ranking.map(item => {
      const sub = (item.category?.subcategories || []).find(candidate => candidate.id === criterion.id || candidate.code === criterion.code);
      return Number(sub?.points || 0);
    });
    const criterionAverage = values.length ? round(values.reduce((sum,value) => sum + value,0) / values.length) : 0;
    const criterionCoverage = values.filter(value => value > 0).length;
    return `
      <article class="direction-criterion-card">
        <div class="criterion-code">${criterion.code || "Показатель"}</div>
        <h4>${criterion.name}</h4>
        <div class="criterion-metrics"><strong>${criterionAverage}</strong><span>средний балл</span><b>${criterionCoverage}/${ranking.length}</b><span>классов</span></div>
        <p>${criterion.measurement || "Показатель направления"}</p>
        <div class="criterion-formula-public"><b>${criterion.formula_code || "Ручной ввод"}</b><span>${criterion.scoring_rule || `До ${criterion.max_points || 10} баллов`}</span></div>
      </article>
    `;
  }).join("") || `<p class="empty">Критерии пока не добавлены</p>`;

  if(activePage() === "directions") requestAnimationFrame(() => renderDirectionDetailChart(ranking,base));
}

function renderDirectionDetailChart(ranking,base){
  const canvas = document.getElementById("directionDetailChart");
  if(!canvas) return;
  if(state.directionDetailChart) state.directionDetailChart.destroy();
  state.directionDetailChart = new Chart(canvas,{
    type:"bar",
    data:{
      labels:ranking.map(item => item.row.class_name),
      datasets:[{
        data:ranking.map(item => round(item.points)),
        backgroundColor:ranking.map((item,index) => index < 3 ? ["#f0a800","#9aa3b7","#df7b32"][index] : "rgba(91,53,245,.82)"),
        borderRadius:10,
        maxBarThickness:42
      }]
    },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      plugins:{legend:{display:false}},
      scales:{
        x:{grid:{display:false},ticks:{font:{weight:"800"}}},
        y:{beginAtZero:true,suggestedMax:Number(base.max_points || 100),grid:{color:"rgba(17,24,47,.08)"}}
      }
    }
  });
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
  const details = state.usingSnapshot
    ? {
        class: JSON.parse(JSON.stringify(state.allRating.find(row => Number(row.class_id) === Number(classId)))),
        uniform: JSON.parse(JSON.stringify(state.uniformByClass[classId] || {checks:[], checks_count:0, average_points:0}))
      }
    : await api(`/api/classes/${classId}/details`);
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
  if(page === "directions") requestAnimationFrame(() => renderDirections(state.currentRows));
  updatePageTitle();

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

function isFullscreen(){
  return Boolean(document.fullscreenElement || document.webkitFullscreenElement);
}

function syncFullscreenButton(){
  const active = isFullscreen();
  const button = document.getElementById("fullscreenBtn");
  document.getElementById("fullscreenBtnText").textContent = active ? "Выйти" : "На весь экран";
  button.setAttribute("aria-pressed", String(active));
  button.setAttribute("aria-label", active ? "Выйти из полноэкранного режима" : "Открыть рейтинг на весь экран");
}

async function toggleFullscreen(){
  try{
    if(!isFullscreen()){
      const open = document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen;
      if(!open) return toast("Полноэкранный режим не поддерживается этим браузером");
      await open.call(document.documentElement);
    }else{
      const close = document.exitFullscreen || document.webkitExitFullscreen;
      if(close) await close.call(document);
    }
  }catch(error){
    toast("Не удалось открыть полноэкранный режим");
  }
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

document.getElementById("refreshBtn").addEventListener("click",()=>loadAndRender({ successToast:true }));
document.getElementById("retryDataBtn").addEventListener("click",()=>loadAndRender({ successToast:true }));
document.getElementById("fullscreenBtn").addEventListener("click", toggleFullscreen);
document.addEventListener("fullscreenchange", syncFullscreenButton);
document.addEventListener("webkitfullscreenchange", syncFullscreenButton);

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

loadAndRender();
setInterval(()=>loadAndRender({ announce:false, refreshUniform:false }),30000);
