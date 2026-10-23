/* ==========================================================================
   OPERAÇÃO PCPE — config.js
   Constantes e utilitários compartilhados por todos os módulos.
   ========================================================================== */

/* ---------- Datas da campanha ---------- */
export const EXAM_DATE = new Date("2027-03-07T14:00:00-03:00"); // horário exato ainda não divulgado
export const EXAM_ISO = "2027-03-07";
export const CAMPAIGN_START = new Date("2026-10-05T00:00:00-03:00");
export const CAMPAIGN_START_ISO = "2026-10-05";
export const RISK_FROM = new Date("2026-11-16T00:00:00-03:00"); // fim da Fase 1: aí o alerta de "risco" passa a valer
export const DAILY_GOAL_MIN = 180; // 3 horas líquidas por dia

export const EDITAL_PDF = "https://cdn.cebraspe.org.br/concursos/PC_PE_26/arquivos/C8954198EED687EE933077C3EC25BFDB828354459F7AA3D175D6265BF6DF10C9.pdf";
export const EDITAL_SITE = "https://www.cebraspe.org.br/concursos/pc_pe_26";

/* ---------- Disciplinas ----------
   group: "estudo" entra na meta de 3h/dia; "taf" é treino físico. */
export const DISCIPLINES = {
  dir_constitucional:   { label: "Direito Constitucional",   short: "Constitucional", module: "P1",  group: "estudo", color: "#00e5ff" },
  dir_administrativo:   { label: "Direito Administrativo",   short: "Administrativo", module: "P1",  group: "estudo", color: "#3b82f6" },
  dir_penal:            { label: "Direito Penal",            short: "Penal",          module: "P1",  group: "estudo", color: "#ff4d6d" },
  dir_processual_penal: { label: "Direito Processual Penal", short: "Proc. Penal",    module: "P1",  group: "estudo", color: "#ff9f1c" },
  leg_estadual:         { label: "Legislação Estadual",      short: "Leg. Estadual",  module: "P1",  group: "estudo", color: "#39ff9c" },
  portugues:            { label: "Língua Portuguesa",        short: "Português",      module: "P2",  group: "estudo", color: "#a56bff" },
  informatica:          { label: "Informática",              short: "Informática",    module: "P2",  group: "estudo", color: "#ff7ad9" },
  raciocinio_logico:    { label: "Raciocínio Lógico",        short: "Rac. Lógico",    module: "P2",  group: "estudo", color: "#ffe14d" },
  contabilidade:        { label: "Contabilidade Geral",      short: "Contabilidade",  module: "P2",  group: "estudo", color: "#c28f6b" },
  estatistica:          { label: "Estatística",              short: "Estatística",    module: "P2",  group: "estudo", color: "#84cc16" },
  redacao:              { label: "Redação / Atualidades",    short: "Redação",        module: "P3",  group: "estudo", color: "#f4a6a6" },
  barra:                { label: "Barra (flexão)",           short: "Barra",          module: "TAF", group: "taf",    color: "#94a3b8" },
  corrida:              { label: "Corrida 12min",            short: "Corrida",        module: "TAF", group: "taf",    color: "#e2e8f0" },
  natacao:              { label: "Natação 50m",              short: "Natação",        module: "TAF", group: "taf",    color: "#7dd3fc" },
  salto:                { label: "Salto horizontal",         short: "Salto",          module: "TAF", group: "taf",    color: "#c4b5a0" },
};

/* Usada só no Lab: simulados e revisões que não pertencem a uma matéria só. */
export const GENERAL = { label: "Simulado / revisão geral", short: "Geral", module: "Geral", group: "estudo", color: "#cbd5e1" };

export function discMeta(key) {
  return DISCIPLINES[key] || (key === "geral" ? GENERAL : { label: key || "—", short: key || "—", module: "?", group: "estudo", color: "#64748b" });
}

/* Ordem e rótulos dos grupos nos <select> */
export const DISC_OPTGROUPS = [
  { label: "P1 — Noções de Direito", keys: ["dir_constitucional", "dir_administrativo", "dir_penal", "dir_processual_penal", "leg_estadual"] },
  { label: "P2 — Conhecimentos Específicos", keys: ["portugues", "informatica", "raciocinio_logico", "contabilidade", "estatistica"] },
  { label: "P3 — Redação", keys: ["redacao"] },
  { label: "Geral", keys: ["geral"] },
  { label: "TAF — treino físico", keys: ["barra", "corrida", "natacao", "salto"] },
];

export function discOptionsHTML(selected, { withEmpty = false, emptyLabel = "Sem disciplina" } = {}) {
  let html = withEmpty ? `<option value="">${esc(emptyLabel)}</option>` : "";
  DISC_OPTGROUPS.forEach(g => {
    html += `<optgroup label="${esc(g.label)}">` + g.keys.map(k =>
      `<option value="${k}"${k === selected ? " selected" : ""}>${esc(discMeta(k).label)}</option>`).join("") + `</optgroup>`;
  });
  return html;
}

