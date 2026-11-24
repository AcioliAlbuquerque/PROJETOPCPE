/* ==========================================================================
   OPERAÇÃO PCPE — lab.js
   Laboratório: horas e questões por disciplina (pizza + tabela), metas e registros.
   Cada registro: { id, date:"AAAA-MM-DD", disc, kind, sec, q, hit, score, note, ts }
   score = pontuação da redação (0–30), quando disc === "redacao"
   ========================================================================== */
import {
  DISCIPLINES, DAILY_GOAL_MIN, EXAM_ISO, CAMPAIGN_START_ISO, $, $$, esc, uid, toast, todayISO, addDaysISO, diffDaysISO,
  fmtDur, fmtDM, fmtDMY, discMeta, discOptionsHTML, kindOptionsHTML, KINDS, parseISO,
} from "./config.js";
import { S, save, onChange, bumpStreak } from "./store.js";

const NS = "http://www.w3.org/2000/svg";
const MAX_SLICES = 8;
const OTHER = { key: "_outras", label: "Demais disciplinas", color: "#64748b" };
const CX = 120, CY = 120, R_OUT = 100, R_IN = 62;
const WD = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/* Metas pessoais */
const ACCURACY_GOAL = 80;   // % de acerto em questões
const REDACAO_GOAL = 25;    // pontos na redação (máx. 30)

let range = "all";                  // all | 1 (hoje) | 7 | 30
let shown = 15;
let ready = false;

const entries = () => (S.lab.entries || (S.lab.entries = []));
const goalMin = () => Math.max(30, Number(S.lab.goalMin) || DAILY_GOAL_MIN);
const isStudy = key => discMeta(key).group === "estudo";
const fmtPct = n => (Number.isFinite(n) ? Math.round(n) + "%" : "—");

function inRange(e) {
  if (range === "all") return true;
  return e.date >= addDaysISO(todayISO(), -(Number(range) - 1));
}

/* ---------- Agregações ---------- */
function aggregate(includeTaf) {
  const by = new Map();
  entries().filter(inRange).forEach(e => {
    if (!includeTaf && !isStudy(e.disc)) return;
    const a = by.get(e.disc) || { key: e.disc, sec: 0, q: 0, hit: 0 };
    a.sec += e.sec || 0; a.q += e.q || 0; a.hit += e.hit || 0;
    by.set(e.disc, a);
  });
  return by;
}
function secOn(dateISO) {
  return entries().reduce((s, e) => s + (e.date === dateISO && isStudy(e.disc) ? e.sec || 0 : 0), 0);
}

