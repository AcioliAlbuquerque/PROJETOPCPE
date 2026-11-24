/* =======================================================================
   OPERAÇÃO PCPE — calendário e missões do ciclo pós-edital
   ======================================================================= */
import { $, $$, esc, uid, todayISO, addDaysISO, diffDaysISO, fmtDMY, parseISO, toISO, weekdayIndex, fmtDur, discMeta, DISCIPLINES, EXAM_ISO } from "./config.js";
import { S, save, onChange } from "./store.js";
import { CURRICULUM, ESSAY_THEMES, buildInitialSchedule, curriculumMeta } from "./study-plan.js";

const examEve = () => addDaysISO(EXAM_ISO, -1);
let weekAnchor = todayISO();
let priorityFilter = "all";
let searchText = "";
let ready = false;

function calendarState() {
  if (!S.progress.calendar || typeof S.progress.calendar !== "object") S.progress.calendar = { initialized: false, events: [] };
  if (!Array.isArray(S.progress.calendar.events)) S.progress.calendar.events = [];
  return S.progress.calendar;
}

function mondayOf(iso) {
  return addDaysISO(iso, -weekdayIndex(parseISO(iso)));
}

function latestCycleDate(events) {
  return events.filter(event => event.phase === "cycle").map(event => event.date).sort().at(-1) || todayISO();
}

function questionEvent(date, sequence, previous = [], questionGoal = 100) {
  const labels = [...new Set(previous.flatMap(event => (event.blocks || []).filter(block => block.topicId).map(block => discMeta(block.disc).short)))].slice(0, 3);
  const isSaturday = weekdayIndex(parseISO(date)) === 5;
  return {
    id: uid(), date, kind: "questions", phase: "questions",
    title: isSaturday ? `Simulado pós-ciclo · ${questionGoal} questões` : `Pós-ciclo · ${questionGoal} questões + correção${labels.length ? " · " + labels.join(" / ") : ""}`,
    blocks: [], minutes: S.progress.contestSettings?.dailyGoalMin || 180, questionTarget: questionGoal, p1Target: Math.round(questionGoal / 3), p2Target: questionGoal - Math.round(questionGoal / 3),
    questionsDone: false, done: false, sequence,
  };
}

function refreshQuestionMissions({ saveChanges = false } = {}) {
  const calendar = calendarState();
  const questionGoal = S.progress.contestSettings?.questionGoal || 100;
  const events = calendar.events;
  const cycle = events.filter(event => event.phase === "cycle");
  const completed = cycle.length > 0 && cycle.every(event => event.done);
  const plannedEnd = latestCycleDate(events);
  if (completed) calendar.cycleCompletedAt = [calendar.cycleCompletedAt || todayISO(), plannedEnd].sort().at(-1);
  if (!completed && calendar.cycleCompletedAt) calendar.cycleCompletedAt = null;

  const end = calendar.cycleCompletedAt || plannedEnd;
  calendar.cycleEndPlanned = plannedEnd;
  const from = addDaysISO(end, 1);
  const preserved = new Map(events.filter(event => event.phase === "questions").map(event => [event.date, event]));
  calendar.events = events.filter(event => event.phase !== "questions");
  let seq = 0;
  for (let date = from; date <= examEve(); date = addDaysISO(date, 1), seq++) {
    calendar.events.push(preserved.get(date) || questionEvent(date, seq, cycle.filter(event => event.date <= end), questionGoal));
  }
  calendar.events.sort((a, b) => a.date.localeCompare(b.date) || (a.sequence || 0) - (b.sequence || 0));
  if (saveChanges) save("progress");
}

