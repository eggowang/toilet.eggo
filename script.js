const STORAGE_KEY = "toilet-tracker-records-v1";
const state = {
  records: loadRecords(),
  selectedDate: toDateKey(new Date()),
  calendarDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  type: "bowel",
  condition: "正常",
  feeling: "一般",
  trendRange: 7,
};

let deferredInstallPrompt = null;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function loadRecords() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(value)) return [];
    return value.map(sanitizeRecord).filter(Boolean);
  } catch { return []; }
}

function saveRecords() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.records));
    return true;
  } catch {
    showToast("保存失败，请先导出备份并检查浏览器空间");
    return false;
  }
}

function sanitizeRecord(value) {
  if (!value || typeof value !== "object") return null;
  const type = value.type === "urine" ? "urine" : value.type === "bowel" ? "bowel" : null;
  const date = typeof value.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.date) ? value.date : null;
  const time = typeof value.time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value.time) ? value.time : null;
  if (!type || !date || !time || Number.isNaN(fromDateKey(date).getTime())) return null;
  const conditions = ["偏硬", "正常", "偏软", "水样"];
  const feelings = ["顺畅", "一般", "费力"];
  const rawId = typeof value.id === "string" ? value.id : "";
  return {
    id: /^[a-zA-Z0-9-]{1,80}$/.test(rawId) ? rawId : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type,
    condition: type === "bowel" && conditions.includes(value.condition) ? value.condition : type === "bowel" ? "正常" : "",
    feeling: feelings.includes(value.feeling) ? value.feeling : "一般",
    date,
    time,
    note: typeof value.note === "string" ? value.note.trim().slice(0, 80) : "",
  };
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function fromDateKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDate(key, includeYear = false) {
  const date = fromDateKey(key);
  return new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", ...(includeYear ? { year: "numeric" } : {}) }).format(date);
}

function isToday(key) { return key === toDateKey(new Date()); }

function recordsForDate(key) {
  return state.records.filter((record) => record.date === key).sort((a, b) => b.time.localeCompare(a.time));
}

function renderDateStrip() {
  const center = fromDateKey(state.selectedDate);
  const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
  const html = [];
  for (let offset = -3; offset <= 3; offset += 1) {
    const date = new Date(center);
    date.setDate(center.getDate() + offset);
    const key = toDateKey(date);
    const classes = ["date-chip", key === state.selectedDate ? "is-selected" : "", recordsForDate(key).length ? "has-data" : ""].filter(Boolean).join(" ");
    html.push(`<button class="${classes}" data-date="${key}"><span>${isToday(key) ? "今天" : `周${weekdays[date.getDay()]}`}</span><strong>${date.getDate()}</strong></button>`);
  }
  $("#dateStrip").innerHTML = html.join("");
}

function renderRecordCard(record, showDate = false) {
  const title = record.type === "bowel" ? `排便 · ${record.condition || "未选择"}` : "仅小便";
  const details = [record.feeling, record.note].filter(Boolean).join(" · ") || "无备注";
  return `<article class="record-card ${record.type}">
    <div class="record-symbol">${record.type === "bowel" ? "☻" : "♢"}</div>
    <div class="record-info"><strong>${escapeHtml(title)}</strong><p>${showDate ? `${escapeHtml(formatDate(record.date))} · ` : ""}${escapeHtml(details)}</p></div>
    <div class="record-side"><time>${escapeHtml(record.time)}</time><button class="record-menu" data-edit="${escapeHtml(record.id)}" aria-label="编辑这条记录">•••</button></div>
  </article>`;
}

function renderToday() {
  const records = recordsForDate(state.selectedDate);
  const bowelCount = records.filter((record) => record.type === "bowel").length;
  $("#heroDate").textContent = isToday(state.selectedDate) ? "今日记录" : formatDate(state.selectedDate);
  $("#todayCount").textContent = records.length;
  $("#heroMessage").textContent = records.length ? (bowelCount ? `有 ${bowelCount} 次排便记录` : "今天记录得很完整") : "今天还没有记录";
  $("#lastTime").textContent = records[0]?.time || "—";
  $("#bowelStatus").textContent = bowelCount ? `${bowelCount} 次` : "未记录";
  $("#timelineTitle").textContent = isToday(state.selectedDate) ? "今天" : formatDate(state.selectedDate);
  $("#emptyState").hidden = records.length > 0;
  $("#recordList").innerHTML = records.map((record) => renderRecordCard(record)).join("");
  $("#jumpToday").classList.toggle("is-visible", !isToday(state.selectedDate));
  renderDateStrip();
}

