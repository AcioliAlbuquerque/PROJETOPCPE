/* ==========================================================================
   OPERAÇÃO PCPE — timer.js
   Cronômetro / regressivo com tela cheia. Sobrevive a recarregar a página
   (guarda carimbos de hora, não "ticks") e vira um registro no Laboratório.
   ========================================================================== */
import { DISCIPLINES, $, $$, uid, toast, todayISO, fmtClock, fmtDur, discMeta, discOptionsHTML, kindOptionsHTML, KINDS } from "./config.js";
import { S, save, bumpStreak } from "./store.js";

const DEFAULTS = { disc: "dir_constitucional", kind: "questoes", mode: "up", preset: "240", custom: 60, beep: true, wake: true,
  running: false, startedAt: 0, accMs: 0, startDate: "", done: false };

let st = Object.assign({}, DEFAULTS);
let key = null;
let tickId = null;
let wakeLock = null;
let audio = null;
let resumeAfterDialog = false;

const panel = () => $("#timerPanel");

/* ---------- persistência local (por conta) ---------- */
function load(user) {
  key = "pcpe-timer-v1:" + user.uid;
  try { st = Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(key) || "{}")); } catch (e) { st = Object.assign({}, DEFAULTS); }
  if (!DISCIPLINES[st.disc] && st.disc !== "geral") st.disc = DEFAULTS.disc;
  if (!KINDS[st.kind]) st.kind = DEFAULTS.kind;
}
function persist() { if (key) { try { localStorage.setItem(key, JSON.stringify(st)); } catch (e) { /* sem espaço ou bloqueado */ } } }

/* ---------- tempo ---------- */
const targetMs = () => (st.preset === "custom" ? Math.max(1, Math.min(720, Number(st.custom) || 60)) : Number(st.preset) || 240) * 60000;
function elapsedMs() {
  let ms = st.accMs + (st.running ? Date.now() - st.startedAt : 0);
  if (st.mode === "down") ms = Math.min(ms, targetMs());
  return Math.max(0, ms);
}
const shownSec = () => (st.mode === "down" ? Math.ceil((targetMs() - elapsedMs()) / 1000) : Math.floor(elapsedMs() / 1000));

