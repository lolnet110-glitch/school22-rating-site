const API_BASE = "https://school22-rating-api.onrender.com";

let state = {
  groupId: 2,
  classes: [],
  categories: [],
  allRating: [],
  currentRows: [],
  ratingChart: null,
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

async function loadData(){
  const [classes, categories, rating] = await Promise.all([
    api("/api/classes"),
    api("/api/categories"),
    api("/api/ratings/classes")
  ]);

  state.classes = classes;
  state.categories = categories;
  state.allRating = rating;
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
  return (row.categories || []).find(cat => cat.name.toLowerCase().includes("форма"));
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

  document.getElementById("pageTitle").textContent = groupName();
  document.getElementById("leaderClass").textContent = data[0]?.class_name || "—";
  document.getElementById("classesCount").textContent = data.length;
  document.getElementById("avgScore").textContent = avg;
  document.getElementById("studentsTotal").textContent = students;

  document.getElementById("classCards").innerHTML = data.map((row,index)=>classRowHTML(row,index)).join("");
  renderChart(data);
  renderLeaderCategories(data[0]);
  renderTable(data);
  renderUniform(data);
  renderCategories();
  renderScreen();
}

function renderChart(data){
  const canvas = document.getElementById("ratingChart");
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
        y: { beginAtZero:true, grid:{ color:"rgba(17,24,47,.08)" }, ticks:{ font:{ weight:"700" } } }
      }
    }
  });
}

function renderLeaderCategories(row){
  const box = document.getElementById("leaderCategories");
  if(!row){
    box.innerHTML = "";
    return;
  }

  box.innerHTML = (row.categories || []).map(cat => `
    <div class="category-pill">
      <b>${cat.name}<span>${round(cat.points)}</span></b>
      <small>до ${cat.max_points} баллов</small>
    </div>
  `).join("");
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
    return `
      <article class="uniform-card" onclick="openClass(${row.class_id})">
        <h4>${row.class_name} класс</h4>
        <strong>${round(u?.points)}</strong>
        <p>${checks} проверок · ${row.students_count || 0} учеников</p>
      </article>
    `;
  }).join("");
}

function renderCategories(){
  document.getElementById("categoryFull").innerHTML = state.categories.map(cat => `
    <article class="category-card">
      <h4>${cat.name}</h4>
      <strong>${cat.max_points}</strong>
      <p>Максимум баллов</p>
      <div class="sub-list">
        ${(cat.subcategories || []).map(sub => `
          <div class="sub-item">
            <span>${sub.name}</span>
            <b>${sub.max_points}</b>
          </div>
        `).join("") || `<div class="sub-item muted">Без подкатегорий</div>`}
      </div>
    </article>
  `).join("");
}

async function openClass(classId){
  const details = await api(`/api/classes/${classId}/details`);
  const row = details.class;
  const uniform = details.uniform || {checks:[], checks_count:0, average_points:0};

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
            <span>${sub.name}</span>
            <b>${round(sub.points)} / ${sub.max_points}</b>
          </div>
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
}

function renderScreen(){
  const data = state.currentRows;
  const slides = [
    {label: groupName(), title: "Рейтинг классов", html: data.slice(0,6).map((r,i)=>classRowHTML(r,i,true)).join("")},
    {label: "Школьная форма", title: "Средний балл формы", html: [...data].sort((a,b)=>round(uniformCategory(b)?.points)-round(uniformCategory(a)?.points)).slice(0,6).map((r,i)=>classRowHTML({...r,total:round(uniformCategory(r)?.points)},i,true)).join("")},
    {label: "Категории", title: "Структура рейтинга", html: state.categories.map(cat => `<div class="screen-category"><b>${cat.name}</b><span>${cat.max_points} баллов</span></div>`).join("")}
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
      label: "Категории",
      title: "Структура рейтинга",
      html: state.categories.map(cat => `<div class="screen-category"><b>${cat.name}</b><span>${cat.max_points} баллов</span></div>`).join("")
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

function stopIdleMode(){
  state.idleEnabled = false;
  document.getElementById("idleOverlay").classList.remove("active");
  clearInterval(state.idleTimer);
  state.idleTimer = null;
  resetIdleTimer();
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
}
);


document.querySelectorAll(".nav-link").forEach(btn => btn.addEventListener("click",()=>switchPage(btn.dataset.page)));

document.getElementById("groupSelect").addEventListener("change", e => {
  state.groupId = e.target.value === "all" ? "all" : Number(e.target.value);
  render();
});

document.getElementById("refreshBtn").addEventListener("click", async()=>{
  await loadData();
  render();
});

document.getElementById("closeModal").addEventListener("click",()=>{
  document.getElementById("classModal").classList.remove("active");
  resetIdleTimer();
});

document.getElementById("exitIdle").addEventListener("click", stopIdleMode);

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
    await loadData();
    render();
  },30000);
}).catch(error=>{
  console.error(error);
});