function renderCalendar() {
  const year = state.calendarDate.getFullYear();
  const month = state.calendarDate.getMonth();
  $("#calendarMonth").textContent = `${year}年 ${month + 1}月`;
  const prefix = `${year}-${String(month + 1).padStart(2, "0")}`;
  const monthRecords = state.records.filter((record) => record.date.startsWith(prefix));
  $("#monthTotal").textContent = monthRecords.length;
  $("#monthBowel").textContent = monthRecords.filter((record) => record.type === "bowel").length;
  $("#activeDays").textContent = new Set(monthRecords.map((record) => record.date)).size;

  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7;
  const gridStart = new Date(year, month, 1 - startOffset);
  const days = [];
  for (let index = 0; index < 42; index += 1) {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    const key = toDateKey(date);
    const dayRecords = recordsForDate(key);
    const classes = ["calendar-day", date.getMonth() !== month ? "muted" : "", isToday(key) ? "is-today" : "", dayRecords.some((record) => record.type === "bowel") ? "has-bowel" : "", dayRecords.some((record) => record.type === "urine") ? "has-urine" : ""].filter(Boolean).join(" ");
    days.push(`<button class="${classes}" data-calendar-date="${key}">${date.getDate()}</button>`);
  }
  $("#calendarGrid").innerHTML = days.join("");
}

function renderHistory() {
  renderCalendar();
  renderTrends();
  const recent = [...state.records].sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`)).slice(0, 8);
  $("#recentList").innerHTML = recent.length ? recent.map((record) => renderRecordCard(record, true)).join("") : '<div class="empty-state"><h3>暂无历史记录</h3><p>你的记录会按时间显示在这里。</p></div>';
}

function renderTrends() {
  const range = state.trendRange;
  const today = new Date();
  const daily = [];
  for (let offset = range - 1; offset >= 0; offset -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - offset);
    const key = toDateKey(date);
    daily.push({ key, date, records: recordsForDate(key) });
  }
  const maximum = Math.max(1, ...daily.map((day) => day.records.length));
  $("#trendBars").classList.toggle("is-compact", range === 30);
  $("#trendBars").innerHTML = daily.map((day) => {
    const count = day.records.length;
    const height = count ? Math.max(12, Math.round((count / maximum) * 100)) : 7;
    const label = range === 7 ? `${day.date.getMonth() + 1}/${day.date.getDate()}` : String(day.date.getDate());
    return `<div class="trend-bar-wrap ${isToday(day.key) ? "is-today" : ""}" title="${formatDate(day.key)}：${count}次"><span class="trend-bar ${count ? "has-data" : ""}" style="height:${height}%"></span><small>${label}</small></div>`;
  }).join("");
  const all = daily.flatMap((day) => day.records);
  const bowel = all.filter((record) => record.type === "bowel");
  const conditionCounts = bowel.reduce((counts, record) => ({ ...counts, [record.condition]: (counts[record.condition] || 0) + 1 }), {});
  const commonCondition = Object.entries(conditionCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";
  $("#trendAverage").textContent = (all.length / range).toFixed(1);
  $("#trendBowel").textContent = bowel.length;
  $("#trendCondition").textContent = commonCondition;
}

function renderAll() {
  renderToday();
  renderHistory();
  updateRepeatHint();
}

function openSheet(sheet) {
  $("#backdrop").classList.add("is-open");
  sheet.classList.add("is-open");
  document.body.style.overflow = "hidden";
}

function closeSheets() {
  $("#backdrop").classList.remove("is-open");
  $$(".sheet").forEach((sheet) => sheet.classList.remove("is-open"));
  document.body.style.overflow = "";
}

function selectButton(group, button) {
  group.querySelectorAll("button").forEach((item) => item.classList.remove("is-selected"));
  button.classList.add("is-selected");
}

function resetForm() {
  const now = new Date();
  state.type = "bowel";
  state.condition = "正常";
  state.feeling = "一般";
  $("#recordId").value = "";
  $("#recordDate").value = isToday(state.selectedDate) ? toDateKey(now) : state.selectedDate;
  $("#recordDate").max = toDateKey(now);
  $("#recordTime").value = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  $("#recordNote").value = "";
  $("#sheetTitle").textContent = "记一次如厕";
  $("#saveButton").textContent = "保存记录";
  $("#deleteRecord").hidden = true;
  $$("[data-type]").forEach((item) => item.classList.toggle("is-selected", item.dataset.type === state.type));
  $$("[data-condition]").forEach((item) => item.classList.toggle("is-selected", item.dataset.condition === state.condition));
  $$("[data-feeling]").forEach((item) => item.classList.toggle("is-selected", item.dataset.feeling === state.feeling));
  $("#bowelFields").hidden = false;
}

function addQuickRecord(kind) {
  const now = new Date();
  const latest = [...state.records].sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`))[0];
  const base = kind === "repeat" && latest ? latest : { type: kind === "urine" ? "urine" : "bowel", condition: "正常", feeling: "一般" };
  const record = sanitizeRecord({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type: base.type,
    condition: base.condition,
    feeling: base.feeling,
    date: toDateKey(now),
    time: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
    note: "",
  });
  if (!record) return;
  state.records.push(record);
  if (!saveRecords()) { state.records.pop(); return; }
  state.selectedDate = record.date;
  renderAll();
  showToast(kind === "repeat" ? "已按上次记录 ✓" : "已记录一次小便 ✓");
}