function seedCalendar() {
  const calendar = calendarState();
  if (calendar.initialized) {
    refreshQuestionMissions();
    return;
  }
  const settings = S.progress.contestSettings || {};
  const start = settings.startISO && settings.startISO > todayISO() ? settings.startISO : todayISO();
  const plan = buildInitialSchedule(start, EXAM_ISO, CURRICULUM, settings);
  calendar.events = plan.events;
  calendar.cycleEndPlanned = plan.cycleEndPlanned;
  calendar.examEve = plan.examEve;
  calendar.studyDays = plan.studyDays;
  calendar.topicCount = plan.topicCount;
  calendar.totalTopicCount = CURRICULUM.length;
  calendar.unplannedTopics = Math.max(0, CURRICULUM.length - plan.topicCount);
  calendar.cycleCompletedAt = null;
  calendar.initialized = true;
  refreshQuestionMissions();
  save("progress");
}

function historicalTotals() {
  const entries = (S.lab && S.lab.entries) || [];
  let studySec = 0, questions = 0;
  const byDisc = {};
  entries.forEach(entry => {
    const meta = discMeta(entry.disc);
    if (meta.group !== "estudo") return;
    const row = byDisc[entry.disc] || (byDisc[entry.disc] = { sec: 0, q: 0 });
    row.sec += Number(entry.sec) || 0;
    row.q += Number(entry.q) || 0;
    studySec += Number(entry.sec) || 0;
    questions += Number(entry.q) || 0;
  });
  return { studySec, questions, byDisc };
}

function cycleMetrics() {
  const calendar = calendarState();
  const cycle = calendar.events.filter(event => event.phase === "cycle");
  const completed = cycle.filter(event => event.done).length;
  const topics = cycle.flatMap(event => event.blocks || []).filter(block => block.topicId);
  const completedTopics = topics.filter(block => block.done).length;
  const cycleEnd = calendar.cycleCompletedAt || latestCycleDate(cycle);
  const days = Math.max(0, diffDaysISO(cycleEnd, examEve()));
  const qEvents = calendar.events.filter(event => event.phase === "questions");
  const dailyQuestions = S.progress.contestSettings?.questionGoal || 100;
  return { cycle, completed, topics, completedTopics, cycleEnd, days, questionGoal: days * dailyQuestions, dailyQuestions, qEvents };
}

function renderHistory() {
  const root = $("#calendarHistory");
  if (!root) return;
  const totals = historicalTotals();
  const hours = Math.floor(totals.studySec / 3600);
  const mins = Math.floor((totals.studySec % 3600) / 60);
  $("#calendarHistoricalHours").textContent = `${hours}h${String(mins).padStart(2, "0")}`;
  $("#calendarHistoricalQuestions").textContent = totals.questions.toLocaleString("pt-BR");
  const rows = Object.entries(totals.byDisc).filter(([, row]) => row.sec || row.q).sort((a, b) => b[1].sec - a[1].sec);
  root.innerHTML = rows.length ? rows.map(([disc, row]) => `
    <div class="history-row">
      <span class="history-disc" style="--subject-color:${discMeta(disc).color}">${esc(discMeta(disc).short)}</span>
      <strong>${esc(fmtDur(row.sec))}</strong><span>${(row.q || 0).toLocaleString("pt-BR")} questões</span>
    </div>`).join("") : `<p class="section-hint history-empty">Seu histórico anterior fica preservado. Conforme os registros de horas e questões aparecerem no Laboratório, eles também serão exibidos aqui.</p>`;
}

function eventState(event) {
  if (event.done) return "is-done";
  return "";
}

