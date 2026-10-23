/* ==========================================================================
   OPERAÇÃO PCPE — flashcards.js
   Arraste um PDF (ou TXT/MD/CSV/JSON), confira os cartões e estude com repetição espaçada.
   Baralho: { id, name, disc, created, cards:[{ id, f, b, due, ivl, ease, reps, lapses }] }
   ========================================================================== */
import { $, $$, esc, uid, toast, todayISO, addDaysISO, fmtDMY, discMeta, discOptionsHTML, downloadFile } from "./config.js";
import { S, save, onChange, bumpStreak } from "./store.js";

const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
const PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
const MAX_FILE_MB = 30, MAX_CARDS = 2000, MAX_F = 2000, MAX_B = 4000, MAX_BYTES = 850000;
const PREVIEW_LIMIT = 200;

/* ==========================================================================
   LEITURA DOS ARQUIVOS
   ========================================================================== */
let pdfLib = null;
async function loadPdfJs() {
  if (pdfLib) return pdfLib;
  if (!window.pdfjsLib) {
    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = PDFJS; s.onload = resolve; s.onerror = () => reject(new Error("cdn"));
      document.head.appendChild(s);
    });
  }
  pdfLib = window.pdfjsLib;
  // o navegador não deixa criar um Worker direto de outro domínio: um "embrulho" local resolve
  const blob = new Blob([`importScripts("${PDFJS_WORKER}");`], { type: "text/javascript" });
  pdfLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(blob);
  return pdfLib;
}

/* Agrupa os pedaços de texto do PDF em linhas (mesma altura = mesma linha). */
function pageToLines(items) {
  const rows = [];
  items.forEach(it => {
    if (!it.str || !it.transform) return;
    const y = it.transform[5], x = it.transform[4], h = it.height || Math.abs(it.transform[3]) || 10;
    let row = rows.find(r => Math.abs(r.y - y) <= Math.max(2, h * 0.4));
    if (!row) { row = { y, parts: [] }; rows.push(row); }
    row.parts.push({ x, w: it.width || 0, s: it.str });
  });
  rows.sort((a, b) => b.y - a.y);
  return rows.map(r => {
    r.parts.sort((a, b) => a.x - b.x);
    let out = "", end = null;
    r.parts.forEach(p => {
      if (end !== null && p.x - end > 1.5 && !/\s$/.test(out) && !/^\s/.test(p.s)) out += " ";
      out += p.s; end = p.x + p.w;
    });
    return out.replace(/\s+/g, " ").trim();
  }).filter(Boolean);
}

/* A senha digitada fica só na memória desta aba (some ao fechar ou recarregar a página).
   Nunca vai para o código, para o GitHub nem para a nuvem. */
let knownPassword = "";
let userId = "";

async function openPdfDoc(blob, name) {
  const lib = await loadPdfJs();
  const task = lib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), password: knownPassword || undefined });
  let cancelled = false;
  task.onPassword = (update, reason) => {
    const asked = prompt(
      (reason === 2 ? "Senha incorreta para “" : "O PDF “") + name + (reason === 2 ? "”. Digite de novo:" : "” tem senha. Digite a senha:") +
      "\n\n(Cancelar pula este arquivo)");
    if (asked === null) { cancelled = true; task.destroy(); return; }
    knownPassword = asked;
    update(asked);
  };
  try { return await task.promise; }
  catch (e) { if (cancelled) throw new Error("senha-cancelada"); throw e; }
}

/* Libera o documento e o "worker" do PDF (funciona em versões diferentes do pdf.js). */
function destroyDoc(pdf) {
  try {
    if (pdf && pdf.loadingTask && pdf.loadingTask.destroy) pdf.loadingTask.destroy();
    else if (pdf && pdf.destroy) pdf.destroy();
  } catch (e) { /* já liberado */ }
}

async function readPdf(file, onProgress) {
  const pdf = await openPdfDoc(file, file.name);
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    onProgress && onProgress(i, pdf.numPages);
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    pages.push(pageToLines(tc.items).join("\n"));
  }
  destroyDoc(pdf);
  return pages;
}

/* O PDF original fica guardado no próprio navegador (IndexedDB). Ele NÃO vai para a nuvem:
   o limite do Firebase é de 1 MB por documento. */
