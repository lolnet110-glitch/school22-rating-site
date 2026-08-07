const API_BASE = new URLSearchParams(window.location.search).get("api")
  || "https://school22-rating-api.onrender.com";
const SLIDE_SECONDS = 10;
const IDLE_AFTER_MS = 60000;

const state = {
  groupId: 2,
  meta: null,
  classes: [],
  directions: [],
  allRating: [],
  currentRows: [],
  ratingChart: null,
  modalChart: null,
  screenTimer: null,
  screenIndex: 0,
  screenElapsed: 0,
  idleTimeout: null,
  idleTimer: null,
  idleIndex: 0,
  idleElapsed: 0
};

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

async function api(path) {
  const response = await fetch(API_BASE + path);
  if (!response.ok) throw new Error("Ошибка API: " + response.status);
  return response.json();
}

function toast(message) {
  const element = document.getElementById("toast");
  element.textContent = message;
  element.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(function () { element.classList.remove("show"); }, 2300);
}

function round(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

async function loadData() {
  const data = await Promise.all([
    api("/api/meta"),
    api("/api/classes"),
    api("/api/directions"),
    api("/api/ratings/classes")
  ]);
  state.meta = data[0];
  state.classes = data[1];
  state.directions = data[2];
  state.allRating = data[3];
}

function rows() {
  if (state.groupId === "all") return state.allRating;
  return state.allRating.filter(function (row) {
    return row.group_id === state.groupId;
  });
}

function groupName() {
  if (state.groupId === "all") return "Все классы";
  if (state.groupId === 1) return "Начальная школа";
  if (state.groupId === 2) return "Средняя школа";
  return "Старшая школа";
}

function rankClass(index) {
  if (index === 0) return "first";
  if (index === 1) return "second";
  if (index === 2) return "third";
  return "";
}

function classRowHTML(row, index, compact) {
  const total = round(row.total);
  return '<article class="class-row" onclick="openClass(' + row.class_id + ')">' +
    '<div class="rank ' + rankClass(index) + '">' + (index + 1) + '</div>' +
    '<div><h4>' + escapeHtml(row.class_name) + ' класс</h4>' +
    '<p>' + Number(row.students_count || 0) + ' учеников · заполнено ' +
    round(row.progress_percent) + '%</p></div>' +
    (compact ? "" : '<div class="bar"><span style="width:' + Math.min(100, total) + '%"></span></div>') +
    '<div class="score">' + total + '</div></article>';
}

function render() {
  state.currentRows = rows();
  const data = state.currentRows;
  const average = data.length
    ? round(data.reduce(function (sum, row) { return sum + Number(row.total || 0); }, 0) / data.length)
    : 0;
  const students = data.reduce(function (sum, row) {
    return sum + Number(row.students_count || 0);
  }, 0);

  document.getElementById("pageTitle").textContent = groupName();
  document.getElementById("leaderClass").textContent = data[0] ? data[0].class_name : "—";
  document.getElementById("classesCount").textContent = data.length;
  document.getElementById("avgScore").textContent = average;
  document.getElementById("studentsTotal").textContent = students;
  document.getElementById("classCards").innerHTML = data.map(function (row, index) {
    return classRowHTML(row, index, false);
  }).join("");

  renderChart(data);
  renderLeaderDirections(data[0]);
  renderTable(data);
  renderProgress(data);
  renderDirectionLeaders(data);
  renderMatrix();
  renderScreenSlide();
}

function renderChart(data) {
  const canvas = document.getElementById("ratingChart");
  if (state.ratingChart) state.ratingChart.destroy();
  state.ratingChart = new Chart(canvas, {
    type: "bar",
    data: {
      labels: data.map(function (row) { return row.class_name; }),
      datasets: [{
        data: data.map(function (row) { return round(row.total); }),
        borderRadius: 12,
        maxBarThickness: 44,
        backgroundColor: "rgba(55,102,205,.84)"
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {legend: {display: false}},
      scales: {
        x: {grid: {display: false}, ticks: {font: {weight: "800"}}},
        y: {beginAtZero: true, max: 100, grid: {color: "rgba(17,24,47,.08)"}}
      }
    }
  });
}

function renderLeaderDirections(row) {
  const box = document.getElementById("leaderCategories");
  if (!row) {
    box.innerHTML = "";
    return;
  }
  box.innerHTML = (row.directions || []).map(function (direction) {
    return '<div class="category-pill"><b>' + escapeHtml(direction.name) +
      '<span>' + (direction.points == null ? "N/A" : round(direction.points)) +
      '</span></b><small>' + direction.completed_criteria +
      ' из ' + direction.applicable_criteria + ' критериев</small></div>';
  }).join("");
}

function renderTable(data) {
  document.getElementById("classesTableHead").innerHTML =
    '<tr><th>Место</th><th>Класс</th><th>Ученики</th>' +
    state.directions.map(function (direction) {
      return '<th>' + escapeHtml(direction.name.replace("Самый ", "")) + '</th>';
    }).join("") + '<th>Итог</th></tr>';

  document.getElementById("classesTable").innerHTML = data.map(function (row, index) {
    return '<tr onclick="openClass(' + row.class_id + ')">' +
      '<td><div class="rank ' + rankClass(index) + '">' + (index + 1) + '</div></td>' +
      '<td>' + escapeHtml(row.class_name) + ' класс</td>' +
      '<td>' + Number(row.students_count || 0) + '</td>' +
      (row.directions || []).map(function (direction) {
        return '<td>' + (direction.points == null ? "N/A" : round(direction.points)) + '</td>';
      }).join("") +
      '<td class="score">' + round(row.total) + '</td></tr>';
  }).join("");
}

function renderProgress(data) {
  const sorted = data.slice().sort(function (a, b) {
    return Number(b.progress_percent || 0) - Number(a.progress_percent || 0);
  });
  document.getElementById("progressMini").innerHTML = sorted.slice(0, 5).map(function (row, index) {
    return '<button class="mini-row" onclick="openClass(' + row.class_id + ')">' +
      '<span>' + (index + 1) + '. ' + escapeHtml(row.class_name) + '</span>' +
      '<b>' + round(row.progress_percent) + '%</b></button>';
  }).join("");
}

function directionScore(row, number) {
  const direction = (row.directions || []).find(function (item) {
    return item.number === number;
  });
  return direction && direction.points != null ? Number(direction.points) : -1;
}

function renderDirectionLeaders(data) {
  document.getElementById("directionsBoard").innerHTML = state.directions.map(function (direction) {
    const sorted = data.slice().sort(function (a, b) {
      return directionScore(b, direction.number) - directionScore(a, direction.number);
    });
    const leader = sorted[0];
    const points = leader ? directionScore(leader, direction.number) : -1;
    return '<article class="uniform-card checked"' +
      (leader ? ' onclick="openClass(' + leader.class_id + ')"' : "") + '>' +
      '<h4>' + escapeHtml(direction.name) + '</h4>' +
      '<strong>' + (points < 0 ? "—" : round(points)) + '</strong>' +
      '<p>' + (leader ? escapeHtml(leader.class_name) + ' класс' : "Нет данных") + '</p>' +
      '<p>максимум 100 баллов</p></article>';
  }).join("");
}

function renderMatrix() {
  document.getElementById("categoryFull").innerHTML = state.directions.map(function (direction) {
    return '<article class="category-card"><h4>' + escapeHtml(direction.name) +
      '</h4><strong>100</strong><p>10 критериев</p><div class="sub-list">' +
      direction.criteria.map(function (criterion) {
        return '<div class="sub-item"><span>' + escapeHtml(criterion.code + " · " + criterion.name) +
          '<small>' + escapeHtml(criterion.formula_code + " · цель " +
          criterion.target + " " + criterion.unit) + '</small></span><b>10</b></div>';
      }).join("") + '</div></article>';
  }).join("");
}

async function openClass(classId) {
  stopIdleMode(false);
  const details = await api("/api/classes/" + classId + "/details");
  const row = details.class;
  const directions = row.directions || [];
  document.getElementById("modalTitle").textContent = row.class_name + " класс";
  document.getElementById("modalScore").textContent = round(row.total);
  document.getElementById("modalStudents").textContent = row.students_count || 0;
  document.getElementById("modalCompleted").textContent =
    row.completed_criteria + " из " + row.applicable_criteria;
  document.getElementById("modalProgress").textContent = round(row.progress_percent) + "%";

  document.getElementById("modalCategories").innerHTML = directions.map(function (direction) {
    return '<section class="direction-item"><div class="direction-top"><span>' +
      escapeHtml(direction.name) + '</span><b>' +
      (direction.points == null ? "N/A" : round(direction.points)) + '</b></div>' +
      '<div class="bar"><span style="width:' +
      (direction.points == null ? 0 : Math.min(100, Number(direction.points))) +
      '%"></span></div><div class="subcategory-list">' +
      (direction.criteria || []).map(function (criterion) {
        return '<div class="subcategory-row"><span>' +
          escapeHtml(criterion.code + " · " + criterion.name) + '</span><b>' +
          (criterion.points == null ? "N/A" : round(criterion.points) + " / 10") +
          '</b></div>';
      }).join("") + '</div></section>';
  }).join("");

  const checks = row.responsibility_checks || details.responsibility_checks || [];
  document.getElementById("modalResponsibilityHistory").innerHTML = checks.map(function (check) {
    return '<article class="history-item"><div><h4>' + escapeHtml(check.check_date) +
      '</h4><p>Присутствовали: ' + check.present_count + ' · форма: ' +
      check.uniform_violations + ' наруш. · обувь: ' + check.shoes_violations +
      ' наруш.</p></div></article>';
  }).join("") || '<p class="empty">Срезов пока нет</p>';

  const canvas = document.getElementById("modalChart");
  if (state.modalChart) state.modalChart.destroy();
  state.modalChart = new Chart(canvas, {
    type: "radar",
    data: {
      labels: directions.map(function (direction) {
        return direction.name.replace("Самый ", "");
      }),
      datasets: [{
        data: directions.map(function (direction) { return round(direction.points); }),
        borderColor: "rgba(55,102,205,.95)",
        backgroundColor: "rgba(55,102,205,.14)",
        pointBackgroundColor: "rgba(55,102,205,.95)"
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {legend: {display: false}},
      scales: {r: {beginAtZero: true, max: 100}}
    }
  });
  document.getElementById("classModal").classList.add("open");
}

function switchPage(page) {
  document.querySelectorAll(".page").forEach(function (element) {
    element.classList.toggle("active", element.id === page);
  });
  document.querySelectorAll(".nav-link").forEach(function (button) {
    button.classList.toggle("active", button.dataset.page === page);
  });
  if (page === "screen") startScreenMode();
  else stopScreenMode();
}

function screenSlides() {
  const data = state.currentRows;
  const slides = [{
    label: "Общий рейтинг",
    title: groupName(),
    html: data.slice(0, 6).map(function (row, index) {
      return classRowHTML(row, index, true);
    }).join("")
  }];
  state.directions.forEach(function (direction) {
    const sorted = data.slice().sort(function (a, b) {
      return directionScore(b, direction.number) - directionScore(a, direction.number);
    });
    slides.push({
      label: "Номинация",
      title: direction.name,
      html: sorted.slice(0, 6).map(function (row, index) {
        const copy = Object.assign({}, row, {total: Math.max(0, directionScore(row, direction.number))});
        return classRowHTML(copy, index, true);
      }).join("")
    });
  });
  return slides;
}

function drawSlide(labelId, titleId, contentId, progressId, index, elapsed) {
  const slides = screenSlides();
  if (!slides.length) return;
  const slide = slides[index % slides.length];
  document.getElementById(labelId).textContent = slide.label;
  document.getElementById(titleId).textContent = slide.title;
  document.getElementById(contentId).innerHTML = slide.html;
  document.getElementById(progressId).style.width = (elapsed / SLIDE_SECONDS * 100) + "%";
}

function renderScreenSlide() {
  drawSlide("screenLabel", "screenTitle", "screenContent", "screenProgress", state.screenIndex, state.screenElapsed);
}

function startScreenMode() {
  stopScreenMode();
  state.screenIndex = 0;
  state.screenElapsed = 0;
  renderScreenSlide();
  state.screenTimer = setInterval(function () {
    state.screenElapsed += 1;
    if (state.screenElapsed >= SLIDE_SECONDS) {
      state.screenElapsed = 0;
      state.screenIndex += 1;
    }
    renderScreenSlide();
  }, 1000);
}

function stopScreenMode() {
  clearInterval(state.screenTimer);
  state.screenTimer = null;
}

function renderIdleSlide() {
  drawSlide("idleLabel", "idleTitle", "idleContent", "idleProgress", state.idleIndex, state.idleElapsed);
}

function startIdleMode() {
  if (document.getElementById("classModal").classList.contains("open")) return;
  document.getElementById("idleOverlay").classList.add("open");
  state.idleIndex = 0;
  state.idleElapsed = 0;
  renderIdleSlide();
  clearInterval(state.idleTimer);
  state.idleTimer = setInterval(function () {
    state.idleElapsed += 1;
    if (state.idleElapsed >= SLIDE_SECONDS) {
      state.idleElapsed = 0;
      state.idleIndex += 1;
    }
    renderIdleSlide();
  }, 1000);
}

function stopIdleMode(reset) {
  document.getElementById("idleOverlay").classList.remove("open");
  clearInterval(state.idleTimer);
  state.idleTimer = null;
  if (reset !== false) resetIdleTimer();
}

function resetIdleTimer() {
  clearTimeout(state.idleTimeout);
  if (!document.getElementById("idleOverlay").classList.contains("open")) {
    state.idleTimeout = setTimeout(startIdleMode, IDLE_AFTER_MS);
  }
}

window.openClass = openClass;

document.querySelectorAll(".nav-link").forEach(function (button) {
  button.addEventListener("click", function () { switchPage(button.dataset.page); });
});
document.getElementById("groupSelect").addEventListener("change", function (event) {
  state.groupId = event.target.value === "all" ? "all" : Number(event.target.value);
  render();
});
document.getElementById("refreshBtn").addEventListener("click", async function () {
  try {
    await loadData();
    render();
    toast("Данные обновлены");
  } catch (error) {
    toast(error.message);
  }
});
document.getElementById("closeModal").addEventListener("click", function () {
  document.getElementById("classModal").classList.remove("open");
  resetIdleTimer();
});
document.getElementById("classModal").addEventListener("click", function (event) {
  if (event.target.id === "classModal") {
    document.getElementById("classModal").classList.remove("open");
    resetIdleTimer();
  }
});
document.getElementById("exitIdle").addEventListener("click", function () { stopIdleMode(true); });
["mousemove", "mousedown", "keydown", "touchstart", "scroll"].forEach(function (eventName) {
  document.addEventListener(eventName, resetIdleTimer, {passive: true});
});

loadData().then(function () {
  render();
  resetIdleTimer();
}).catch(function (error) {
  console.error(error);
  toast("Не удалось загрузить рейтинг");
});