/* ---------- Cartões de resumo + meta até a prova ---------- */
function renderKpis() {
  const study = entries().filter(e => isStudy(e.disc));
  const total = study.reduce((s, e) => s + (e.sec || 0), 0);
  const today = todayISO();
  const t = secOn(today), goal = goalMin();
  const from7 = addDaysISO(today, -6);
  const week = study.filter(e => e.date >= from7).reduce((s, e) => s + (e.sec || 0), 0);
  const q = study.reduce((s, e) => s + (e.q || 0), 0);
  const hit = study.reduce((s, e) => s + (e.hit || 0), 0);
  const days = new Set(study.map(e => e.date)).size;
  const acc = q ? (hit / q * 100) : null;

  /* Redações com pontuação registrada */
  const redacoes = entries().filter(e => e.disc === "redacao" && Number.isFinite(e.score));
  const redMedia = redacoes.length
    ? redacoes.reduce((s, e) => s + e.score, 0) / redacoes.length
    : null;

  $("#kpiTotal").textContent = fmtDur(total);
  $("#kpiTotalNote").textContent = study.length ? study.length + " registros em " + days + (days === 1 ? " dia" : " dias") : "nenhum registro ainda";
  $("#kpiToday").textContent = fmtDur(t);
  $("#kpiTodayNote").textContent = t >= goal * 60 ? "meta de " + fmtDur(goal * 60) + " batida ✓" : "faltam " + fmtDur(goal * 60 - t) + " para a meta";
  $("#kpiWeek").textContent = fmtDur(week);
  $("#kpiWeekNote").textContent = "média de " + fmtDur(week / 7) + " por dia";
  $("#kpiQuestions").textContent = q.toLocaleString("pt-BR");
  $("#kpiQuestionsNote").textContent = q ? hit.toLocaleString("pt-BR") + " acertos" : "registre nas sessões";

  /* Aproveitamento × meta 80% */
  if (acc === null) {
    $("#kpiAccuracy").textContent = "—";
    $("#kpiAccuracyNote").textContent = "meta " + ACCURACY_GOAL + "% · sem questões ainda";
    $("#kpiAccuracy").style.color = "";
  } else {
    const diff = acc - ACCURACY_GOAL;
    const status = diff >= 0
      ? "▲ +" + Math.abs(diff).toFixed(0) + " pp acima da meta"
      : "▼ " + Math.abs(diff).toFixed(0) + " pp abaixo da meta";
    $("#kpiAccuracy").textContent = fmtPct(acc);
    $("#kpiAccuracyNote").textContent = "meta " + ACCURACY_GOAL + "% · " + status;
    $("#kpiAccuracy").style.color = diff >= 0 ? "var(--green)" : "var(--red)";
  }

  /* Redação × meta 25 */
  if ($("#kpiRedacao")) {
    if (redMedia === null) {
      $("#kpiRedacao").textContent = "—";
      $("#kpiRedacaoNote").textContent = "meta " + REDACAO_GOAL + " pts · nenhuma nota ainda";
      $("#kpiRedacao").style.color = "";
    } else {
      const diff = redMedia - REDACAO_GOAL;
      const status = diff >= 0
        ? "▲ +" + Math.abs(diff).toFixed(1) + " acima da meta"
        : "▼ " + Math.abs(diff).toFixed(1) + " abaixo da meta";
      $("#kpiRedacao").textContent = redMedia.toFixed(1);
      $("#kpiRedacaoNote").textContent = "meta " + REDACAO_GOAL + " pts · " + redacoes.length + (redacoes.length === 1 ? " redação" : " redações") + " · " + status;
      $("#kpiRedacao").style.color = diff >= 0 ? "var(--green)" : "var(--red)";
    }
  }

  // meta de 3h por dia
  const elapsedDays = Math.max(1, Math.min(diffDaysISO(CAMPAIGN_START_ISO, today) + 1, diffDaysISO(CAMPAIGN_START_ISO, EXAM_ISO) + 1));
  const planned = elapsedDays * goal * 60;
  const pct = Math.min(100, Math.round(total / planned * 100));
  $("#goalPct").textContent = Math.round(total / planned * 100) + "%";
  $("#goalBar").style.width = pct + "%";
  $("#goalBarWrap").setAttribute("aria-valuenow", pct);
  const left = Math.max(0, diffDaysISO(today, EXAM_ISO));
  const pace = week / 7;
  const projected = total + pace * left;
  const totalPlan = (diffDaysISO(CAMPAIGN_START_ISO, EXAM_ISO) + 1) * goal * 60;
  $("#goalNote").textContent =
    "Até hoje a meta somaria " + fmtDur(planned) + " (" + elapsedDays + " dias × " + fmtDur(goal * 60) + "). " +
    "Faltam " + left + " dias para a prova: no ritmo dos últimos 7 dias você chega a cerca de " + fmtDur(projected) +
    " de estudo, contra " + fmtDur(totalPlan) + " pela meta.";
}

/* ---------- Pizza (rosca) + tabela ---------- */
function polar(r, ang) { return [CX + r * Math.cos(ang), CY + r * Math.sin(ang)]; }
function slicePath(a0, a1) {
  if (a1 - a0 >= Math.PI * 2 - 0.0001) {
    const [ox, oy] = polar(R_OUT, a0), [mx, my] = polar(R_OUT, a0 + Math.PI), [ix, iy] = polar(R_IN, a0), [jx, jy] = polar(R_IN, a0 + Math.PI);
    return `M${ox},${oy}A${R_OUT},${R_OUT} 0 1 1 ${mx},${my}A${R_OUT},${R_OUT} 0 1 1 ${ox},${oy}M${ix},${iy}A${R_IN},${R_IN} 0 1 0 ${jx},${jy}A${R_IN},${R_IN} 0 1 0 ${ix},${iy}Z`;
  }
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = polar(R_OUT, a0), [x1, y1] = polar(R_OUT, a1), [x2, y2] = polar(R_IN, a1), [x3, y3] = polar(R_IN, a0);
  return `M${x0},${y0}A${R_OUT},${R_OUT} 0 ${large} 1 ${x1},${y1}L${x2},${y2}A${R_IN},${R_IN} 0 ${large} 0 ${x3},${y3}Z`;
}