function idb() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open("pcpe-pdfs", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("files");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function idbDo(mode, fn) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("files", mode);
    const req = fn(tx.objectStore("files"));
    tx.oncomplete = () => resolve(req && req.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
const pdfKey = id => userId + ":" + id;
const idbPut = (id, blob) => idbDo("readwrite", st => st.put(blob, pdfKey(id)));
const idbGet = id => idbDo("readonly", st => st.get(pdfKey(id)));
const idbDel = id => idbDo("readwrite", st => st.delete(pdfKey(id)));

/* ==========================================================================
   EXTRAÇÃO DOS CARTÕES (funções puras: texto entra, cartões saem)
   ========================================================================== */
const clean = s => String(s || "").replace(/\s+/g, " ").trim();
const allLines = pages => pages.join("\n").replace(/\r/g, "").replace(/ /g, " ").split("\n").map(l => l.trim());

const RX_FRONT = /^(?:pergunta|frente|quest[aã]o)\s*\d*\s*[:：]\s*(.*)$|^p\s*\d*\s*[:：]\s*(.*)$/i;
const RX_BACK = /^(?:resposta|verso|resp\.?|gabarito)\s*\d*\s*[:：]\s*(.*)$|^r\s*\d*\s*[:：]\s*(.*)$/i;

export function parseQA(lines) {
  const out = []; let cur = null, field = "f";
  const flush = () => { if (cur && clean(cur.f) && clean(cur.b)) out.push({ f: clean(cur.f), b: clean(cur.b) }); };
  lines.forEach(l => {
    let m;
    if ((m = l.match(RX_FRONT))) { flush(); cur = { f: m[1] ?? m[2] ?? "", b: "" }; field = "f"; }
    else if ((m = l.match(RX_BACK)) && cur) { cur.b = m[1] ?? m[2] ?? ""; field = "b"; }
    else if (cur && l) cur[field] += " " + l;
  });
  flush();
  return out;
}

const RX_TERM = /^(?:[-•*·]\s*|\d+[.)]\s*)?(.{2,80}?)\s*(?::|\s[–—-]\s)\s*(.{3,})$/;
export function parseTermo(lines) {
  const out = []; let prev = null;
  lines.forEach(l => {
    if (!l) { prev = null; return; }
    const m = l.match(RX_TERM);
    if (m) { prev = { f: clean(m[1]), b: clean(m[2]) }; out.push(prev); }
    else if (prev && !/[.!?]$/.test(prev.b)) prev.b = clean(prev.b + " " + l);
    else prev = null;
  });
  return out;
}

export function parsePergunta(lines) {
  const out = []; let f = "", b = "", state = "f";
  const flush = () => { if (clean(f) && clean(b)) out.push({ f: clean(f), b: clean(b) }); f = ""; b = ""; state = "f"; };
  const endsQ = l => /\?["”')\]]*$/.test(l);
  lines.forEach(l => {
    if (!l) { if (state === "b" && b) flush(); return; }
    if (state === "f") { f += " " + l; if (endsQ(l)) state = "b"; return; }
    if (b && (endsQ(l) || /^\d+[.)]\s/.test(l))) { flush(); f = l; if (endsQ(l)) state = "b"; else state = "f"; return; }
    b += " " + l;
  });
  flush();
  return out;
}

export function parseGabarito(lines) {
  const gIdx = lines.findIndex(l => /^(gabarito|respostas?)\b/i.test(l));
  const qLines = gIdx >= 0 ? lines.slice(0, gIdx) : lines;
  const map = {};
  if (gIdx >= 0) {
    const sec = lines.slice(gIdx).join(" ");
    const rx = /(\d{1,3})\s*[-–.:)=]?\s*\(?([A-Ea-e])\)?(?![A-Za-zÀ-ú])/g;
    let m; while ((m = rx.exec(sec))) map[+m[1]] = m[2].toUpperCase();
  }
  const blocks = []; let cur = null, expect = 1;
  qLines.forEach(l => {
    const m = l.match(/^(?:quest[aã]o\s*)?(\d{1,3})\s*[.)\-–:]\s+(.*)$/i);
    if (m && (+m[1] === expect || (!cur && +m[1] >= 1))) { cur = { n: +m[1], lines: [m[2]] }; blocks.push(cur); expect = +m[1] + 1; }
    else if (cur && l) cur.lines.push(l);
  });
  const out = []; let skipped = 0;
  blocks.forEach(bl => {
    let letter = map[bl.n] || "";
    const kept = [];
    bl.lines.forEach(l => {
      const g = l.match(/^(?:gabarito|resposta|resp\.?)\s*[:：]?\s*\(?([A-Ea-e])\b/i);
      if (g) letter = letter || g[1].toUpperCase(); else kept.push(l);
    });
    if (!letter) { skipped++; return; }
    const stem = [], opts = {}; let last = null;
    kept.forEach(l => {
      const o = l.match(/^\(?([A-Ea-e])[.)]\s+(.*)$/);
      if (o) { last = o[1].toUpperCase(); opts[last] = o[2]; stem.push(l); }
      else if (last) { opts[last] += " " + l; stem[stem.length - 1] += " " + l; }
      else stem.push(l);
    });
    out.push({ f: stem.join("\n"), b: "Gabarito: " + letter + (opts[letter] ? "\n" + letter + ") " + clean(opts[letter]) : "") });
  });
  out.skipped = skipped;
  return out;
}

export function parseCloze(lines) {
  return lines.filter(l => /\{\{.+?\}\}/.test(l)).map(l => ({
    f: clean(l.replace(/\{\{.+?\}\}/g, "[...]")),
    b: clean(l.replace(/\{\{(.+?)\}\}/g, "«$1»")),
  }));
}

export function parsePagina(pages) {
  const out = [];
  pages.forEach((p, i) => {
    const ls = p.split("\n").map(l => l.trim()).filter(Boolean);
    if (ls.length < 2) return;
    out.push({ f: clean(ls[0]).slice(0, 160) || "Página " + (i + 1), b: ls.slice(1).join("\n") });
  });
  return out;
}

export function parseCsv(text) {
  const first = text.split(/\r?\n/).find(l => l.trim()) || "";
  const delim = [";", "\t", ","].map(d => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); cell = ""; rows.push(row); row = []; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  let data = rows.filter(r => r.length >= 2 && clean(r[0]) && clean(r[1]));
  if (data.length && /^(frente|pergunta|front|question|termo)$/i.test(clean(data[0][0]))) data = data.slice(1);
  return data.map(r => ({ f: clean(r[0]), b: String(r[1]).trim() }));
}