function eventCard(event) {
  const blocks = event.blocks || [];
  const typeLabel = event.kind === "study" ? `${Math.round(event.minutes / 60)}h teoria + ${event.questionTarget} questões` :
    event.kind === "mock" ? `Simulado · ${event.questionTarget} questões (P1 ${event.p1Target} + P2 ${event.p2Target})` :
    event.kind === "essay" ? "Redação semanal · treino discursivo" :
    event.kind === "questions" ? `Pós-ciclo · ${event.questionTarget} questões no dia` :
    event.kind === "practice" ? `Questões · ${event.questionTarget} no dia` : "Véspera · preparação leve";
  const blockHtml = blocks.map((block, index) => `
    <li class="calendar-topic${block.done ? " is-done" : ""}" draggable="true" data-drag-topic="${esc(block.topicId || "")}" data-event-id="${esc(event.id)}">
      <label><input type="checkbox" data-cal-block="${esc(event.id)}" data-block-index="${index}"${block.done ? " checked" : ""}>
        <span class="priority-chip priority-chip--${esc(block.priority || "media")}">${block.priority === "ciclo" ? "CICLO" : block.priority === "alta" ? "ALTA" : block.priority === "media" ? "MÉDIA" : "REVISÃO"}</span>
        <span class="calendar-topic-name">${esc(block.title)}</span><small>${block.minutes} min</small>
      </label>
      ${block.topicId ? `<button type="button" class="calendar-remove-topic" data-remove-topic="${esc(event.id)}" data-block-index="${index}" aria-label="Retirar este assunto do dia">×</button>` : ""}
    </li>`).join("");
  const canMarkQuestions = event.questionTarget > 0;
  const action = event.kind === "essay" ? `<label class="calendar-score">Nota da redação <input type="number" min="0" max="30" step="0.5" value="${event.score == null ? "" : esc(event.score)}" placeholder="0–30" data-event-score="${esc(event.id)}"></label>
      <button class="calendar-complete${event.done ? " is-done" : ""}" type="button" data-event-done="${esc(event.id)}">${event.done ? "✓ Redação concluída" : "Marcar redação concluída"}</button>` :
    event.kind === "mock" ? `<button class="calendar-complete${event.done ? " is-done" : ""}" type="button" data-event-done="${esc(event.id)}">${event.done ? "✓ Simulado concluído" : "Marcar simulado concluído"}</button>` :
    event.kind === "final-prep" ? `<button class="calendar-complete${event.done ? " is-done" : ""}" type="button" data-event-done="${esc(event.id)}">${event.done ? "✓ Preparação concluída" : "Marcar preparação concluída"}</button>` :
    canMarkQuestions ? `<button class="calendar-complete${event.questionsDone ? " is-done" : ""}" type="button" data-event-questions="${esc(event.id)}">${event.questionsDone ? `✓ ${event.questionTarget} questões registradas` : `Marcar ${event.questionTarget} questões resolvidas`}</button>` : "";
  return `<article class="calendar-event ${eventState(event)} calendar-event--${esc(event.kind)}" draggable="true" data-drag-event="${esc(event.id)}">
      <header><span class="calendar-event-kind">${esc(typeLabel)}</span><span class="calendar-event-time">${event.minutes ? esc(fmtDur(event.minutes * 60)) : ""}</span></header>
      <h4>${esc(event.title)}</h4>
      ${event.theme ? `<p class="calendar-event-theme">Tema: ${esc(event.theme)}</p>` : ""}
      ${blockHtml ? `<ul class="calendar-topic-list">${blockHtml}</ul>` : ""}
      <div class="calendar-event-actions">${action}</div>
      ${event.kind === "study" ? `<p class="calendar-question-note">${event.questionTarget} questões adicionais a ${esc(fmtDur(event.minutes * 60))} de teoria.</p>` : ""}
    </article>`;
}