function updateRepeatHint() {
  const latest = [...state.records].sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`))[0];
  $("#repeatHint").textContent = latest ? (latest.type === "bowel" ? `排便 · ${latest.condition}` : "仅小便") : "排便 · 正常";
}

function editRecord(id) {
  const record = state.records.find((item) => item.id === id);
  if (!record) return;
  state.type = record.type;
  state.condition = record.condition || "正常";
  state.feeling = record.feeling || "一般";
  $("#recordId").value = record.id;
  $("#recordDate").value = record.date;
  $("#recordTime").value = record.time;
  $("#recordNote").value = record.note || "";
  $("#sheetTitle").textContent = "编辑记录";
  $("#saveButton").textContent = "更新记录";
  $("#deleteRecord").hidden = false;
  $$("[data-type]").forEach((item) => item.classList.toggle("is-selected", item.dataset.type === state.type));
  $$("[data-condition]").forEach((item) => item.classList.toggle("is-selected", item.dataset.condition === state.condition));
  $$("[data-feeling]").forEach((item) => item.classList.toggle("is-selected", item.dataset.feeling === state.feeling));
  $("#bowelFields").hidden = state.type !== "bowel";
  openSheet($("#recordSheet"));
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("is-visible"), 2200);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}

$("#addRecord").addEventListener("click", () => { resetForm(); openSheet($("#recordSheet")); });
$("#repeatLast").addEventListener("click", () => addQuickRecord("repeat"));
$("#quickUrine").addEventListener("click", () => addQuickRecord("urine"));
$("#openSettings").addEventListener("click", () => openSheet($("#settingsSheet")));
$("#backdrop").addEventListener("click", closeSheets);
$$("[data-close]").forEach((button) => button.addEventListener("click", closeSheets));
document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeSheets(); });

$$(".nav-item").forEach((button) => button.addEventListener("click", () => {
  $$(".nav-item").forEach((item) => item.classList.remove("is-active"));
  button.classList.add("is-active");
  $$(".view").forEach((view) => view.classList.toggle("is-active", view.id === button.dataset.view));
  if (button.dataset.view === "historyView") renderHistory();
  window.scrollTo({ top: 0, behavior: "smooth" });
}));

$("#dateStrip").addEventListener("click", (event) => {
  const button = event.target.closest("[data-date]");
  if (!button) return;
  state.selectedDate = button.dataset.date;
  renderToday();
});

$("#jumpToday").addEventListener("click", () => { state.selectedDate = toDateKey(new Date()); renderToday(); });

$("#calendarGrid").addEventListener("click", (event) => {
  const button = event.target.closest("[data-calendar-date]");
  if (!button) return;
  state.selectedDate = button.dataset.calendarDate;
  $("#todayTab").click();
});

$("#prevMonth").addEventListener("click", () => { state.calendarDate.setMonth(state.calendarDate.getMonth() - 1); renderCalendar(); });
$("#nextMonth").addEventListener("click", () => { state.calendarDate.setMonth(state.calendarDate.getMonth() + 1); renderCalendar(); });

$$("[data-range]").forEach((button) => button.addEventListener("click", () => {
  $$("[data-range]").forEach((item) => item.classList.remove("is-selected"));
  button.classList.add("is-selected");
  state.trendRange = Number(button.dataset.range);
  renderTrends();
}));

$(".type-segment").addEventListener("click", (event) => {
  const button = event.target.closest("[data-type]");
  if (!button) return;
  selectButton(event.currentTarget, button);
  state.type = button.dataset.type;
  $("#bowelFields").hidden = state.type !== "bowel";
});

$("#conditionGrid").addEventListener("click", (event) => {
  const button = event.target.closest("[data-condition]");
  if (!button) return;
  selectButton(event.currentTarget, button);
  state.condition = button.dataset.condition;
});

$("#feelingRow").addEventListener("click", (event) => {
  const button = event.target.closest("[data-feeling]");
  if (!button) return;
  selectButton(event.currentTarget, button);
  state.feeling = button.dataset.feeling;
});

$("#recordForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const id = $("#recordId").value;
  const record = sanitizeRecord({
    id: id || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type: state.type,
    condition: state.type === "bowel" ? state.condition : "",
    feeling: state.feeling,
    date: $("#recordDate").value,
    time: $("#recordTime").value,
    note: $("#recordNote").value.trim(),
  });
  if (!record) { showToast("日期或时间格式不正确"); return; }
  const previousRecords = [...state.records];
  if (id) state.records = state.records.map((item) => item.id === id ? record : item);
  else state.records.push(record);
  if (!saveRecords()) { state.records = previousRecords; return; }
  state.selectedDate = record.date;
  closeSheets();
  renderAll();
  showToast(id ? "记录已更新" : "记录好了 ✓");
});

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-edit]");
  if (!button) return;
  editRecord(button.dataset.edit);
});

$("#deleteRecord").addEventListener("click", () => {
  const id = $("#recordId").value;
  if (!id || !window.confirm("确定删除这条记录吗？")) return;
  const previousRecords = [...state.records];
  state.records = state.records.filter((item) => item.id !== id);
  if (!saveRecords()) { state.records = previousRecords; return; }
  closeSheets();
  renderAll();
  showToast("记录已删除");
});

$("#exportData").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), records: state.records }, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `便便日记备份-${toDateKey(new Date())}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
  showToast("备份已导出");
});

