const API_BASE = "https://school22-rating-api.onrender.com";

const FALLBACK = {
  categories: [
    {name:"Учёба и наука", max_points:100, subcategories:[{name:"Олимпиады",max_points:40},{name:"Проекты",max_points:35},{name:"Успеваемость",max_points:25}]},
    {name:"Спорт и здоровье", max_points:100, subcategories:[{name:"Соревнования",max_points:40},{name:"Секции",max_points:30},{name:"Активность",max_points:30}]},
    {name:"Творчество и медиа", max_points:100, subcategories:[{name:"Конкурсы",max_points:40},{name:"Выступления",max_points:35},{name:"Медиа",max_points:25}]},
    {name:"Активность и волонтёрство", max_points:100, subcategories:[{name:"Помощь школе",max_points:35},{name:"Акции",max_points:35},{name:"Инициативы",max_points:30}]}
  ],
  ratings: {
    1: [
      {class_id:1,class_name:"4А",students_count:24,average_students_score:78,class_bonus:8,total:86},
      {class_id:2,class_name:"3Б",students_count:22,average_students_score:75,class_bonus:6,total:81},
      {class_id:3,class_name:"2А",students_count:21,average_students_score:73,class_bonus:4,total:77},
      {class_id:4,class_name:"1Б",students_count:20,average_students_score:70,class_bonus:3,total:73}
    ],
    2: [
      {class_id:5,class_name:"5А",students_count:25,average_students_score:82,class_bonus:10,total:92},
      {class_id:6,class_name:"7Б",students_count:23,average_students_score:80,class_bonus:7,total:87},
      {class_id:7,class_name:"6А",students_count:24,average_students_score:77,class_bonus:6,total:83},
      {class_id:8,class_name:"8Б",students_count:22,average_students_score:74,class_bonus:5,total:79}
    ],
    3: [
      {class_id:9,class_name:"11А",students_count:20,average_students_score:81,class_bonus:8,total:89},
      {class_id:10,class_name:"10Б",students_count:21,average_students_score:78,class_bonus:6,total:84},
      {class_id:11,class_name:"9А",students_count:25,average_students_score:75,class_bonus:5,total:80},
      {class_id:12,class_name:"11Б",students_count:18,average_students_score:72,class_bonus:4,total:76}
    ]
  }
};


const FALLBACK_STUDENTS = {
  "4А": ["Иванов Артём","Смирнова София","Петров Михаил","Кузнецова Анна","Орлова Мария"],
  "3Б": ["Фёдорова Алиса","Новиков Кирилл","Белова Дарья","Соколов Тимур"],
  "2А": ["Громова Ева","Морозов Илья","Павлова Кира"],
  "1Б": ["Зайцев Матвей","Егорова Полина","Крылов Лев"],
  "5А": ["Иванов Михаил","Петрова Анна","Сидоров Максим","Андреева Ксения","Попов Матвей"],
  "7Б": ["Орлов Илья","Белова Дарья","Лебедев Максим","Фёдорова Алиса"],
  "6А": ["Кузнецова Мария","Васильева Ева","Новиков Кирилл","Павлов Никита"],
  "8Б": ["Васильев Даниил","Захарова Виктория","Соколов Артём"],
  "11А": ["Смирнова София","Соколов Артём","Морозова Полина"],
  "10Б": ["Захарова Виктория","Павлов Никита","Андреева Ксения"],
  "9А": ["Орлов Илья","Белова Дарья","Попов Матвей"],
  "11Б": ["Морозова Полина","Васильев Даниил","Кузнецова Мария"]
};

let state = {
  groupId: 2,
  page: "overview",
  categories: [],
  ratings: {},
  classes: [],
  ratingChart: null,
  modalChart: null,
  idleEnabled: false,
  idleTimeout: null,
  idleTimer: null,
  idleSlideIndex: 0,
  idleElapsed: 0
};

async function api(path){
  const response = await fetch(API_BASE + path);
  if(!response.ok) throw new Error(path);
  return response.json();
}

async function loadData(){
  try{
    const categories = await api("/api/categories");
    const classes = await api("/api/classes");
    const ratings = {};
    for(const id of [1,2,3]){
      const rows = await api(`/api/ratings/groups/${id}`);
      ratings[id] = rows.length ? rows : FALLBACK.ratings[id];
    }
    state.categories = categories.length ? categories : FALLBACK.categories;
    state.classes = classes;
    state.ratings = ratings;
  }catch(error){
    console.warn("API недоступен или данных пока мало, использую демо.", error);
    state.categories = FALLBACK.categories;
    state.classes = [];
    state.ratings = FALLBACK.ratings;
  }
}

