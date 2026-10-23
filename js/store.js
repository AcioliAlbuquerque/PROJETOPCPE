/* ==========================================================================
   OPERAÇÃO PCPE — store.js
   Estado compartilhado + persistência (cache local por usuário + Firestore).

   Três "fatias" independentes, cada uma em um documento do Firestore:
     progress -> pcpe_progress/{uid}  (missões, XP, sequência)   [já existia]
     lab      -> pcpe_lab/{uid}       (horas e questões)
     cards    -> pcpe_cards/{uid}     (baralhos de flashcards)

   Regra de conflito: vale a cópia com o carimbo _ts mais novo (último que salvou).
   ========================================================================== */
import { db } from "../firebase-config.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { todayISO, diffDaysISO } from "./config.js";

const SLICES = {
  progress: { col: "pcpe_progress", local: "pcpe-agente-quest-save-v1", defaults: () => ({ completed: {}, streak: { count: 0, lastDate: null } }) },
  lab:      { col: "pcpe_lab",      local: "pcpe-lab-v1",               defaults: () => ({ entries: [] }) },
  cards:    { col: "pcpe_cards",    local: "pcpe-cards-v1",             defaults: () => ({ decks: [] }) },
};
const MAX_DOC_BYTES = 900000; // o Firestore aceita ~1 MB por documento

export const S = { progress: SLICES.progress.defaults(), lab: SLICES.lab.defaults(), cards: SLICES.cards.defaults() };
export const sync = { status: "local", msg: "" };

let user = null;
let timer = null;
const dirty = new Set();
const syncSubs = new Set();
const changeSubs = new Set();

export function onSync(fn) { syncSubs.add(fn); fn(sync); return () => syncSubs.delete(fn); }
export function onChange(fn) { changeSubs.add(fn); return () => changeSubs.delete(fn); }
function setStatus(status, msg = "") { sync.status = status; sync.msg = msg; syncSubs.forEach(f => f(sync)); }
function emit(name) { changeSubs.forEach(f => f(name)); }

function normalize(name, obj) {
  const base = SLICES[name].defaults();
  const out = Object.assign(base, obj && typeof obj === "object" ? obj : {});
  if (name === "progress") {
    if (!out.completed || typeof out.completed !== "object") out.completed = {};
    if (!out.streak || typeof out.streak !== "object") out.streak = { count: 0, lastDate: null };
  }
  if (name === "lab" && !Array.isArray(out.entries)) out.entries = [];
  if (name === "cards" && !Array.isArray(out.decks)) out.decks = [];
  return out;
}

const localKey = name => user ? SLICES[name].local + ":" + user.uid : null;
function readLocal(name) {
  const key = localKey(name);
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (e) { return null; }
}
function writeLocal(name) {
  const key = localKey(name);
  if (!key) return;
  try { localStorage.setItem(key, JSON.stringify(S[name])); } catch (e) { /* cota cheia ou bloqueado */ }
}

function explain(e) {
  const code = e && (e.code || e.message) || "";
  if (code.includes("permission-denied")) return "Sem permissão no Firestore. Cole as regras do arquivo firestore.rules em Firebase > Firestore > Regras.";
  if (code.includes("too-large")) return "Dados grandes demais para a nuvem (limite de 1 MB por documento). Exporte um backup e apague baralhos antigos.";
  if (code.includes("unavailable") || code.includes("network") || code.includes("offline")) return "Sem conexão. Tudo está salvo neste navegador e sobe quando a internet voltar.";
  return "Falha ao sincronizar (" + (code || "erro desconhecido") + "). Tudo continua salvo neste navegador.";
}

/* Carrega cache local + nuvem de cada fatia. Chamar depois do login.
   O cache local entra primeiro e na hora; a nuvem só complementa depois (ela pode demorar). */