/* ---------- som e tela ligada ---------- */
function unlockAudio() {
  try {
    if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === "suspended") audio.resume();
  } catch (e) { audio = null; }
}
function beep() {
  if (!st.beep || !audio) return;
  try {
    [0, 0.45, 0.9].forEach(t => {
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = "sine"; o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, audio.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.35, audio.currentTime + t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + t + 0.35);
      o.connect(g); g.connect(audio.destination);
      o.start(audio.currentTime + t); o.stop(audio.currentTime + t + 0.4);
    });
  } catch (e) { /* sem áudio */ }
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
}
async function wantWake() {
  if (!("wakeLock" in navigator)) return;
  try {
    if (st.running && st.wake && !wakeLock && document.visibilityState === "visible") {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => { wakeLock = null; });
    } else if ((!st.running || !st.wake) && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch (e) { wakeLock = null; }
}

/* ---------- desenho ---------- */
function render() {
  const sec = shownSec();
  const clock = fmtClock(sec);
  const el = elapsedMs();
  const stage = $("#timerStage");
  $("#timerReadout").textContent = clock;
  const started = st.running || el > 0;
  stage.classList.toggle("is-running", st.running);
  stage.classList.toggle("is-paused", !st.running && started && !st.done);
  stage.classList.toggle("is-done", st.done);

  const meta = discMeta(st.disc);
  $("#timerDiscLabel").textContent = meta.label;
  stage.style.setProperty("--disc-color", meta.color);
  $("#timerKindLabel").textContent = (KINDS[st.kind] || "") + " · " + (st.mode === "down" ? "regressivo de " + fmtDur(targetMs() / 1000) : "cronômetro");
  $("#timerSub").textContent = st.done ? "Tempo esgotado. Salve a sessão ou zere." :
    st.running ? (st.mode === "down" ? "Estudado: " + fmtDur(el / 1000) : "Em andamento") :
    started ? "Pausado" : "Pronto para começar";
  $("#timerToggle").textContent = st.running ? "⏸ Pausar" : started && !st.done ? "▶ Continuar" : "▶ Iniciar";
  $("#timerToggle").disabled = st.done;
  $("#timerSave").disabled = el < 1000;
  $("#timerReset").disabled = !started && !st.done;

  // modo e duração só mudam com o cronômetro zerado
  const locked = started || st.done;
  ["timerModeUp", "timerModeDown", "timerPreset", "timerCustom"].forEach(id => { $("#" + id).disabled = locked; });

  // mini cronômetro na barra de abas
  const viewHidden = $("#view-cronometro").hidden;
  const mini = $("#miniTimer");
  mini.hidden = !(viewHidden && started);
  mini.classList.toggle("is-paused", !st.running);
  $("#miniTimerTime").textContent = clock;
  $("#miniTimerDisc").textContent = meta.short;
}

function tick() {
  if (st.running && st.mode === "down" && elapsedMs() >= targetMs()) {   // zerou
    st.accMs = targetMs(); st.running = false; st.startedAt = 0; st.done = true;
    persist(); stopTick(); wantWake(); beep();
    toast("⏱ Tempo esgotado", 3500);
  }
  render();
}
function startTick() { if (!tickId) tickId = setInterval(tick, 250); }
function stopTick() { clearInterval(tickId); tickId = null; }

/* ---------- ações ---------- */
function toggle() {
  if (st.done) return;
  unlockAudio();
  if (st.running) {
    st.accMs = elapsedMs(); st.running = false; st.startedAt = 0; stopTick();
  } else {
    if (!st.startDate || st.accMs === 0) st.startDate = todayISO();
    st.running = true; st.startedAt = Date.now(); startTick();
  }
  persist(); wantWake(); render();
}
function reset(ask = true) {
  if (ask && elapsedMs() > 60000 && !confirm("Zerar o cronômetro sem salvar? Os " + fmtDur(elapsedMs() / 1000) + " cronometrados serão perdidos.")) return;
  st.running = false; st.startedAt = 0; st.accMs = 0; st.done = false; st.startDate = "";
  stopTick(); persist(); wantWake(); render();
}

/* ---------- salvar sessão ---------- */
function openSave() {
  if (elapsedMs() < 1000) return;
  resumeAfterDialog = st.running;
  if (st.running) toggle();                                    // pausa enquanto você preenche
  const min = Math.max(1, Math.round(elapsedMs() / 60000));
  $("#sdSummary").textContent = discMeta(st.disc).label + " · " + (KINDS[st.kind] || "") + " · cronometrado: " + fmtClock(elapsedMs() / 1000);
  $("#sdMin").value = min; $("#sdQ").value = 0; $("#sdHit").value = 0; $("#sdNote").value = "";
  $("#sdMsg").textContent = ""; $("#sdMsg").className = "login-msg";
  $("#saveDialog").showModal();
  $("#sdQ").focus();
}
function closeSave(resume) {
  const d = $("#saveDialog");
  if (d.open) d.close();
  if (resume && resumeAfterDialog && !st.running && !st.done) toggle();
  resumeAfterDialog = false;
}
function submitSave(ev) {
  ev.preventDefault();
  const min = Math.floor(Number($("#sdMin").value) || 0), q = Math.floor(Number($("#sdQ").value) || 0), hit = Math.floor(Number($("#sdHit").value) || 0);
  const fail = t => { $("#sdMsg").textContent = t; $("#sdMsg").className = "login-msg is-error"; };
  if (min < 1 || min > 1440) return fail("O tempo precisa ficar entre 1 e 1440 minutos.");
  if (q < 0 || hit < 0) return fail("Questões e acertos não podem ser negativos.");
  if (hit > q) return fail("Os acertos não podem passar de " + q + " questões.");
  const date = st.startDate || todayISO();
  if (!Array.isArray(S.lab.entries)) S.lab.entries = [];
  S.lab.entries.push({ id: uid(), date, disc: st.disc, kind: st.kind, sec: min * 60, q, hit, note: $("#sdNote").value.trim().slice(0, 120), ts: Date.now() });
  bumpStreak(date);
  save("lab");
  save("progress");
  resumeAfterDialog = false;
  $("#saveDialog").close();
  reset(false);
  toast("Sessão salva: " + fmtDur(min * 60) + (q ? " · " + q + " questões" : ""));
}

/* ---------- tela cheia ---------- */
const fsActive = () => document.fullscreenElement === panel() || panel().classList.contains("is-fake-fs");
function syncFsButton() {
  const on = fsActive();
  const b = $("#timerFullscreen");
  b.setAttribute("aria-pressed", String(on));
  b.textContent = on ? "✕ Sair da tela cheia" : "⛶ Tela cheia";
}
async function toggleFullscreen() {
  const p = panel();
  if (fsActive()) {
    if (document.fullscreenElement) { try { await document.exitFullscreen(); } catch (e) { /* já saiu */ } }
    p.classList.remove("is-fake-fs");
  } else if (p.requestFullscreen) {
    try { await p.requestFullscreen(); } catch (e) { p.classList.add("is-fake-fs"); }
  } else {
    p.classList.add("is-fake-fs");                              // iPhone e afins: ocupa a janela toda
  }
  syncFsButton();
  $("#timerToggle").focus();                                      // Espaço volta a pausar/continuar, em vez de reabrir a tela cheia
}

/* ---------- ligações ---------- */
function syncConfigUI() {
  $("#timerDisc").value = st.disc;
  $("#timerType").value = st.kind;
  $("#timerModeUp").checked = st.mode === "up";
  $("#timerModeDown").checked = st.mode === "down";
  $("#timerPreset").value = st.preset;
  $("#timerCustom").value = st.custom;
  $("#timerBeep").checked = !!st.beep;
  $("#timerWake").checked = !!st.wake;
  $("#timerPresetField").hidden = st.mode !== "down";
  $("#timerCustomField").hidden = !(st.mode === "down" && st.preset === "custom");
}

export function init({ user }) {
  load(user);
  $("#timerDisc").innerHTML = discOptionsHTML(st.disc);
  $("#timerType").innerHTML = kindOptionsHTML(st.kind);
  syncConfigUI();

  $("#timerToggle").addEventListener("click", toggle);
  $("#timerSave").addEventListener("click", openSave);
  $("#timerReset").addEventListener("click", () => reset(true));
  $("#timerFullscreen").addEventListener("click", toggleFullscreen);
  document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement) panel().classList.remove("is-fake-fs"); syncFsButton(); });

  $("#timerDisc").addEventListener("change", e => {
    st.disc = e.target.value;
    const taf = discMeta(st.disc).group === "taf";
    if (taf) st.kind = "treino"; else if (st.kind === "treino") st.kind = "questoes";
    $("#timerType").value = st.kind;
    persist(); render();
  });
  $("#timerType").addEventListener("change", e => { st.kind = e.target.value; persist(); render(); });
  $$("input[name=timerMode]").forEach(r => r.addEventListener("change", () => { st.mode = r.value; persist(); syncConfigUI(); render(); }));
  $("#timerPreset").addEventListener("change", e => { st.preset = e.target.value; persist(); syncConfigUI(); render(); });
  $("#timerCustom").addEventListener("change", e => {
    const v = Math.round(Number(e.target.value));
    st.custom = Number.isFinite(v) ? Math.max(1, Math.min(720, v)) : 60;
    e.target.value = st.custom; persist(); render();
  });
  $("#timerBeep").addEventListener("change", e => { st.beep = e.target.checked; persist(); if (st.beep) unlockAudio(); });
  $("#timerWake").addEventListener("change", e => { st.wake = e.target.checked; persist(); wantWake(); });

  $("#sdForm").addEventListener("submit", submitSave);
  $("#sdKeep").addEventListener("click", () => closeSave(true));
  $("#sdDiscard").addEventListener("click", () => {
    if (!confirm("Descartar estes " + fmtDur(elapsedMs() / 1000) + " sem salvar?")) return;
    closeSave(false); reset(false);
  });
  $("#saveDialog").addEventListener("cancel", e => { e.preventDefault(); closeSave(true); });   // Esc = continuar

  // atalhos: só valem na tela do cronômetro e fora dos campos de texto
  document.addEventListener("keydown", e => {
    if ($("#view-cronometro").hidden || $("#saveDialog").open || e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = (e.target.tagName || "").toLowerCase();
    if (["input", "select", "textarea", "button", "a"].includes(tag)) return;
    if (e.code === "Space") { e.preventDefault(); toggle(); }
    else if (e.key === "f" || e.key === "F") { e.preventDefault(); toggleFullscreen(); }
  });

  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { wantWake(); tick(); } });
  window.addEventListener("pagehide", persist);

  // retoma o que estava rodando antes de recarregar
  if (st.running) {
    if (st.mode === "down" && elapsedMs() >= targetMs()) { st.accMs = targetMs(); st.running = false; st.startedAt = 0; st.done = true; persist(); }
    else { startTick(); wantWake(); }
  }
  syncFsButton();
  render();
}

export function onShow() { render(); }