function rows(){
  if(state.groupId === "all"){
    return [1,2,3].flatMap(id => state.ratings[id] || []).sort((a,b)=>(b.total||0)-(a.total||0));
  }
  return state.ratings[state.groupId] || [];
}
function groupName(){
  if(state.groupId === "all") return "Все классы";
  return state.groupId === 1 ? "Начальная школа" : state.groupId === 2 ? "Средняя школа" : "Старшая школа";
}
function rankClass(i){ return i===0 ? "gold" : i===1 ? "silver" : i===2 ? "bronze" : ""; }

function directions(row){
  const base = Math.round(row.total || 0);
  return {
    study: clamp(base + 4 - (row.class_id % 6)),
    sport: clamp(base - 7 + (row.class_id % 9)),
    creative: clamp(base + 2 - (row.class_id % 5)),
    active: clamp(base - 3 + (row.class_id % 7))
  };
}
function clamp(value){ return Math.max(0, Math.min(100, Math.round(value))); }

function chipsHTML(row){
  const d = directions(row);
  return `
    <div class="direction-chips">
      <div class="chip"><span>Учёба</span><b>${d.study}</b></div>
      <div class="chip green"><span>Спорт</span><b>${d.sport}</b></div>
      <div class="chip orange"><span>Творчество</span><b>${d.creative}</b></div>
      <div class="chip blue"><span>Активность</span><b>${d.active}</b></div>
    </div>
  `;
}

function classRowHTML(row,index,withChips=true){
  const score = Math.round(row.total || 0);
  return `
    <article class="class-row" onclick="openClass(${index})">
      <div class="rank ${rankClass(index)}">${index+1}</div>
      <div>
        <h4>${row.class_name} класс</h4>
        <p>${row.students_count || 0} учеников · бонус +${Math.round(row.class_bonus || 0)}</p>
      </div>
      <div class="bar"><span style="width:${Math.min(100,score)}%"></span></div>
      <div class="score">${score}</div>
      ${withChips ? chipsHTML(row) : ""}
    </article>
  `;
}

function render(){
  const data = rows();
  const avg = data.length ? Math.round(data.reduce((sum,row)=>sum+(row.total||0),0)/data.length) : 0;

  document.getElementById("pageTitle").textContent = groupName();
  document.getElementById("leaderClass").textContent = data[0]?.class_name || "—";
  document.getElementById("classesCount").textContent = data.length;
  document.getElementById("avgScore").textContent = avg;

  document.getElementById("classCards").innerHTML = data.map((row,index)=>classRowHTML(row,index,true)).join("");
  renderTable(data);
  renderTop(data);
  renderCategories();
  renderMainChart(data);
  renderScreenPreview();
}

function renderTable(data){
  document.getElementById("classesTable").innerHTML = data.map((row,index)=>{
    const d = directions(row);
    return `
      <tr>
        <td><div class="rank ${rankClass(index)}">${index+1}</div></td>
        <td>${row.class_name} класс</td>
        <td>${d.study}</td>
        <td>${d.sport}</td>
        <td>${d.creative}</td>
        <td>${d.active}</td>
        <td class="score">${Math.round(row.total || 0)}</td>
        <td><button class="open-btn" onclick="openClass(${index})">Открыть</button></td>
      </tr>
    `;
  }).join("");
}

function renderTop(data){
  document.getElementById("topThree").innerHTML = data.slice(0,3).map((row,index)=>`
    <article class="top-card" onclick="openClass(${index})">
      <div class="rank ${rankClass(index)}">${index+1}</div>
      <h4>${row.class_name} класс</h4>
      <p>${row.students_count || 0} учеников</p>
      <strong>${Math.round(row.total || 0)}</strong>
    </article>
  `).join("");
}