function renderPie() {
  const includeTaf = $("#labIncludeTaf").checked;
  const agg = aggregate(includeTaf);
  const rows = [...agg.values()].filter(a => a.sec > 0 || a.q > 0).sort((a, b) => b.sec - a.sec);
  const total = rows.reduce((s, a) => s + a.sec, 0);

  const withData = new Set(rows.map(r => r.key));
  const zero = Object.keys(DISCIPLINES).filter(k => (includeTaf || isStudy(k)) && !withData.has(k));
  const body = $("#labTableBody");
  body.innerHTML = rows.concat(zero.map(k => ({ key: k, sec: 0, q: 0, hit: 0 }))).map(a => {
    const m = discMeta(a.key);
    return `<tr data-key="${a.key}"${a.sec === 0 && a.q === 0 ? ' class="is-zero"' : ""}>
      <td class="disc"><span class="swatch" style="--c:${m.color}"></span>${esc(m.label)}</td>
      <td class="num">${fmtDur(a.sec)}</td>
      <td class="num">${total ? fmtPct(a.sec / total * 100) : "—"}</td>
      <td class="num">${a.q ? a.q.toLocaleString("pt-BR") : "0"}</td>
      <td class="num">${a.hit ? a.hit.toLocaleString("pt-BR") : "0"}</td>
      <td class="num">${a.q ? fmtPct(a.hit / a.q * 100) : "—"}</td></tr>`;
  }).join("");
  const tq = rows.reduce((s, a) => s + a.q, 0), th = rows.reduce((s, a) => s + a.hit, 0);
  $("#labTableFoot").innerHTML = `<tr><td>Total</td><td class="num">${fmtDur(total)}</td><td class="num">${total ? "100%" : "—"}</td><td class="num">${tq.toLocaleString("pt-BR")}</td><td class="num">${th.toLocaleString("pt-BR")}</td><td class="num">${tq ? fmtPct(th / tq * 100) : "—"}</td></tr>`;

  const timed = rows.filter(r => r.sec > 0);
  let slices = timed.slice(0, MAX_SLICES).map(r => ({ key: r.key, label: discMeta(r.key).label, color: discMeta(r.key).color, sec: r.sec }));
  if (timed.length > MAX_SLICES) {
    const rest = timed.slice(MAX_SLICES);
    slices.push({ key: OTHER.key, label: OTHER.label + " (" + rest.length + ")", color: OTHER.color, sec: rest.reduce((s, r) => s + r.sec, 0) });
  }

  const svg = $("#labDonut");
  const wrap = svg.closest(".donut-wrap");
  svg.innerHTML = "";
  wrap.classList.toggle("is-empty", total === 0);
  $("#donutTotal").textContent = fmtDur(total);
  $("#donutCaption").textContent = includeTaf ? "no total" : "estudadas";
  hideTip();
  if (total === 0) {
    const ring = document.createElementNS(NS, "path");
    ring.setAttribute("d", slicePath(-Math.PI / 2, -Math.PI / 2 + Math.PI * 2));
    ring.setAttribute("fill", "var(--border)");
    ring.setAttribute("fill-rule", "evenodd");
    svg.appendChild(ring);
    return;
  }
  let a = -Math.PI / 2;
  slices.forEach(s => {
    const span = s.sec / total * Math.PI * 2;
    const p = document.createElementNS(NS, "path");
    p.setAttribute("d", slicePath(a, a + span));
    p.setAttribute("fill", s.color);
    p.setAttribute("fill-rule", "evenodd");
    p.setAttribute("class", "slice");
    p.setAttribute("tabindex", "0");
    p.setAttribute("role", "img");
    p.setAttribute("data-key", s.key);
    p.setAttribute("aria-label", `${s.label}: ${fmtDur(s.sec)}, ${fmtPct(s.sec / total * 100)} do total`);
    p._info = { label: s.label, sec: s.sec, pct: s.sec / total * 100 };
    svg.appendChild(p);
    a += span;
  });
}