function renderWeek() {
  const calendar = calendarState();
  const monday = mondayOf(weekAnchor);
  const dates = Array.from({ length: 7 }, (_, index) => addDaysISO(monday, index));
  const start = parseISO(monday), end = parseISO(dates[6]);
  $("#calendarWeekLabel").textContent = `${fmtDMY(monday)} — ${fmtDMY(dates[6])}`;
  $("#calendarBoard").innerHTML = dates.map((date, index) => {
    const daily = calendar.events.filter(event => event.date === date);
    const todayClass = date === todayISO() ? " is-today" : "";
    return `<section class="calendar-day${todayClass}" data-drop-date="${date}" aria-label="${["Segunda","Terça","Quarta","Quinta","Sexta","Sábado","Domingo"][index]} ${fmtDMY(date)}">
      <header class="calendar-day-header"><span>${["SEG","TER","QUA","QUI","SEX","SÁB","DOM"][index]}</span><strong>${date.slice(8, 10)}</strong><small>${daily.length ? daily.length + " missão" + (daily.length === 1 ? "" : "ões") : "livre"}</small></header>
      <div class="calendar-day-events">${daily.length ? daily.map(eventCard).join("") : `<p class="calendar-drop-hint">Solte um assunto aqui para agendar</p>`}</div>
    </section>`;
  }).join("");
}

function scheduledDateFor(topicId) {
  const event = calendarState().events.find(item => (item.blocks || []).some(block => block.topicId === topicId));
  return event ? event.date : "";
}

function renderCatalog() {
  const root = $("#calendarCatalog");
  if (!root) return;
  const list = CURRICULUM.filter(item => priorityFilter === "all" || item.priority === priorityFilter || item.priority === "ciclo")
    .filter(item => !searchText || `${item.title} ${discMeta(item.disc).label}`.toLocaleLowerCase("pt-BR").includes(searchText));
  root.innerHTML = list.map(item => {
    const scheduled = scheduledDateFor(item.id);
    return `<article class="catalog-topic" draggable="true" data-catalog-topic="${esc(item.id)}" style="--subject-color:${discMeta(item.disc).color}">
      <div><span class="priority-chip priority-chip--${item.priority}">${item.priority === "ciclo" ? "CICLO" : item.priority === "alta" ? "ALTA" : "MÉDIA"}</span><span class="catalog-subject">${esc(discMeta(item.disc).short)}</span><small>${item.minutes} min</small></div>
      <p>${esc(item.title)}</p>
      <footer>${scheduled ? `<span>Na agenda: ${fmtDMY(scheduled)}</span>` : `<span>Disponível para agendar</span>`}<button type="button" data-add-topic="${esc(item.id)}">${scheduled ? "Mover" : "Agendar"}</button></footer>
    </article>`;
  }).join("") || `<p class="section-hint">Nenhum assunto corresponde à busca.</p>`;
}

function eventSummary(event) {
  const date = fmtDMY(event.date);
  const done = event.done ? "✓" : "○";
  const kind = event.kind === "study" ? `${fmtDur(event.minutes * 60)} de teoria + ${event.questionTarget} questões` : event.kind === "mock" ? "Simulado semanal" : event.kind === "essay" ? "Redação" : event.kind === "questions" ? `${event.questionTarget} questões e correção` : "Revisão do ciclo";
  const topics = (event.blocks || []).filter(block => block.topicId).map(block => block.title);
  return `<li class="mission-day${event.done ? " is-done" : ""}"><span class="mission-day-status">${done}</span><time>${date}</time><div><strong>${esc(event.title)}</strong><small>${esc(kind)}${topics.length ? " · " + topics.map(esc).join("; ") : ""}</small></div><a href="#calendario" data-mission-date="${esc(event.date)}">Abrir no calendário</a></li>`;
}