function renderCategories(){
  document.getElementById("categoryMini").innerHTML = state.categories.map(cat=>`
    <div class="category-pill">
      <b>${cat.name}</b>
      <span>${cat.max_points || 100} баллов</span>
    </div>
  `).join("");

  const icons = ["⚛","⚽","🎨","🤝","★"];
  document.getElementById("categoryFull").innerHTML = state.categories.map((cat,index)=>`
    <article class="category-card">
      <div class="category-icon">${icons[index] || "★"}</div>
      <h4>${cat.name}</h4>
      <strong>${cat.max_points || 100}</strong>
      <ul>
        ${(cat.subcategories || []).map(sub=>`<li>${sub.name}${sub.max_points ? ` — до ${sub.max_points} б.` : ""}</li>`).join("") || "<li>Подкатегории настраиваются администратором</li>"}
      </ul>
    </article>
  `).join("");
}

function renderMainChart(data){
  const canvas = document.getElementById("ratingChart");
  if(state.ratingChart) state.ratingChart.destroy();

  state.ratingChart = new Chart(canvas,{
    type:"bar",
    data:{
      labels:data.map(row=>row.class_name),
      datasets:[{
        label:"Итоговый балл",
        data:data.map(row=>Math.round(row.total || 0)),
        borderRadius:10,
        maxBarThickness:42,
        backgroundColor:"rgba(91,53,245,0.82)"
      }]
    },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      resizeDelay:120,
      plugins:{
        legend:{display:false},
        tooltip:{backgroundColor:"#11182f",padding:12,titleFont:{weight:"800"},bodyFont:{weight:"700"}}
      },
      scales:{
        x:{grid:{display:false},ticks:{font:{weight:"800"}}},
        y:{beginAtZero:true,suggestedMax:100,grid:{color:"rgba(17,24,47,.08)"},ticks:{font:{weight:"700"}}}
      }
    }
  });
}

async function loadClassStudents(row){
  try{
    if(row.class_id){
      const list = await api(`/api/classes/${row.class_id}/students`);
      if(list && list.length) return list.map((student, index)=>({
        name: student.full_name,
        className: student.class_name || row.class_name,
        score: Math.max(40, Math.min(100, Math.round((row.total || 70) - index * 3 + (index % 2) * 4)))
      }));
    }
  }catch(error){
    console.warn("Не удалось загрузить учеников класса", error);
  }

  const names = FALLBACK_STUDENTS[row.class_name] || ["Ученик 1","Ученик 2","Ученик 3"];
  return names.map((name,index)=>({
    name,
    className: row.class_name,
    score: Math.max(40, Math.min(100, Math.round((row.total || 70) - index * 4 + (index % 2) * 3)))
  }));
}

function initials(name){
  return name.split(" ").map(x=>x[0]).slice(0,2).join("").toUpperCase();
}

function renderStudents(students){
  document.getElementById("studentsCountBadge").textContent = students.length;
  document.getElementById("studentsList").innerHTML = students.map((student,index)=>`
    <div class="student-item">
      <div class="student-avatar">${initials(student.name)}</div>
      <div>
        <b>${student.name}</b>
        <span>${student.className} класс · место ${index+1}</span>
      </div>
      <div class="student-score">${student.score}</div>
    </div>
  `).join("");
}

async function openClass(index){
  const row = rows()[index];
  if(!row) return;
  const d = directions(row);
  document.getElementById("studentsList").innerHTML = `<div class="student-item"><div class="student-avatar">…</div><div><b>Загрузка учеников</b><span>Получаем список из API</span></div><div class="student-score">—</div></div>`;
  document.getElementById("studentsCountBadge").textContent = "…";

  document.getElementById("modalTitle").textContent = `${row.class_name} класс`;
  document.getElementById("modalScore").textContent = Math.round(row.total || 0);
  document.getElementById("modalStudents").textContent = row.students_count || 0;
  document.getElementById("modalAverage").textContent = Math.round(row.average_students_score || 0);
  document.getElementById("modalBonus").textContent = Math.round(row.class_bonus || 0);

  document.getElementById("modalDirections").innerHTML = [
    ["Учёба и наука", d.study, ""],
    ["Спорт и здоровье", d.sport, "green"],
    ["Творчество и медиа", d.creative, "orange"],
    ["Активность и волонтёрство", d.active, "blue"]
  ].map(([name,value,cls])=>`
    <div class="direction-item">
      <div><span>${name}</span><b>${value}</b></div>
      <div class="bar ${cls}"><span style="width:${value}%"></span></div>
    </div>
  `).join("");

  const canvas = document.getElementById("modalChart");
  if(state.modalChart) state.modalChart.destroy();

  state.modalChart = new Chart(canvas,{
    type:"radar",
    data:{
      labels:["Учёба","Спорт","Творчество","Активность"],
      datasets:[{
        label:`${row.class_name} класс`,
        data:[d.study,d.sport,d.creative,d.active],
        borderColor:"rgba(91,53,245,.9)",
        backgroundColor:"rgba(91,53,245,.14)",
        pointBackgroundColor:"rgba(91,53,245,.95)"
      }]
    },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      scales:{r:{min:0,max:100,ticks:{stepSize:25}}},
      plugins:{legend:{display:false}}
    }
  });

  document.getElementById("classModal").classList.add("active");
  loadClassStudents(row).then(renderStudents);
  resetIdleTimer();
}