function showTip(el, info) {
  const wrap = el.closest(".donut-wrap");
  const tip = $("#chartTip");
  tip.innerHTML = `<b>${esc(info.label)}</b><br>${fmtDur(info.sec)} · ${fmtPct(info.pct)}`;
  tip.hidden = false;
  const w = wrap.getBoundingClientRect(), r = el.getBoundingClientRect();
  tip.style.left = Math.max(60, Math.min(w.width - 60, r.left + r.width / 2 - w.left)) + "px";
  tip.style.top = Math.max(30, r.top - w.top + r.height / 2 - 14) + "px";
  wrap.classList.add("has-hover");
  el.classList.add("is-hover");
  $$("#labTableBody tr").forEach(tr => tr.classList.toggle("is-hover", tr.dataset.key === el.dataset.key));
}
function hideTip() {
  const tip = $("#chartTip");
  tip.hidden = true;
  const wrap = $("#labDonut").closest(".donut-wrap");
  wrap.classList.remove("has-hover");
  $$("#labDonut .is-hover").forEach(n => n.classList.remove("is-hover"));
  $$("#labTableBody tr.is-hover").forEach(n => n.classList.remove("is-hover"));
}

/* ---------- 14 dias ---------- */
function renderDays() {
  const box = $("#dayBars");
  const today = todayISO(), goal = goalMin() * 60;
  const days = [];
  for (let i = 13; i >= 0; i--) { const d = addDaysISO(today, -i); days.push({ d, sec: secOn(d) }); }
  const max = Math.max(goal, ...days.map(x => x.sec)) * 1.12;
  box.innerHTML = days.map(x => {
    const h = Math.round(x.sec / max * 100);
    const txt = `${WD[parseISO(x.d).getDay()]} ${fmtDM(x.d)}: ${x.sec ? fmtDur(x.sec) : "sem estudo"}`;
    return `<button type="button" class="day-col${x.sec >= goal ? " is-met" : ""}${x.sec === 0 ? " is-empty" : ""}${x.d === today ? " is-today" : ""}" data-tip="${esc(txt)}" aria-label="${esc(txt)}">
      <span class="day-bar" style="height:${h}%"></span><span class="day-label">${x.d.slice(8)}</span></button>`;
  }).join("") + `<div class="day-goal-line" style="bottom:calc(1.6rem + (100% - 1.6rem) * ${(goal / max).toFixed(4)})"></div><div class="chart-tip" id="dayTip" hidden></div>`;
}
function dayTipShow(btn) {
  const tip = $("#dayTip"), box = $("#dayBars");
  if (!tip) return;
  tip.textContent = btn.dataset.tip;
  tip.hidden = false;
  const b = box.getBoundingClientRect(), r = btn.getBoundingClientRect();
  tip.style.left = Math.max(70, Math.min(b.width - 70, r.left + r.width / 2 - b.left)) + "px";
  tip.style.top = (r.top - b.top + 24) + "px";
}

/* ---------- Registros ---------- */
function renderSessions() {
  const all = entries().slice().sort((a, b) => b.date.localeCompare(a.date) || (b.ts || 0) - (a.ts || 0));
  const list = $("#sessionList");
  list.innerHTML = all.length ? all.slice(0, shown).map(e => {
    const m = discMeta(e.disc);
    const parts = [fmtDMY(e.date), KINDS[e.kind] || ""];
    if (e.q) parts.push(`${e.q} questões${e.hit != null ? ", " + e.hit + " acertos" : ""}`);
    if (e.disc === "redacao" && Number.isFinite(e.score)) {
      const vs = e.score >= REDACAO_GOAL ? "▲" : "▼";
      parts.push(`nota ${e.score} ${vs} meta ${REDACAO_GOAL}`);
    }
    if (e.note) parts.push(e.note);
    const meta = parts.filter(Boolean).map(esc).join(" · ");
    return `<li class="session-item" style="--c:${m.color}">
      <div class="session-main"><b>${esc(m.label)}</b><span class="session-meta">${meta}</span></div>
      <span class="session-time">${fmtDur(e.sec || 0)}</span>
      <button class="session-del" type="button" data-del="${esc(e.id)}" aria-label="Apagar registro de ${esc(m.label)} de ${fmtDMY(e.date)}">✕</button></li>`;
  }).join("") : `<li class="empty">Nenhum registro ainda.</li>`;
  $("#sessionMore").hidden = all.length <= shown;
}