function renderMissionPath() {
  const root = $("#cycleMissionPath");
  if (!root) return;
  if (!calendarState().initialized) {
    root.innerHTML = `<p class="section-hint">Carregando o ciclo pós-edital e seu histórico salvo na conta…</p>`;
    return;
  }
  const metrics = cycleMetrics();
  const calendar = calendarState();
  const byWeek = new Map();
  metrics.cycle.forEach(event => {
    const week = mondayOf(event.date);
    if (!byWeek.has(week)) byWeek.set(week, []);
    byWeek.get(week).push(event);
  });
  const weeks = [...byWeek.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const cycleDone = Boolean(calendar.cycleCompletedAt);
  const cycleWeeks = weeks.map(([weekStart, events], index) => {
    const weekEnd = addDaysISO(weekStart, 6);
    const done = events.filter(event => event.done).length;
    const topics = events.flatMap(event => event.blocks || []).filter(block => block.topicId);
    const high = topics.filter(block => block.priority === "alta").length;
    const media = topics.filter(block => block.priority === "media").length;
    const fullCycle = CURRICULUM.length && CURRICULUM.every(item => item.priority === "ciclo");
    const expanded = weekStart === mondayOf(todayISO()) ? " open" : "";
    return `<details class="mission-week"${expanded}>
      <summary><span class="mission-week-node">${String(index + 1).padStart(2, "0")}</span><span class="mission-week-title"><strong>Semana ${index + 1} · ${fullCycle ? "Programa do cargo" : high ? "Alta prioridade" : "Média / revisão"}</strong><small>${fmtDMY(weekStart)} — ${fmtDMY(weekEnd)} · ${done}/${events.length} missões concluídas · ${fullCycle ? topics.length + " assuntos" : high + " tópicos altos" + (media ? " · " + media + " médios" : "")}</small></span><span class="mission-week-arrow">⌄</span></summary>
      <ul>${events.map(eventSummary).join("")}</ul>
    </details>`;
  }).join("");
  const questionRows = metrics.qEvents.length ? `<details class="mission-week mission-week--questions"><summary><span class="mission-week-node">Q</span><span class="mission-week-title"><strong>Missões pós-ciclo · ${metrics.dailyQuestions} questões por dia</strong><small>${metrics.days} dias × ${metrics.dailyQuestions} questões = ${metrics.questionGoal.toLocaleString("pt-BR")} questões até ${fmtDMY(examEve())}</small></span><span class="mission-week-arrow">⌄</span></summary>
      <ul>${metrics.qEvents.map(eventSummary).join("")}</ul></details>` : `<div class="mission-question-empty"><strong>Ciclo concluído.</strong><span>Não há dias restantes para novas missões de questões antes da véspera.</span></div>`;
  root.innerHTML = `<div class="mission-cycle-summary">
    <div><span class="mission-summary-label">CICLO PÓS-EDITAL</span><strong>${cycleDone ? "Ciclo concluído" : "Conclusão prevista"}</strong><small>${fmtDMY(cycleDone ? calendar.cycleCompletedAt : metrics.cycleEnd)} · ${metrics.completed}/${metrics.cycle.length} missões do ciclo</small></div>
    <div class="mission-question-total"><span class="mission-summary-label">QUESTÕES APÓS O CICLO</span><strong>${metrics.questionGoal.toLocaleString("pt-BR")}</strong><small>${metrics.days} dias × ${metrics.dailyQuestions} questões · até ${fmtDMY(examEve())}</small></div>
  </div>
  <div class="mission-cycle-progress"><div><span>Assuntos do ciclo marcados</span><strong>${metrics.completedTopics}/${metrics.topics.length}</strong></div><div class="mini-bar"><div class="mini-fill mini-fill--green" style="width:${metrics.topics.length ? Math.round(metrics.completedTopics / metrics.topics.length * 100) : 0}%"></div></div></div>
  <div class="mission-cycle-steps">${cycleWeeks}${questionRows}</div>`;
}

function render() {
  if (!ready || !$("#calendarBoard")) return;
  if (!calendarState().initialized) { renderHistory(); renderMissionPath(); return; }
  const metrics = cycleMetrics();
  const pendingTopics = calendarState().unplannedTopics || 0;
  $("#calendarCycleLabel").textContent = `Conteúdos até ${fmtDMY(metrics.cycleEnd)} · ${metrics.questionGoal.toLocaleString("pt-BR")} questões previstas após o ciclo${pendingTopics ? ` · atenção: ${pendingTopics} assunto(s) não couberam no período` : ""}`;
  renderHistory(); renderWeek(); renderCatalog(); renderMissionPath();
}

function commit({ saveLab = false } = {}) {
  refreshQuestionMissions();
  save("progress");
  if (saveLab) save("lab");
  render();
}

function findEvent(id) { return calendarState().events.find(event => event.id === id); }

function setEventCompletion(event) {
  if (event.kind === "study") {
    const blocksDone = (event.blocks || []).every(block => block.done);
    event.done = blocksDone && Boolean(event.questionsDone);
  } else if (event.kind === "questions" || event.kind === "practice") {
    event.done = Boolean(event.questionsDone);
  }
}

function syncBlockLabEntry(event, block) {
  if (!Array.isArray(S.lab.entries)) S.lab.entries = [];
  if (block.done && !block.labEntryId) block.labEntryId = uid();
  if (!block.labEntryId) return false;
  const sourceId = `calendar:block:${block.labEntryId}`;
  const entryIndex = S.lab.entries.findIndex(entry => entry.calendarSourceId === sourceId);
  if (!block.done) {
    if (entryIndex < 0) return false;
    S.lab.entries.splice(entryIndex, 1);
    return true;
  }
  if (entryIndex >= 0) return false;
  S.lab.entries.push({
    id: uid(),
    calendarSourceId: sourceId,
    date: event.date,
    disc: block.disc || "geral",
    kind: "teoria",
    sec: Math.max(0, Number(block.minutes) || 0) * 60,
    q: 0,
    hit: null,
    note: "Concluído no calendário pós-edital",
    ts: Date.now(),
  });
  return true;
}

function syncCompletedCalendarHours() {
  const calendar = calendarState();
  let labChanged = false, progressChanged = false;
  calendar.events.forEach(event => (event.blocks || []).forEach(block => {
    if (block.done && !block.labEntryId) { block.labEntryId = uid(); progressChanged = true; }
    if (syncBlockLabEntry(event, block)) labChanged = true;
  }));
  if (progressChanged) save("progress");
  if (labChanged) save("lab");
}

function addOrMoveTopic(topicId, targetDate) {
  if (!targetDate || targetDate > examEve()) { toast("Escolha um dia até a véspera da prova."); return; }
  const events = calendarState().events;
  let movingBlock = null;
  events.forEach(event => {
    const index = (event.blocks || []).findIndex(block => block.topicId === topicId);
    if (index >= 0) {
      movingBlock = event.blocks.splice(index, 1)[0];
      setEventCompletion(event);
    }
  });
  if (movingBlock && events.some(event => event.date === targetDate && (event.blocks || []).some(block => block.topicId === topicId))) {
    toast("Esse conteúdo já está agendado nesse dia."); return;
  }
  const topic = CURRICULUM.find(item => item.id === topicId);
  if (!movingBlock && !topic) return;
  const block = movingBlock || { topicId: topic.id, title: topic.title, disc: topic.disc, priority: topic.priority, minutes: topic.minutes, done: false };
  let target = events.find(event => event.date === targetDate && event.kind === "study");
  if (!target) {
    const blocks = [block];
    const filler = Math.max(0, 180 - block.minutes);
    if (filler) blocks.push({ topicId: null, title: "Revisão ativa e leitura dirigida", disc: block.disc, priority: block.priority, minutes: filler, done: false, review: true });
    target = { id: uid(), date: targetDate, kind: "study", phase: "cycle", title: `${block.priority === "ciclo" ? "Conteúdo do cargo" : block.priority === "alta" ? "Alta" : "Média"} · ${discMeta(block.disc).short}`, blocks, minutes: Math.max(180, block.minutes), questionTarget: 50, questionsDone: false, done: false, sequence: 0 };
    events.push(target);
  } else {
    target.blocks = (target.blocks || []).filter(item => !item.review || item.done);
    target.blocks.push(block);
    const total = target.blocks.reduce((sum, item) => sum + (Number(item.minutes) || 0), 0);
    target.minutes = Math.max(180, total);
    target.title = [...new Set(target.blocks.filter(item => item.topicId).map(item => discMeta(item.disc).short))].join(" + ") || target.title;
    target.phase = "cycle";
    target.questionTarget = 50;
    target.kind = "study";
    target.questionsDone = false;
    target.done = false;
    if (total < 180) target.blocks.push({ topicId: null, title: "Revisão ativa e leitura dirigida", disc: block.disc, priority: block.priority, minutes: 180 - total, done: false, review: true });
  }
  commit();
  toast(`Conteúdo agendado para ${fmtDMY(targetDate)}.`);
}

function moveEvent(eventId, targetDate) {
  const event = findEvent(eventId);
  if (!event || !targetDate || targetDate > examEve()) return;
  event.date = targetDate;
  commit();
  toast(`Missão movida para ${fmtDMY(targetDate)}.`);
}

function setCompletion(eventId, value) {
  const event = findEvent(eventId);
  if (!event) return;
  event.questionsDone = Boolean(value);
  setEventCompletion(event);
  commit();
}

function toggleEvent(eventId) {
  const event = findEvent(eventId);
  if (!event) return;
  event.done = !event.done;
  if (event.kind === "mock" || event.kind === "questions") event.questionsDone = event.done;
  if (event.kind === "study" && event.done) {
    (event.blocks || []).forEach(block => { block.done = true; });
    event.questionsDone = true;
  }
  commit();
}

function removeTopic(eventId, index) {
  const event = findEvent(eventId);
  if (!event || !event.blocks[index]) return;
  event.blocks.splice(index, 1);
  setEventCompletion(event);
  commit();
  toast("Conteúdo retirado do dia. Ele continua disponível na lista para reagendar.");
}

function wire() {
  $("#calendarPrev").addEventListener("click", () => { weekAnchor = addDaysISO(weekAnchor, -7); renderWeek(); });
  $("#calendarNext").addEventListener("click", () => { weekAnchor = addDaysISO(weekAnchor, 7); renderWeek(); });
  $("#calendarToday").addEventListener("click", () => { weekAnchor = todayISO(); renderWeek(); });
  $("#calendarTargetDate").value = todayISO();
  $("#calendarSearch").addEventListener("input", event => { searchText = event.target.value.trim().toLocaleLowerCase("pt-BR"); renderCatalog(); });
  $("#calendarPriority").addEventListener("change", event => { priorityFilter = event.target.value; renderCatalog(); });
  $("#calendarAddSelected").addEventListener("click", () => {
    const topicId = $("#calendarTopicSelect").value;
    const date = $("#calendarTargetDate").value;
    if (topicId) addOrMoveTopic(topicId, date);
  });
  $("#calendarTopicSelect").innerHTML = CURRICULUM.map(item => `<option value="${esc(item.id)}">${item.priority === "ciclo" ? "CICLO" : item.priority === "alta" ? "ALTA" : "MÉDIA"} · ${esc(discMeta(item.disc).short)} · ${esc(item.title)}</option>`).join("");

  document.addEventListener("click", event => {
    const add = event.target.closest("[data-add-topic]");
    if (add) { addOrMoveTopic(add.dataset.addTopic, $("#calendarTargetDate").value); return; }
    const q = event.target.closest("[data-event-questions]");
    if (q) { const item = findEvent(q.dataset.eventQuestions); setCompletion(q.dataset.eventQuestions, !item.questionsDone); return; }
    const done = event.target.closest("[data-event-done]");
    if (done) { toggleEvent(done.dataset.eventDone); return; }
    const remove = event.target.closest("[data-remove-topic]");
    if (remove) removeTopic(remove.dataset.removeTopic, Number(remove.dataset.blockIndex));
    const dateLink = event.target.closest("[data-mission-date]");
    if (dateLink) {
      weekAnchor = dateLink.dataset.missionDate;
      const anchor = mondayOf(weekAnchor);
      location.hash = "#calendario";
      setTimeout(() => { weekAnchor = anchor; renderWeek(); $("#calendarBoard").scrollIntoView({ behavior: "smooth", block: "start" }); }, 0);
    }
  });

  document.addEventListener("change", event => {
    const check = event.target.closest("[data-cal-block]");
    if (check) {
      const item = findEvent(check.dataset.calBlock);
      const block = item && item.blocks[Number(check.dataset.blockIndex)];
      if (!block) return;
      block.done = check.checked;
      const labChanged = syncBlockLabEntry(item, block);
      setEventCompletion(item);
      if (labChanged) {
        const amount = fmtDur((Number(block.minutes) || 0) * 60);
        toast(check.checked ? `${amount} adicionados ao Laboratório · ${discMeta(block.disc).short}.` : `${amount} removidos do Laboratório.`);
      }
      commit({ saveLab: labChanged });
      return;
    }
    const score = event.target.closest("[data-event-score]");
    if (score) {
      const item = findEvent(score.dataset.eventScore);
      if (item) { item.score = score.value === "" ? null : Math.max(0, Math.min(30, Number(score.value))); commit(); }
    }
  });

  document.addEventListener("dragstart", event => {
    const eventCard = event.target.closest("[data-drag-event]");
    const topic = event.target.closest("[data-catalog-topic]");
    const dayTopic = event.target.closest("[data-drag-topic]");
    if (eventCard) {
      event.dataTransfer.setData("text/plain", `event:${eventCard.dataset.dragEvent}`);
      event.dataTransfer.effectAllowed = "move";
    } else if (topic) {
      event.dataTransfer.setData("text/plain", `topic:${topic.dataset.catalogTopic}`);
      event.dataTransfer.effectAllowed = "move";
    } else if (dayTopic && dayTopic.dataset.dragTopic) {
      event.dataTransfer.setData("text/plain", `topic:${dayTopic.dataset.dragTopic}`);
      event.dataTransfer.effectAllowed = "move";
    }
  });
  document.addEventListener("dragover", event => {
    const day = event.target.closest("[data-drop-date]");
    if (day) { event.preventDefault(); day.classList.add("is-drop-target"); }
  });
  document.addEventListener("dragleave", event => {
    const day = event.target.closest("[data-drop-date]");
    if (day && !day.contains(event.relatedTarget)) day.classList.remove("is-drop-target");
  });
  document.addEventListener("drop", event => {
    const day = event.target.closest("[data-drop-date]");
    if (!day) return;
    event.preventDefault(); day.classList.remove("is-drop-target");
    const [type, id] = (event.dataTransfer.getData("text/plain") || "").split(":");
    if (type === "topic") addOrMoveTopic(id, day.dataset.dropDate);
    else if (type === "event") moveEvent(id, day.dataset.dropDate);
  });
}

export function init() {
  ready = true;
  if (CURRICULUM.length && CURRICULUM.every(item => item.priority === "ciclo")) {
    const priority = $("#calendarPriority");
    if (priority) priority.closest("label").hidden = true;
    $("#calendarTitle").lastChild.textContent = ` Ciclo de estudos · ${document.body.dataset.contestRole || "seu cargo"}`;
    const intro = $("#view-calendario .calendar-overview > .section-hint");
    if (intro) intro.textContent = "O ciclo cobre todas as disciplinas e assuntos identificados para o cargo. De segunda a sexta, estude a teoria e resolva questões; sábado tem simulado e domingo redação ou revisão, conforme o formato do concurso. Depois do ciclo, seguem as missões de questões até a véspera da prova.";
  }
  wire();
  onChange(name => { if (name === "progress" || name === "lab") render(); });
  render();
}

export function ensureSeeded() {
  seedCalendar();
  syncCompletedCalendarHours();
  render();
}

export function onShow() { render(); }
export { renderMissionPath };