function switchPage(page){
  state.page = page;
  document.querySelectorAll(".page").forEach(el=>el.classList.remove("active"));
  document.getElementById(page).classList.add("active");
  document.querySelectorAll(".nav-link").forEach(btn=>btn.classList.toggle("active",btn.dataset.page===page));
  if(page === "screen") renderScreenPreview();
  resetIdleTimer();
}

function renderScreenPreview(){
  document.getElementById("previewLabel").textContent = groupName();
  document.getElementById("previewTitle").textContent = "Крупное отображение рейтинга";
  document.getElementById("previewContent").innerHTML = rows().slice(0,4).map((row,index)=>classRowHTML(row,index,true)).join("");
}

function idleSlideData(){
  const data = rows();
  return [
    {
      label:"Лидер рейтинга",
      title:data[0] ? `${data[0].class_name} класс` : "Пока нет данных",
      html:data[0] ? `<div class="idle-content">${classRowHTML(data[0],0,true)}</div>` : ""
    },
    {
      label:groupName(),
      title:"Топ классов",
      html:`<div class="idle-content">${data.slice(0,4).map((row,index)=>classRowHTML(row,index,false)).join("")}</div>`
    },
    {
      label:"Категории рейтинга",
      title:"Система оценки",
      html:`<div class="idle-content">${state.categories.slice(0,4).map(cat=>`<div class="category-pill"><b>${cat.name}</b><span>${cat.max_points || 100} баллов</span></div>`).join("")}</div>`
    }
  ];
}

function renderIdleSlide(){
  const slides = idleSlideData();
  const slide = slides[state.idleSlideIndex % slides.length];
  document.getElementById("idleLabel").textContent = slide.label;
  document.getElementById("idleTitle").textContent = slide.title;
  document.getElementById("idleContent").innerHTML = slide.html;
}

function startIdleMode(){
  if(document.getElementById("classModal").classList.contains("active")) return;
  state.idleEnabled = true;
  state.idleElapsed = 0;
  state.idleSlideIndex = 0;
  renderIdleSlide();
  document.getElementById("idleOverlay").classList.add("active");

  clearInterval(state.idleTimer);
  state.idleTimer = setInterval(()=>{
    state.idleElapsed += 0.1;
    document.getElementById("idleProgress").style.width = `${Math.min(100,state.idleElapsed/7*100)}%`;
    if(state.idleElapsed >= 7){
      state.idleElapsed = 0;
      state.idleSlideIndex++;
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
  state.idleTimeout = setTimeout(startIdleMode,10000);
}

["mousemove","mousedown","keydown","touchstart","scroll"].forEach(eventName=>{
  window.addEventListener(eventName,()=>{
    if(state.idleEnabled) stopIdleMode();
    else resetIdleTimer();
  },{passive:true});
});

document.querySelectorAll(".nav-link").forEach(btn=>btn.addEventListener("click",()=>switchPage(btn.dataset.page)));

document.getElementById("groupSelect").addEventListener("change",event=>{
  state.groupId = event.target.value === "all" ? "all" : Number(event.target.value);
  render();
  resetIdleTimer();
});

document.getElementById("refreshBtn").addEventListener("click",async()=>{
  await loadData();
  render();
  resetIdleTimer();
});

document.getElementById("screenBtn").addEventListener("click",()=>switchPage("screen"));
document.getElementById("exitIdle").addEventListener("click",stopIdleMode);
document.getElementById("closeModal").addEventListener("click",()=>{
  document.getElementById("classModal").classList.remove("active");
  resetIdleTimer();
});
document.getElementById("classModal").addEventListener("click",event=>{
  if(event.target.id === "classModal"){
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
});