function renderAll() {
  if (!ready) return;
  renderKpis(); renderPie(); renderDays(); renderSessions();
  const g = $("#dailyGoal");
  if (document.activeElement !== g) g.value = goalMin();
}

/* ---------- Formulário ---------- */
function formMsg(text, ok) {
  const el = $("#labFormMsg");
  el.textContent = text;
  el.className = "login-msg" + (text ? (ok ? " is-ok" : " is-error") : "");
}

function toggleRedacaoField() {
  const isRed = $("#labDisc").value === "redacao";
  const scoreField = $("#labScoreField");
  if (scoreField) scoreField.hidden = !isRed;
}

function onSubmit(ev) {
  ev.preventDefault();
  const date = $("#labDate").value;
  const disc = $("#labDisc").value;
  const h = Math.floor(Number($("#labH").value) || 0), m = Math.floor(Number($("#labM").value) || 0);
  const q = Math.floor(Number($("#labQ").value) || 0), hit = Math.floor(Number($("#labHit").value) || 0);
  const sec = (h * 60 + m) * 60;
  let score = null;

  if (disc === "redacao") {
    const raw = $("#labScore").value;
    if (raw !== "" && raw != null) {
      score = Number(raw);
      if (!Number.isFinite(score) || score < 0 || score > 30) {
        return formMsg("A nota da redação precisa ser entre 0 e 30.", false);
      }
    }
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return formMsg("Escolha a data.", false);
  if (date > todayISO()) return formMsg("A data não pode estar no futuro.", false);
  if (h < 0 || m < 0 || q < 0 || hit < 0 || m > 59) return formMsg("Confira horas, minutos e questões.", false);
  if (sec === 0 && q === 0 && score === null) return formMsg("Informe o tempo, as questões ou a nota da redação.", false);
  if (sec > 16 * 3600) return formMsg("O tempo passa de 16 horas. Confira o valor.", false);
  if (hit > q) return formMsg("Os acertos não podem passar de " + q + " questões.", false);

  const entry = {
    id: uid(),
    date,
    disc,
    kind: $("#labKind").value,
    sec,
    q,
    hit,
    note: $("#labNote").value.trim().slice(0, 120),
    ts: Date.now(),
  };
  if (score !== null) entry.score = score;

  entries().push(entry);
  bumpStreak(date);
  save("lab");
  save("progress");

  ["#labH", "#labM", "#labQ", "#labHit"].forEach(s => { $(s).value = 0; });
  if ($("#labScore")) $("#labScore").value = "";
  $("#labNote").value = "";

  let msg = "Registro salvo: " + fmtDur(sec);
  if (q) {
    const pct = q ? Math.round(hit / q * 100) : 0;
    const vs = pct >= ACCURACY_GOAL ? "▲ acima" : "▼ abaixo";
    msg += ", " + q + " questões (" + pct + "% · " + vs + " da meta " + ACCURACY_GOAL + "%)";
  }
  if (score !== null) {
    const vs = score >= REDACAO_GOAL ? "▲ acima" : "▼ abaixo";
    msg += ", redação " + score + " pts (" + vs + " da meta " + REDACAO_GOAL + ")";
  }
  formMsg(msg + ".", true);
  toast("Registro salvo");
}

export function init() {
  $("#labDisc").innerHTML = discOptionsHTML("dir_constitucional");
  $("#labKind").innerHTML = kindOptionsHTML("questoes");
  $("#labDate").value = todayISO();
  $("#labDate").max = todayISO();

  /* Campo de nota da redação (criado dinamicamente se não existir no HTML) */
  if (!$("#labScoreField")) {
    const actions = $(".lab-form-actions");
    const field = document.createElement("label");
    field.className = "field";
    field.id = "labScoreField";
    field.hidden = true;
    field.innerHTML = `<span>Nota da redação (0–30)</span>
      <input class="field-input" type="number" id="labScore" min="0" max="30" step="0.1" placeholder="Ex.: 24,5" inputmode="decimal">`;
    actions.parentNode.insertBefore(field, actions);
  }

  /* KPI de redação (criado se não existir) */
  if (!$("#kpiRedacao")) {
    const kpis = $(".lab-kpis");
    const card = document.createElement("div");
    card.className = "kpi";
    card.innerHTML = `<span class="kpi-label">Redação (média)</span><strong id="kpiRedacao">—</strong><span class="kpi-note" id="kpiRedacaoNote">meta ${REDACAO_GOAL} pts</span>`;
    kpis.appendChild(card);
  }

  $("#labDisc").addEventListener("change", toggleRedacaoField);
  toggleRedacaoField();

  $$(".seg-btn").forEach(btn => btn.addEventListener("click", () => {
    range = btn.dataset.range;
    $$(".seg-btn").forEach(b => { const on = b === btn; b.classList.toggle("is-active", on); b.setAttribute("aria-pressed", String(on)); });
    renderPie();
  }));
  $("#labIncludeTaf").addEventListener("change", renderPie);

  const svg = $("#labDonut");
  svg.addEventListener("mouseover", e => { const p = e.target.closest("path.slice"); if (p) { hideTip(); showTip(p, p._info); } });
  svg.addEventListener("mouseleave", hideTip);
  svg.addEventListener("focusin", e => { const p = e.target.closest("path.slice"); if (p) { hideTip(); showTip(p, p._info); } });
  svg.addEventListener("focusout", hideTip);
  svg.addEventListener("keydown", e => { if (e.key === "Escape") hideTip(); });

  $("#labTableBody").addEventListener("mouseover", e => {
    const tr = e.target.closest("tr");
    const p = tr && svg.querySelector(`path.slice[data-key="${tr.dataset.key}"]`);
    if (p) { hideTip(); showTip(p, p._info); } else hideTip();
  });
  $("#labTableBody").addEventListener("mouseleave", hideTip);

  const days = $("#dayBars");
  days.addEventListener("mouseover", e => { const b = e.target.closest(".day-col"); if (b) dayTipShow(b); });
  days.addEventListener("focusin", e => { const b = e.target.closest(".day-col"); if (b) dayTipShow(b); });
  days.addEventListener("click", e => { const b = e.target.closest(".day-col"); if (b) dayTipShow(b); });
  const hideDay = () => { const t = $("#dayTip"); if (t) t.hidden = true; };
  days.addEventListener("mouseleave", hideDay);
  days.addEventListener("focusout", hideDay);

  $("#dailyGoal").addEventListener("change", e => {
    const v = Math.round(Number(e.target.value));
    if (!Number.isFinite(v) || v < 30 || v > 720) { e.target.value = goalMin(); toast("Meta entre 30 e 720 minutos"); return; }
    S.lab.goalMin = v;
    save("lab");
  });

  $("#labForm").addEventListener("submit", onSubmit);
  $("#sessionList").addEventListener("click", e => {
    const b = e.target.closest("[data-del]");
    if (!b) return;
    const entry = entries().find(x => x.id === b.dataset.del);
    if (!entry || !confirm("Apagar este registro de " + discMeta(entry.disc).label + " (" + fmtDur(entry.sec || 0) + ")?")) return;
    S.lab.entries = entries().filter(x => x.id !== entry.id);
    save("lab");
  });
  $("#sessionMore").addEventListener("click", () => { shown += 15; renderSessions(); });

  onChange(name => { if (name === "lab") renderAll(); });
  ready = true;
  renderAll();
}

export function onShow() {
  $("#labDate").max = todayISO();
  if (!$("#labDate").value) $("#labDate").value = todayISO();
  renderAll();
}