/* JSON aceito: lista de {f,b}/{front,back}/{q,a}, ou {name, disc, cards}, ou {decks:[...]} (backup). */
export function parseJsonDecks(obj) {
  const toCards = arr => (Array.isArray(arr) ? arr : []).map(c => ({
    f: clean(c.f ?? c.front ?? c.frente ?? c.q ?? c.pergunta ?? ""), b: String(c.b ?? c.back ?? c.verso ?? c.a ?? c.resposta ?? "").trim(),
  })).filter(c => c.f && c.b);
  if (Array.isArray(obj)) return [{ name: "", disc: "", cards: toCards(obj) }];
  if (obj && Array.isArray(obj.decks)) return obj.decks.map(d => ({ name: String(d.name || ""), disc: String(d.disc || ""), cards: toCards(d.cards) }));
  if (obj && Array.isArray(obj.cards)) return [{ name: String(obj.name || ""), disc: String(obj.disc || ""), cards: toCards(obj.cards) }];
  return [];
}

/* Escolhe sozinho o melhor jeito de extrair. */
export function detectMode(pages) {
  const text = pages.join("\n");
  const lines = allLines(pages);
  if (/\{\{.+?\}\}/.test(text)) return "cloze";
  if (lines.filter(l => RX_FRONT.test(l)).length >= 2 && lines.filter(l => RX_BACK.test(l)).length >= 2) return "qa";
  if (parseGabarito(lines).length >= 2) return "gabarito";
  if (parseTermo(lines).length >= 3) return "termo";
  if (lines.filter(l => /\?["”')\]]*$/.test(l)).length >= 2) return "pergunta";
  return "pagina";
}
const MODE_NAME = { qa: "Pergunta / Resposta", termo: "Termo: definição", pergunta: "Perguntas com “?”", gabarito: "Questões com gabarito", cloze: "Lacunas {{ }}", pagina: "Uma página por cartão", csv: "Tabela (CSV)", json: "Arquivo JSON" };

export function parseCards(mode, pages) {
  const lines = allLines(pages);
  switch (mode) {
    case "qa": return parseQA(lines);
    case "termo": return parseTermo(lines);
    case "pergunta": return parsePergunta(lines);
    case "gabarito": return parseGabarito(lines);
    case "cloze": return parseCloze(lines);
    case "pagina": return parsePagina(pages);
    case "csv": return parseCsv(pages.join("\n"));
    default: return [];
  }
}

/* ==========================================================================
   REPETIÇÃO ESPAÇADA (SM-2 simplificado)
   ========================================================================== */
const newCard = c => ({ id: uid(), f: c.f.slice(0, MAX_F), b: c.b.slice(0, MAX_B), due: null, ivl: 0, ease: 2.5, reps: 0, lapses: 0 });
const isDue = c => !c.due || c.due <= todayISO();

export function nextState(c, rating) {
  let { ivl = 0, ease = 2.5, reps = 0, lapses = 0 } = c;
  if (rating === 0) { lapses++; reps = 0; ease = Math.max(1.3, ease - 0.2); ivl = 0; }
  else if (rating === 1) { ivl = reps === 0 ? 1 : Math.max(1, Math.round(ivl * 1.2)); ease = Math.max(1.3, ease - 0.15); reps++; }
  else if (rating === 2) { ivl = reps === 0 ? 1 : reps === 1 ? 3 : Math.round(ivl * ease); reps++; }
  else { ivl = reps === 0 ? 3 : reps === 1 ? 7 : Math.round(ivl * ease * 1.3); ease = ease + 0.15; reps++; }
  return { ivl, ease: Math.round(ease * 100) / 100, reps, lapses };
}
function fmtIvl(d) {
  if (d <= 0) return "hoje";
  if (d === 1) return "1 dia";
  if (d < 30) return d + " dias";
  if (d < 365) { const m = Math.round(d / 30); return m + (m === 1 ? " mês" : " meses"); }
  return Math.round(d / 365) + " ano(s)";
}

/* ==========================================================================
   TELA
   ========================================================================== */
const decks = () => (S.cards.decks || (S.cards.decks = []));
const usedBytes = () => JSON.stringify(S.cards).length;
let queue = [];            // arquivos / baralhos esperando conferência
let pending = null;        // { name, ext, pages, cards, mode, auto, fromJson }
let session = null;

function show(which) {
  $("#fcHome").hidden = which !== "home";
  $("#fcImport").hidden = which !== "import";
  $("#fcStudy").hidden = which !== "study";
  window.scrollTo({ top: 0 });
}
function status(msg, kind) {
  const el = $("#fcStatus");
  el.textContent = msg || "";
  el.className = "fc-status" + (kind ? " is-" + kind : "");
}
function usageNote() {
  const kb = Math.round(usedBytes() / 1024);
  return kb + " KB de ~" + Math.round(MAX_BYTES / 1024) + " KB usados";
}

/* ---------- baralhos ---------- */
function renderDecks() {
  const list = $("#deckList");
  list.innerHTML = decks().map(d => {
    const total = d.cards.length, due = d.cards.filter(isDue).length;
    const color = d.disc ? discMeta(d.disc).color : "var(--cyan)";
    return `<li class="deck-item" style="--c:${color}" data-id="${esc(d.id)}">
      <h3 class="deck-name">${esc(d.name)}</h3>
      <div class="deck-meta"><span>${total} ${d.type === "pdf" ? (total === 1 ? "página" : "páginas") : (total === 1 ? "cartão" : "cartões")}</span>${d.type === "pdf" ? "<span>PDF original</span>" : ""}
        <span class="deck-due${due ? "" : " is-clear"}">${due ? due + " para revisar" : "em dia ✓"}</span>
        ${d.disc ? `<span>${esc(discMeta(d.disc).short)}</span>` : ""}<span>criado em ${fmtDMY(d.created || todayISO())}</span></div>
      <div class="deck-actions">
        <button class="btn-ghost is-primary" type="button" data-act="study"${due ? "" : " disabled"}>▶ Estudar</button>
        <button class="btn-ghost" type="button" data-act="all"${total ? "" : " disabled"}>Revisar tudo</button>
        ${d.type === "pdf" ? "" : '<button class="btn-ghost" type="button" data-act="export">⇩ Exportar</button>'}
        <button class="btn-ghost is-danger" type="button" data-act="del">Apagar</button>
      </div></li>`;
  }).join("");
  $("#deckEmpty").hidden = decks().length > 0;
  if (decks().length && !$("#fcStatus").textContent) status(usageNote());
}

/* ---------- importação ---------- */
async function handleFiles(files) {
  const list = Array.from(files || []);
  if (!list.length) return;
  list.forEach(f => queue.push({ kind: "file", file: f }));
  if (!pending) await nextInQueue();
}
async function nextInQueue() {
  pending = null;
  const item = queue.shift();
  if (!item) { show("home"); renderDecks(); return; }
  try {
    if (item.kind === "deck") { openPreview({ name: item.name, ext: "json", pages: [], cards: item.cards, mode: "json", auto: false, fromJson: true, disc: item.disc }); return; }
    await loadFile(item.file);
  } catch (err) {
    console.error(err);
    status("Não consegui abrir “" + item.file.name + "”: " + (
      err && err.message === "cdn" ? "o leitor de PDF não carregou. Confira a internet (ele vem do cdnjs.cloudflare.com) e tente de novo."
      : err && err.message === "senha-cancelada" ? "você cancelou a senha, então o arquivo foi pulado."
      : err && err.name === "PasswordException" ? "a senha não foi aceita."
      : "o arquivo parece corrompido."), "error");
    await nextInQueue();
  }
}
async function loadFile(file) {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  const base = file.name.replace(/\.[^.]+$/, "");
  if (file.size > MAX_FILE_MB * 1024 * 1024) throw new Error("grande");
  if (ext === "pdf" || file.type === "application/pdf") {
    status("Lendo o PDF…");
    const pages = await readPdf(file, (i, n) => status("Lendo a página " + i + " de " + n + "…"));
    return startParse({ name: base, ext, pages, file, numPages: pages.length });
  }
  const text = await file.text();
  if (ext === "json") {
    let obj; try { obj = JSON.parse(text); } catch (e) { throw new Error("json"); }
    const ds = parseJsonDecks(obj).filter(d => d.cards.length);
    if (!ds.length) { status("O JSON não tem cartões no formato esperado (frente/verso).", "error"); return nextInQueue(); }
    ds.slice(1).forEach(d => queue.push({ kind: "deck", name: d.name || base, disc: d.disc, cards: d.cards }));
    return openPreview({ name: ds[0].name || base, ext, pages: [], cards: ds[0].cards, mode: "json", auto: false, fromJson: true, disc: ds[0].disc });
  }
  if (ext === "csv" || ext === "tsv") return openPreview({ name: base, ext, pages: [text], cards: parseCards("csv", [text]), mode: "csv", auto: false, fromJson: false });
  return startParse({ name: base, ext, pages: [text] });
}
function startParse(p) {
  const mode = detectMode(p.pages);
  openPreview({ ...p, mode, auto: true, cards: parseCards(mode, p.pages), fromJson: false });
}

function dedupe(cards) {
  const seen = new Set();
  return cards.filter(c => c && c.f && c.b).filter(c => { const k = c.f.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
}
function openPreview(p) {
  pending = p;
  pending.cards = dedupe(p.cards);
  $("#fcDeckName").value = (p.name || "Novo baralho").slice(0, 80);
  $("#fcDeckDisc").innerHTML = discOptionsHTML(p.disc || "", { withEmpty: true, emptyLabel: "Sem disciplina" });
  $("#fcDeckDisc").value = p.disc || "";
  $("#fcMode").value = p.auto ? "auto" : (["qa", "termo", "pergunta", "gabarito", "cloze", "pagina"].includes(p.mode) ? p.mode : "auto");
  $("#fcMode").disabled = !!p.fromJson || p.mode === "csv";
  $("#fcRaw").textContent = p.pages.join("\n\n— página —\n\n").slice(0, 20000) || "(arquivo de cartões já pronto, sem texto para mostrar)";
  const rest = queue.length ? " Ainda na fila: " + queue.length + "." : "";
  status("");
  setupPdfOption();
  renderPreview(rest);
  show("import");
  $("#fcDeckName").focus();
}
function setupPdfOption() {
  let box = $("#fcPdfOpt");
  if (!pending.file) { if (box) box.hidden = true; return; }
  if (!box) {
    box = document.createElement("div");
    box.id = "fcPdfOpt";
    box.style.cssText = "margin:0 0 1rem;padding:.8rem 1rem;border:1px solid var(--cyan-dim);border-radius:var(--radius-sm);background:rgba(0,229,255,.05);display:flex;flex-wrap:wrap;gap:.8rem 1.4rem;align-items:center";
    box.innerHTML = `<label class="check-inline" for="fcPdfMode"><input type="checkbox" id="fcPdfMode" checked> Estudar abrindo o PDF original (uma página por cartão)</label>
      <span class="check-inline">Páginas <input class="field-input" id="fcPgFrom" type="number" min="1" style="width:5.5rem" aria-label="Primeira página"> até <input class="field-input" id="fcPgTo" type="number" min="1" style="width:5.5rem" aria-label="Última página"></span>
      <small style="color:var(--text-dim);flex-basis:100%">O PDF fica guardado só neste navegador, não vai para a nuvem. Em outro aparelho você precisa anexar o arquivo de novo. Funciona também com PDF escaneado.</small>`;
    $(".fc-import-meta").after(box);
    ["change", "input"].forEach(ev => box.addEventListener(ev, () => { if (pending) renderPreview(queue.length ? " Ainda na fila: " + queue.length + "." : ""); }));
  }
  box.hidden = false;
  $("#fcPdfMode").checked = true;
  $("#fcPgFrom").value = 1;
  $("#fcPgTo").value = pending.numPages;
  $("#fcPgFrom").max = $("#fcPgTo").max = pending.numPages;
}
function pdfRange() {
  const n = pending.numPages;
  const from = Math.max(1, Math.min(n, Math.floor(Number($("#fcPgFrom").value) || 1)));
  const to = Math.max(from, Math.min(n, Math.floor(Number($("#fcPgTo").value) || n)));
  return { from, to };
}
const isPdfMode = () => !!(pending && pending.file && $("#fcPdfMode") && $("#fcPdfMode").checked);

function renderPreview(extra = "") {
  const pdfMode = isPdfMode();
  if (pdfMode) {
    const { from, to } = pdfRange();
    $("#fcImportInfo").textContent = (to - from + 1) + " páginas (da " + from + " à " + to + ") viram cartões. Ao estudar, cada cartão mostra a página do PDF original." + extra;
    $("#fcPreview").hidden = true;
    $("#fcMode").disabled = true;
    $("#fcImportSave").disabled = false;
    return;
  }
  $("#fcPreview").hidden = false;
  $("#fcMode").disabled = !!pending.fromJson || pending.mode === "csv";
  const cards = pending.cards;
  const modeLabel = MODE_NAME[pending.mode] || pending.mode;
  let info = cards.length
    ? cards.length + (cards.length === 1 ? " cartão encontrado" : " cartões encontrados") + " · modo: " + modeLabel + (pending.auto ? " (detectado sozinho)" : "") + "."
    : "Nenhum cartão encontrado nesse modo. Troque o modo de extração ou confira o texto extraído abaixo.";
  if (cards.skipped) info += " " + cards.skipped + " questões sem gabarito foram ignoradas.";
  if (cards.length > MAX_CARDS) info += " Só os primeiros " + MAX_CARDS + " serão salvos.";
  if (cards.length > PREVIEW_LIMIT) info += " Mostrando os primeiros " + PREVIEW_LIMIT + ".";
  $("#fcImportInfo").textContent = info + extra;
  $("#fcPreview").innerHTML = cards.slice(0, PREVIEW_LIMIT).map((c, i) =>
    `<li><div class="fc-prev-front">${esc(c.f)}</div><div class="fc-prev-back">${esc(c.b)}</div>
     <button class="fc-prev-del" type="button" data-i="${i}" aria-label="Remover o cartão ${i + 1}">✕</button></li>`).join("");
  $("#fcImportSave").disabled = !cards.length;
}
function reparse() {
  if (!pending || pending.fromJson || pending.mode === "csv") return;
  const sel = $("#fcMode").value;
  const mode = sel === "auto" ? detectMode(pending.pages) : sel;
  pending.auto = sel === "auto"; pending.mode = mode;
  pending.cards = dedupe(parseCards(mode, pending.pages));
  renderPreview(queue.length ? " Ainda na fila: " + queue.length + "." : "");
}
async function saveImport() {
  if (!pending) return;
  const name = $("#fcDeckName").value.trim().slice(0, 80) || "Novo baralho";
  let deck;
  if (isPdfMode()) {
    const { from, to } = pdfRange();
    const cards = [];
    for (let i = from; i <= to; i++) cards.push({ id: uid(), f: "Página " + i, b: "", page: i, due: null, ivl: 0, ease: 2.5, reps: 0, lapses: 0 });
    deck = { id: uid(), name, disc: $("#fcDeckDisc").value, created: todayISO(), type: "pdf", pages: pending.numPages, cards };
    try {
      await idbPut(deck.id, pending.file);
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
    } catch (e) {
      console.error(e);
      $("#fcImportInfo").textContent = "Não consegui guardar o PDF neste navegador (espaço cheio ou navegação anônima). Libere espaço ou desmarque a opção do PDF original.";
      return;
    }
  } else {
    if (!pending.cards.length) return;
    deck = { id: uid(), name, disc: $("#fcDeckDisc").value, created: todayISO(), cards: pending.cards.slice(0, MAX_CARDS).map(newCard) };
  }
  const before = S.cards.decks;
  S.cards.decks = before.concat(deck);
  if (usedBytes() > MAX_BYTES) {
    S.cards.decks = before;
    if (deck.type === "pdf") idbDel(deck.id).catch(() => {});
    $("#fcImportInfo").textContent = "Não coube: o limite de armazenamento na nuvem (~" + Math.round(MAX_BYTES / 1024) + " KB) seria ultrapassado. Apague baralhos antigos, exporte um backup ou remova cartões desta prévia.";
    return;
  }
  save("cards");
  toast(deck.cards.length + (deck.type === "pdf" ? " páginas salvas" : " cartões salvos"));
  const n = deck.cards.length;
  nextInQueue().then(() => { if (!pending) status(n + (deck.type === "pdf" ? " páginas" : " cartões") + " salvos em “" + name + "”. " + usageNote(), "ok"); });
}

/* ---------- estudo ---------- */
async function startStudy(deckId, all) {
  const deck = decks().find(d => d.id === deckId);
  if (!deck) return;
  let cards = (all ? deck.cards.slice() : deck.cards.filter(isDue));
  if (!cards.length) return;
  cards.sort((a, b) => (a.due || "").localeCompare(b.due || ""));     // atrasados primeiro, novos por último
  cards = cards.slice(0, 60);
  let pdf = null;
  if (deck.type === "pdf") {
    status("Abrindo o PDF…");
    try {
      let blob = await idbGet(deck.id);
      if (!blob) {
        if (!confirm("O PDF deste baralho não está neste navegador (ele fica guardado só no aparelho onde foi importado). Quer anexar o arquivo agora?")) { status(""); return; }
        blob = await pickPdf();
        if (!blob) { status(""); return; }
        await idbPut(deck.id, blob);
      }
      const doc = await openPdfDoc(blob, deck.name);
      pdf = { doc, view: 1, zoom: 1, token: 0, task: null };
    } catch (err) {
      console.error(err);
      status(err && err.message === "senha-cancelada" ? "Você cancelou a senha do PDF." : "Não consegui abrir o PDF deste baralho: " + (err && err.message === "cdn" ? "o leitor de PDF não carregou (confira a internet)." : "o arquivo não confere ou está corrompido."), "error");
      return;
    }
    status("");
  }
  session = { deck, queue: cards.slice(), total: cards.length, learned: new Set(), again: 0, flipped: false, bumped: false, pdf };
  $("#fcStudyDeck").textContent = deck.name;
  $("#fcDone").hidden = true;
  $("#fcStage").hidden = false;
  show("study");
  showCard();
}
function pickPdf() {
  return new Promise(resolve => {
    const inp = document.createElement("input");
    inp.type = "file"; inp.accept = ".pdf,application/pdf";
    inp.onchange = () => resolve(inp.files[0] || null);
    inp.oncancel = () => resolve(null);
    inp.click();
  });
}

/* ---------- PDF na tela de estudo ---------- */
const darkPdf = () => { try { return localStorage.getItem("pcpe-pdf-dark") !== "0"; } catch (e) { return true; } };
function ensurePdfWrap() {
  let wrap = $("#fcPdfWrap");
  if (wrap) return wrap;
  wrap = document.createElement("div");
  wrap.id = "fcPdfWrap";
  wrap.style.cssText = "width:min(960px,100%);display:flex;flex-direction:column;gap:.6rem";
  wrap.innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:.5rem;align-items:center">
      <button class="btn-ghost" type="button" data-pdf="prev">◀ Página anterior</button>
      <button class="btn-ghost" type="button" data-pdf="next">Página seguinte ▶</button>
      <button class="btn-ghost" type="button" data-pdf="zout" aria-label="Diminuir o zoom">−</button>
      <button class="btn-ghost" type="button" data-pdf="zin" aria-label="Aumentar o zoom">+</button>
      <button class="btn-ghost" type="button" data-pdf="dark" aria-pressed="true">🌙 Fundo escuro</button>
      <span id="fcPdfLabel" role="status" style="font-size:.74rem;color:var(--text-dim)"></span></div>
    <div id="fcPdfScroll" tabindex="0" aria-label="Página do PDF" style="max-height:68vh;overflow:auto;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);text-align:center">
      <canvas id="fcPdfCanvas" style="display:block;margin:0 auto" role="img" aria-label="Página do PDF"></canvas></div>`;
  $("#fcStage").prepend(wrap);
  wrap.addEventListener("click", e => {
    const b = e.target.closest("[data-pdf]");
    if (!b || !session || !session.pdf) return;
    const s = session.pdf, act = b.dataset.pdf;
    if (act === "prev") s.view = Math.max(1, s.view - 1);
    else if (act === "next") s.view = Math.min(s.doc.numPages, s.view + 1);
    else if (act === "zin") s.zoom = Math.min(3, s.zoom + 0.25);
    else if (act === "zout") s.zoom = Math.max(0.5, s.zoom - 0.25);
    else if (act === "dark") { try { localStorage.setItem("pcpe-pdf-dark", darkPdf() ? "0" : "1"); } catch (err) { /* sem storage */ } }
    renderPdfPage(s.view, act === "prev" || act === "next");
  });
  let t = null;
  window.addEventListener("resize", () => { clearTimeout(t); t = setTimeout(() => { if (session && session.pdf && !$("#fcStudy").hidden) renderPdfPage(session.pdf.view, false); }, 200); });
  return wrap;
}
async function renderPdfPage(n, resetScroll = true) {
  const s = session && session.pdf;
  if (!s) return;
  const token = ++s.token;
  s.view = n;
  try { if (s.task) s.task.cancel(); } catch (e) { /* já terminou */ }
  const card = session.queue[0];
  $("#fcPdfLabel").textContent = "Página " + n + " de " + s.doc.numPages + (card && card.page !== n ? " · o cartão é a página " + card.page : "");
  const dark = darkPdf();
  const darkBtn = document.querySelector('#fcPdfWrap [data-pdf="dark"]');
  darkBtn.setAttribute("aria-pressed", String(dark));
  darkBtn.textContent = dark ? "🌙 Fundo escuro" : "☀ Fundo claro";
  const page = await s.doc.getPage(n);
  if (token !== s.token) return;
  const scroll = $("#fcPdfScroll"), canvas = $("#fcPdfCanvas");
  const base = page.getViewport({ scale: 1 });
  const scale = Math.max(0.3, ((scroll.clientWidth || 800) - 4) / base.width) * s.zoom;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const vp = page.getViewport({ scale: scale * dpr });
  canvas.width = Math.floor(vp.width); canvas.height = Math.floor(vp.height);
  canvas.style.width = Math.floor(vp.width / dpr) + "px"; canvas.style.height = Math.floor(vp.height / dpr) + "px";
  canvas.style.filter = dark ? "invert(.92) hue-rotate(180deg)" : "none";
  if (resetScroll) scroll.scrollTop = 0;
  s.task = page.render({ canvasContext: canvas.getContext("2d"), viewport: vp });
  try { await s.task.promise; } catch (e) { if (e && e.name !== "RenderingCancelledException") console.error(e); }
}

function showCard() {
  const c = session.queue[0];
  if (!c) return finishStudy();
  $("#fcCounter").textContent = session.learned.size + " / " + session.total + " · restam " + session.queue.length;
  $("#fcBar").style.width = Math.round(session.learned.size / session.total * 100) + "%";
  if (session.pdf) {                                   // cartão = uma página do PDF original
    ensurePdfWrap().hidden = false;
    $("#fcCard").hidden = true;
    session.flipped = true;
    $("#fcRate").hidden = false;
    [0, 1, 2, 3].forEach(r => { $("#fcIvl" + r).textContent = fmtIvl(nextState(c, r).ivl); });
    $("#fcHint").textContent = "Estude a página e avalie: 1 errei · 2 difícil · 3 bom · 4 fácil";
    renderPdfPage(c.page);
    return;
  }
  const w = $("#fcPdfWrap"); if (w) w.hidden = true;
  $("#fcCard").hidden = false;
  session.flipped = false;
  $("#fcFront").textContent = c.f;
  $("#fcBackFace").textContent = c.b;
  $("#fcBackFace").hidden = true;
  $("#fcRate").hidden = true;
  $("#fcHint").textContent = "Espaço ou Enter vira o cartão · 1 a 4 avaliam";
  $("#fcCard").setAttribute("aria-label", "Cartão. Pergunta: " + c.f + ". Pressione para ver a resposta.");
  $("#fcCard").focus();
}
function flip() {
  if (!session || session.flipped || !session.queue[0]) return;
  const c = session.queue[0];
  session.flipped = true;
  $("#fcBackFace").hidden = false;
  $("#fcRate").hidden = false;
  [0, 1, 2, 3].forEach(r => { $("#fcIvl" + r).textContent = fmtIvl(nextState(c, r).ivl); });
  $("#fcHint").textContent = "Como foi? Errei, difícil, bom ou fácil (teclas 1 a 4)";
  $("#fcCard").setAttribute("aria-label", "Cartão. Pergunta: " + c.f + ". Resposta: " + c.b);
}
function rate(r) {
  if (!session || !session.flipped) return;
  const c = session.queue.shift();
  Object.assign(c, nextState(c, r));
  c.due = addDaysISO(todayISO(), c.ivl);
  if (r === 0) { session.again++; session.queue.push(c); }
  else session.learned.add(c.id);
  if (!session.bumped) { bumpStreak(); save("progress"); session.bumped = true; }
  save("cards");
  showCard();
}
function finishStudy() {
  $("#fcStage").hidden = true;
  $("#fcDone").hidden = false;
  $("#fcBar").style.width = "100%";
  $("#fcCounter").textContent = session.total + " / " + session.total;
  $("#fcDoneText").textContent = session.total + (session.pdf ? " páginas revisadas" : " cartões revisados") + ", com " + session.again + (session.again === 1 ? " erro" : " erros") + " no caminho. Os próximos vencimentos já foram agendados.";
  $("#fcDoneBack").focus();
}
function exitStudy() {
  if (session && session.pdf) { try { session.pdf.task && session.pdf.task.cancel(); } catch (e) { /* ok */ } destroyDoc(session.pdf.doc); }
  session = null; show("home"); renderDecks();
}

/* ---------- cartão avulso ---------- */
function openCardDialog() {
  const sel = $("#fcCardDeck");
  sel.innerHTML = decks().length ? decks().map(d => `<option value="${esc(d.id)}">${esc(d.name)}</option>`).join("") : `<option value="__new">+ Novo baralho “Cartões avulsos”</option>`;
  $("#fcCardFront").value = ""; $("#fcCardBack").value = ""; $("#fcCardMsg").textContent = ""; $("#fcCardMsg").className = "login-msg";
  $("#fcCardDialog").showModal();
  $("#fcCardFront").focus();
}
function saveCardDialog(ev) {
  ev.preventDefault();
  const f = clean($("#fcCardFront").value), b = $("#fcCardBack").value.trim();
  const fail = t => { $("#fcCardMsg").textContent = t; $("#fcCardMsg").className = "login-msg is-error"; };
  if (!f || !b) return fail("Preencha a frente e o verso.");
  let deck = decks().find(d => d.id === $("#fcCardDeck").value);
  const before = S.cards.decks;
  if (!deck) { deck = { id: uid(), name: "Cartões avulsos", disc: "", created: todayISO(), cards: [] }; S.cards.decks = before.concat(deck); }
  deck.cards.push(newCard({ f, b }));
  if (usedBytes() > MAX_BYTES) { deck.cards.pop(); S.cards.decks = before; return fail("Limite de armazenamento atingido. Apague baralhos antigos."); }
  save("cards");
  $("#fcCardDialog").close();
  toast("Cartão salvo");
  renderDecks();
}

/* ---------- ligações ---------- */
export function init({ user } = {}) {
  userId = (user && user.uid) || "anon";
  const drop = $("#fcDrop"), file = $("#fcFile");
  drop.addEventListener("click", () => file.click());
  drop.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); file.click(); } });
  file.addEventListener("change", () => { const fs = Array.from(file.files); file.value = ""; handleFiles(fs); });

  ["dragenter", "dragover"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("is-over"); }));
  ["dragleave", "dragend"].forEach(ev => drop.addEventListener(ev, () => drop.classList.remove("is-over")));
  drop.addEventListener("drop", e => { e.preventDefault(); drop.classList.remove("is-over"); handleFiles(e.dataTransfer.files); });
  // soltar fora da área não deve abrir o PDF no navegador e fazer você perder a tela
  ["dragover", "drop"].forEach(ev => window.addEventListener(ev, e => {
    if (!$("#view-flashcards").hidden && e.dataTransfer && Array.from(e.dataTransfer.types || []).includes("Files") && !drop.contains(e.target)) e.preventDefault();
  }));

  $("#fcImportJson").addEventListener("click", () => $("#fcJsonInput").click());
  $("#fcJsonInput").addEventListener("change", e => { const fs = Array.from(e.target.files); e.target.value = ""; handleFiles(fs); });
  $("#fcNewCard").addEventListener("click", openCardDialog);
  $("#fcCardForm").addEventListener("submit", saveCardDialog);
  $("#fcCardCancel").addEventListener("click", () => $("#fcCardDialog").close());

  $("#fcMode").addEventListener("change", reparse);
  $("#fcPreview").addEventListener("click", e => {
    const b = e.target.closest(".fc-prev-del");
    if (!b || !pending) return;
    pending.cards.splice(Number(b.dataset.i), 1);
    renderPreview(queue.length ? " Ainda na fila: " + queue.length + "." : "");
  });
  $("#fcImportSave").addEventListener("click", saveImport);
  $("#fcImportCancel").addEventListener("click", () => { nextInQueue(); });

  $("#deckList").addEventListener("click", e => {
    const btn = e.target.closest("[data-act]");
    const li = e.target.closest(".deck-item");
    if (!btn || !li) return;
    const deck = decks().find(d => d.id === li.dataset.id);
    if (!deck) return;
    const act = btn.dataset.act;
    if (act === "study") startStudy(deck.id, false);
    else if (act === "all") startStudy(deck.id, true);
    else if (act === "export") downloadFile("baralho-" + deck.name.replace(/[^\wÀ-ú-]+/g, "_").slice(0, 40) + ".json",
      JSON.stringify({ app: "pcpe-deck", name: deck.name, disc: deck.disc, cards: deck.cards.map(c => ({ f: c.f, b: c.b })) }, null, 2));
    else if (act === "del" && confirm("Apagar o baralho “" + deck.name + "” e seus " + deck.cards.length + " cartões? Não dá para desfazer (a não ser por um backup).")) {
      S.cards.decks = decks().filter(d => d.id !== deck.id);
      if (deck.type === "pdf") idbDel(deck.id).catch(() => {});
      save("cards");
      status("Baralho apagado. " + usageNote());
    }
  });

  $("#fcCard").addEventListener("click", flip);
  $$("#fcRate .fc-rate-btn").forEach(b => b.addEventListener("click", () => rate(Number(b.dataset.rate))));
  $("#fcStudyExit").addEventListener("click", exitStudy);
  $("#fcDoneBack").addEventListener("click", exitStudy);
  document.addEventListener("keydown", e => {
    if ($("#fcStudy").hidden || !session || e.ctrlKey || e.metaKey || e.altKey || $("#view-flashcards").hidden) return;
    if (document.querySelector("dialog[open]")) return;
    const tgt = (e.target.tagName || "").toLowerCase();
    if (/^[1-4]$/.test(e.key) && session.flipped && !["input", "textarea", "select"].includes(tgt)) { e.preventDefault(); rate(Number(e.key) - 1); }
    else if (session.pdf) { if (e.key === "Escape") exitStudy(); }
    else if ((e.key === " " || e.key === "Enter") && !["button", "a", "input", "select", "textarea"].includes((e.target.tagName || "").toLowerCase())) { e.preventDefault(); flip(); }
    else if (e.key === "Escape") exitStudy();
  });

  onChange(name => { if (name === "cards" && !session && !pending) renderDecks(); });
  show("home");
  renderDecks();
}

export function onShow() { if (!session && !pending) { show("home"); } renderDecks(); }