export const KINDS = {
  teoria:   "Teoria",
  questoes: "Questões",
  simulado: "Simulado",
  revisao:  "Revisão",
  flash:    "Flashcards",
  treino:   "Treino físico",
};

export function kindOptionsHTML(selected) {
  return Object.entries(KINDS).map(([k, v]) => `<option value="${k}"${k === selected ? " selected" : ""}>${v}</option>`).join("");
}

/* ---------- Semana-tipo: 3h líquidas por dia (+ pausas de 10 min entre blocos) ----------
   Baseada no template semanal da Fase 1/2. Ajuste os minutos aqui se quiser. */
export const BREAK_MIN = 10;
export const WEEK = [
  { dia: "Seg", taf: "Barra — técnica/força", blocks: [
    { disc: "dir_constitucional", kind: "teoria",   min: 120, nome: "Teoria + lei seca" },
    { disc: "dir_constitucional", kind: "questoes", min: 60,  nome: "Questões da banca" } ] },
  { dia: "Ter", taf: "Corrida", blocks: [
    { disc: "dir_administrativo", kind: "teoria",   min: 120, nome: "Teoria" },
    { disc: "dir_administrativo", kind: "questoes", min: 60,  nome: "Questões da banca" } ] },
  { dia: "Qua", taf: "Barra — variação", blocks: [
    { disc: "dir_penal", kind: "teoria",   min: 120, nome: "Teoria + leis especiais" },
    { disc: "dir_penal", kind: "questoes", min: 60,  nome: "Questões da banca" } ] },
  { dia: "Qui", taf: "Corrida", blocks: [
    { disc: "dir_processual_penal", kind: "teoria",   min: 90, nome: "Teoria" },
    { disc: "leg_estadual",         kind: "teoria",   min: 60, nome: "Leis + flashcards" },
    { disc: "dir_processual_penal", kind: "questoes", min: 30, nome: "Questões da banca" } ] },
  { dia: "Sex", taf: "Barra + salto", blocks: [
    { disc: "portugues", kind: "teoria",   min: 120, nome: "Gramática e interpretação" },
    { disc: "portugues", kind: "questoes", min: 60,  nome: "Questões da banca" } ] },
  { dia: "Sáb", taf: "Corrida longa + natação", blocks: [
    { disc: "informatica",       kind: "teoria",  min: 80, nome: "Teoria + prática" },
    { disc: "raciocinio_logico", kind: "teoria",  min: 80, nome: "Teoria + exercícios" },
    { disc: "geral",             kind: "revisao", min: 20, nome: "Caderno de erros" } ] },
  { dia: "Dom", taf: "Descanso", blocks: [
    { disc: "contabilidade", kind: "teoria",  min: 60, nome: "Teoria + lançamentos" },
    { disc: "estatistica",   kind: "teoria",  min: 60, nome: "Teoria + exercícios" },
    { disc: "redacao",       kind: "teoria",  min: 60, nome: "Redação + revisão geral" } ] },
];

/* ---------- Utilitários de data ---------- */
export const pad = n => String(n).padStart(2, "0");
export function toISO(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
export const todayISO = () => toISO(new Date());
export function parseISO(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d, 12); }
export function addDaysISO(s, n) { const d = parseISO(s); d.setDate(d.getDate() + n); return toISO(d); }
export function diffDaysISO(a, b) { return Math.round((parseISO(b) - parseISO(a)) / 86400000); }
export function fmtDM(iso) { return iso.slice(8, 10) + "/" + iso.slice(5, 7); }
export function fmtDMY(iso) { return iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4); }
export function weekdayIndex(date = new Date()) { return (date.getDay() + 6) % 7; } // 0 = segunda

/* ---------- Utilitários de tempo ---------- */
export function fmtDur(sec) {            // "2h05" ou "35min"
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h ? h + "h" + pad(m) : m + "min";
}
export function fmtClock(sec) {          // "01:05:09"
  sec = Math.max(0, Math.floor(sec));
  return pad(Math.floor(sec / 3600)) + ":" + pad(Math.floor((sec % 3600) / 60)) + ":" + pad(sec % 60);
}
export function hhmm(totalMin) { return pad(Math.floor(totalMin / 60) % 24) + ":" + pad(totalMin % 60); }
export function toMin(hm) { const [h, m] = hm.split(":").map(Number); return h * 60 + m; }

/* ---------- DOM ---------- */
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
export function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
export function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

let toastTimer = null;
export function toast(msg, ms = 2200) {
  const el = document.getElementById("xpToast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), ms);
}

export function downloadFile(name, text, type = "application/json") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}