$("#importData").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 1024 * 1024) throw new Error("too-large");
    const data = JSON.parse(await file.text());
    const records = Array.isArray(data) ? data : data.records;
    if (!Array.isArray(records) || records.length > 5000) throw new Error("invalid");
    const sanitized = records.map(sanitizeRecord);
    if (sanitized.some((record) => !record)) throw new Error("invalid-record");
    const unique = [...new Map(sanitized.map((record) => [record.id, record])).values()];
    if (!window.confirm(`已验证 ${unique.length} 条记录。导入后将替换当前数据，继续吗？`)) return;
    const previousRecords = [...state.records];
    state.records = unique;
    if (!saveRecords()) { state.records = previousRecords; return; }
    closeSheets();
    renderAll();
    showToast("备份已恢复");
  } catch { window.alert("这个备份文件无法识别，请选择由本网页导出的 JSON 文件。"); }
  event.target.value = "";
});

$("#clearData").addEventListener("click", () => {
  if (!state.records.length) { showToast("现在没有记录"); return; }
  if (!window.confirm(`确定清空全部 ${state.records.length} 条记录吗？此操作无法撤销。`)) return;
  const previousRecords = [...state.records];
  state.records = [];
  if (!saveRecords()) { state.records = previousRecords; return; }
  closeSheets();
  renderAll();
  showToast("全部记录已清空");
});

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  $("#installHint").textContent = "点击即可安装并离线使用";
});

$("#installApp").addEventListener("click", async () => {
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  if (isStandalone) { showToast("已经安装到桌面了"); return; }
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    return;
  }
  window.alert("iPhone：点浏览器底部的分享按钮，再选“添加到主屏幕”。\nAndroid：打开浏览器菜单，选择“添加到主屏幕”或“安装应用”。");
});

window.addEventListener("appinstalled", () => {
  $("#installHint").textContent = "已安装，可离线打开";
  showToast("已添加到手机桌面 ✓");
});

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}

$("#todayEyebrow").textContent = new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "long" }).format(new Date());
renderAll();