export async function loadAll(u) {
  user = u;
  setStatus("saving", "Carregando…");
  const names = Object.keys(SLICES);
  names.forEach(name => { S[name] = normalize(name, readLocal(name)); });
  names.forEach(emit);
  let firstError = null;
  for (const name of names) {
    try {
      const snap = await getDoc(doc(db, SLICES[name].col, user.uid));
      if (snap.exists()) {
        const cloud = normalize(name, snap.data());
        if ((S[name]._ts || 0) > (cloud._ts || 0)) dirty.add(name);   // o que está aqui é mais novo (ou foi editado agora): sobe
        else { S[name] = cloud; writeLocal(name); }
      } else {
        dirty.add(name);                                              // ainda não existe na nuvem: cria
      }
    } catch (e) {
      firstError = firstError || e;
    }
    emit(name);
  }
  if (firstError) setStatus("error", explain(firstError));
  else await flushNow();
}

/* Salva uma fatia: cache local na hora, nuvem em ~1 s. */
export function save(name) {
  S[name]._ts = Date.now();
  writeLocal(name);
  dirty.add(name);
  setStatus("saving");
  clearTimeout(timer);
  timer = setTimeout(flushNow, 900);
  emit(name);
}

export async function flushNow() {
  clearTimeout(timer);
  if (!user) return;
  if (dirty.size === 0) { if (sync.status === "saving") setStatus("ok"); return; }
  const names = Array.from(dirty);
  dirty.clear();
  let firstError = null;
  await Promise.all(names.map(async name => {
    try {
      const payload = JSON.parse(JSON.stringify(S[name]));
      if (JSON.stringify(payload).length > MAX_DOC_BYTES) { const err = new Error("too-large"); err.code = "too-large"; throw err; }
      await setDoc(doc(db, SLICES[name].col, user.uid), payload);
    } catch (e) {
      firstError = firstError || e;
      dirty.add(name);
    }
  }));
  if (firstError) setStatus("error", explain(firstError)); else setStatus("ok");
}

window.addEventListener("online", () => { if (dirty.size) flushNow(); });
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden" && dirty.size) flushNow(); });
window.addEventListener("pagehide", () => { if (dirty.size) flushNow(); });

/* ---------- Sequência de estudo ---------- */
export function bumpStreak(dateISO = todayISO()) {
  if (dateISO !== todayISO()) return;
  const st = S.progress.streak;
  if (st.lastDate === dateISO) return;
  if (st.lastDate) st.count = diffDaysISO(st.lastDate, dateISO) === 1 ? st.count + 1 : 1;
  else st.count = 1;
  st.lastDate = dateISO;
}
/* A sequência só vale se o último dia de estudo foi hoje ou ontem. */
export function effectiveStreak() {
  const st = S.progress.streak;
  if (!st.lastDate) return 0;
  return diffDaysISO(st.lastDate, todayISO()) <= 1 ? st.count : 0;
}

/* ---------- Backup ---------- */
export function exportAll() {
  return { app: "pcpe-quest", version: 2, exportedAt: new Date().toISOString(), progress: S.progress, lab: S.lab, cards: S.cards };
}

/* Aceita o backup novo (version 2) e o antigo (só completed/streak). */
export function importAll(obj) {
  if (!obj || typeof obj !== "object") throw new Error("formato");
  let touched = [];
  if (obj.progress || obj.lab || obj.cards) {
    if (obj.progress) { S.progress = normalize("progress", obj.progress); touched.push("progress"); }
    if (obj.lab)      { S.lab = normalize("lab", obj.lab); touched.push("lab"); }
    if (obj.cards)    { S.cards = normalize("cards", obj.cards); touched.push("cards"); }
  } else if (obj.completed && typeof obj.completed === "object") {
    S.progress = normalize("progress", { completed: obj.completed, streak: obj.streak });
    touched.push("progress");
  } else {
    throw new Error("formato");
  }
  touched.forEach(save);
  return touched;
}

export function resetProgress() {
  S.progress = SLICES.progress.defaults();
  save("progress");
}