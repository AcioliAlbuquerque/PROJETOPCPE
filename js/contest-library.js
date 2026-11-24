/* Biblioteca de concursos por conta. O PDF é lido localmente; somente o programa revisado é sincronizado. */
import { db } from "../firebase-config.js";
import { doc, getDoc, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { CURRICULUM } from "./study-plan.js";
import { todayISO, esc } from "./config.js";

const registryRef = uid => doc(db, "contest_registry", uid);
const profileRef = (uid, id) => doc(db, "contest_profiles", uid, "items", id);
const localKey = uid => `pcpe-contest-library:${uid}`;
let activeProfile = null;
let pendingCurriculum = [];
let pendingPdfText = "";
let tesseractLoadPromise = null;

async function loadTesseract() {
  if (typeof window.Tesseract?.createWorker === "function") return window.Tesseract;
  if (!tesseractLoadPromise) {
    tesseractLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
      script.async = true;
      script.onload = () => typeof window.Tesseract?.createWorker === "function"
        ? resolve(window.Tesseract)
        : reject(new Error("A biblioteca OCR carregou sem disponibilizar createWorker."));
      script.onerror = () => reject(new Error("Não foi possível baixar a biblioteca OCR."));
      document.head.appendChild(script);
    }).catch(error => {
      tesseractLoadPromise = null;
      throw error;
    });
  }
  return tesseractLoadPromise;
}

function localRead(uid) { try { return JSON.parse(localStorage.getItem(localKey(uid)) || "{}"); } catch { return {}; } }
function localWrite(uid, data) { try { localStorage.setItem(localKey(uid), JSON.stringify(data)); } catch {} }
function ensureDialog() {
  if (document.querySelector("#contestLibrary")) return;
  document.body.insertAdjacentHTML("beforeend", `<dialog id="contestLibrary" class="contest-dialog" aria-labelledby="contestDialogTitle">
    <form method="dialog" class="contest-dialog__shell" id="contestForm">
      <header class="contest-dialog__head"><span class="hud-tag">SUA CENTRAL DE CONCURSOS</span><h2 id="contestDialogTitle">Escolha seu próximo foco</h2><p>O progresso, calendário, questões e flashcards ficam separados por concurso e cargo.</p></header>
      <div class="contest-library-list" id="contestList"></div>
      <div class="contest-dialog__actions"><button type="button" class="btn-primary" id="newContestBtn">＋ Cadastrar concurso</button><button type="button" class="btn-ghost" id="contestCancelBtn">Cancelar</button></div>
      <section class="contest-create" id="contestCreate" hidden>
        <div class="contest-create__heading"><span class="hud-tag">NOVO PLANO</span><h3>Dados do concurso e do cargo</h3><p>Essas respostas definem o programa, a carga do ciclo e as missões até a prova.</p></div>
        <div class="contest-form-grid">
          <label>Nome do concurso<input id="contestName" required maxlength="90" placeholder="Ex.: Polícia Civil de Pernambuco"></label>
          <label>Cargo pretendido <b>*</b><input id="contestRole" required maxlength="90" placeholder="Ex.: Agente de Polícia"></label>
          <label>Identificador do cargo no edital (opcional)<input id="contestRoleSection" maxlength="140" placeholder="Ex.: Cargo 2 ou Anexo II"></label>
          <label>Órgão / instituição<input id="contestAgency" maxlength="90" placeholder="Ex.: Polícia Civil"></label>
          <label>Banca organizadora<input id="contestBoard" maxlength="80" placeholder="Ex.: Cebraspe"></label>
          <label>Data da prova<input id="contestExamDate" type="date" required></label>
          <label>Início do ciclo<input id="contestStartDate" type="date" required></label>
          <label>Horas líquidas por dia<input id="contestHours" type="number" min="3" max="12" step="0.5" value="3" required></label>
          <label>Questões nos dias de estudo<input id="contestQuestionGoal" type="number" min="10" max="300" step="10" value="50" required></label>
          <label>O concurso terá prova discursiva?<select id="contestEssay"><option value="yes">Sim — incluir redação semanal</option><option value="no">Não — usar o domingo para revisão</option></select></label>
        </div>
        <div class="contest-upload"><label for="contestPdf">Anexe o edital em PDF</label><input id="contestPdf" type="file" accept="application/pdf,.pdf"><small>Ao selecionar o arquivo, o sistema identifica as disciplinas e os assuntos para montar o ciclo. Se a extração de texto falhar, tenta reconhecimento visual (OCR) em português. O PDF é processado neste navegador e não é enviado.</small></div>
        <div id="contestPreview" class="contest-preview" aria-live="polite">Selecione o edital para identificar o conteúdo programático do cargo.</div>
        <p class="contest-review-note"><strong>Concurso com vários cargos?</strong> Informe o cargo e, se souber, o anexo ou número que o identifica. O sistema usa essa referência para localizar o programa; confira a prévia das disciplinas antes de salvar. O OCR pode levar alguns minutos em editais longos.</p>
        <div class="contest-dialog__actions"><button type="button" class="btn-primary" id="saveContestBtn">Salvar cargo e preparar ciclo</button><button type="button" class="btn-ghost" id="backContestBtn">Voltar à lista</button></div>
        <p class="contest-error" id="contestError" role="alert" hidden></p>
      </section>
    </form>
  </dialog>`);
}

async function readPdf(file, onProgress = () => {}, role = "", roleSection = "") {
  const pdfjs = await import("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data: bytes }).promise;
  const pages = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const content = await page.getTextContent();
    const grouped = new Map();
    for (const item of content.items) {
      if (!item.str?.trim()) continue;
      const y = Math.round(item.transform?.[5] || 0);
      const x = item.transform?.[4] || 0;
      if (!grouped.has(y)) grouped.set(y, []);
      grouped.get(y).push({ x, text: item.str });
    }
    pages.push([...grouped.entries()].sort((a, b) => b[0] - a[0]).map(([, items]) => items.sort((a, b) => a.x - b.x).map(item => item.text).join(" ").replace(/\s+/g, " ").trim()).join("\n"));
  }
  let text = pages.map((page, index) => `\n[PÁGINA ${index + 1}]\n${page}`).join("\n");
  const nativeRows = parseProgramFromPdf(text, role, roleSection);
  const hasProgramMarker = /conte[uú]do program[aá]tico|programa de provas|programa das provas|disciplinas do cargo/i.test(text);
  const common = new Set("de da do das dos e o a os as em no na nos nas por para com que se ao aos um uma sua seu suas seus como não mais ou também lei artigo inciso caput direito código prova cargo conhecimentos conteúdo programático disciplina matérias assuntos".split(" "));
  const languageScore = source => {
    const words = source.match(/[a-záàâãéêíóôõúç]{2,}/gi) || [];
    return words.length ? words.filter(word => common.has(word.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, ""))).length / words.length : 0;
  };
  const commonRatio = languageScore(text);
  const nativeSubjects = new Set(nativeRows.map(item => item.disc)).size;
  const needOCR = commonRatio < 0.07 || nativeSubjects < 2 || nativeRows.length < 8 || !hasProgramMarker;
  if (!needOCR) return text;

  onProgress("O texto do PDF não foi reconhecido com clareza. Ativando leitura visual em português…");
  let worker = null;
  let canvas = null;
  try {
    const Tesseract = await loadTesseract();
    const { createWorker } = Tesseract;
    worker = await createWorker("por", 1, {
      workerPath: "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js",
      langPath: "https://tessdata.projectnaptha.com/4.0.0",
      corePath: "https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1",
      logger: event => {
        if (event.status === "recognizing text") onProgress(`Leitura visual do edital · ${Math.round((event.progress || 0) * 100)}% da página atual`);
      },
    });
    const normalized = pages.map(page => page.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, ""));
    const candidate = [];
    const roleKey = (roleSection || role).toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "").slice(0, 24);
    normalized.forEach((page, index) => {
      if (/conteudoprogram|programadeprovas|programaticodasprovas/.test(page) || (roleKey.length > 4 && page.includes(roleKey))) {
        for (let n = Math.max(0, index - 1); n < Math.min(pages.length, index + 28); n++) candidate.push(n);
      }
    });
    const pageIndexes = candidate.length ? [...new Set(candidate)].sort((a, b) => a - b) : pages.map((_, index) => index);
    const ocrPages = [];
    canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });
    for (let position = 0; position < pageIndexes.length; position++) {
      const pageNo = pageIndexes[position] + 1;
      onProgress(`Reconhecendo edital · página ${pageNo} de ${pdf.numPages}`);
      const page = await pdf.getPage(pageNo);
      const viewport = page.getViewport({ scale: 2.25 });
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      await page.render({ canvasContext: context, viewport }).promise;
      const result = await worker.recognize(canvas);
      ocrPages.push(`\n[PÁGINA ${pageNo}]\n${result.data.text || ""}`);
      canvas.width = 1; canvas.height = 1;
    }
    const ocrText = ocrPages.join("\n");
    const ocrRows = parseProgramFromPdf(ocrText, role, roleSection);
    if (!ocrRows.length) throw new Error("A leitura visual não encontrou o programa do cargo.");
    return ocrText;
  } catch (error) {
    console.warn("OCR não ficou disponível; usando extração de texto do PDF", error);
    if (commonRatio < 0.07 || nativeSubjects < 2 || nativeRows.length < 8 || !hasProgramMarker) {
      const detail = /não encontrou o programa/i.test(error.message || "")
        ? "O OCR carregou, mas não localizou o programa do cargo nas páginas analisadas."
        : `O OCR em português não carregou (${error.message || "erro de rede"}). Verifique a conexão e tente novamente.`;
      throw new Error(detail);
    }
    return text;
  } finally {
    if (canvas) { canvas.width = 1; canvas.height = 1; }
    if (worker) await worker.terminate();
  }
}

function parseProgramFromPdf(text, role, roleSection = "") {
  const lines = text.split(/\r?\n/).flatMap(line => line.replace(/\s+/g, " ").trim().split(/\s+(?=\d+(?:\.\d+)*[.)]\s+)/)).filter(Boolean);
  const fold = value => value.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const isCargoHeading = line => /^(?:anexo\s+[ivx\d]+\s*[-—:]?\s*)?cargo\b/i.test(line);
  const markerIndexes = lines.map((line, index) => ({ line, index })).filter(({ line }) => /conte[uú]do program[aá]tico|programa de provas|programa das provas|disciplinas do cargo/i.test(line) && line.length < 220).map(item => item.index);
  let from = -1;
  let roleLine = -1;
  const explicitRole = fold(roleSection.split(/[,;—–-]/)[0].trim());
  const roleCandidates = [...(explicitRole.length > 3 ? [explicitRole] : []), fold(role)].filter(value => value.length > 3);
  for (let candidateIndex = 0; candidateIndex < roleCandidates.length; candidateIndex++) {
    const candidate = roleCandidates[candidateIndex];
    for (let i = Math.max(0, markerIndexes[0] ?? 0); i < lines.length; i++) {
      if (!fold(lines[i]).includes(candidate)) continue;
      roleLine = i;
      if (explicitRole.length > 3 && candidateIndex === 0) break;
    }
    if (roleLine >= 0) break;
  }
  from = roleLine >= 0 ? (markerIndexes.filter(index => index <= roleLine).at(-1) ?? -1) : (markerIndexes.at(-1) ?? -1);
  if (roleLine >= 0) {
    let cargoStart = roleLine;
    for (let i = roleLine; i >= 0; i--) if (isCargoHeading(lines[i])) { cargoStart = i; break; }
    if (isCargoHeading(lines[cargoStart])) from = cargoStart;
  }
  if (from < 0) {
    from = lines.findIndex(line => /^(?:\d+(?:\.\d+)*\s*)?(?:l[ií]ngua portuguesa|portugu[eê]s|direito\s+|no[cç][oõ]es?\s+de\s+|conhecimentos\s+(?:b[aá]sicos|gerais|espec[ií]ficos)|matem[aá]tica|inform[aá]tica|contabilidade|estat[ií]stica|arquivologia|criminologia|medicina legal)/i.test(line));
    if (from < 0) return [];
  }
  let to = lines.length;
  for (let i = from + 1; i < lines.length; i++) {
    if (i > roleLine && roleLine >= 0 && isCargoHeading(lines[i])) { to = i; break; }
    if (roleLine < 0 && /^(atribui[cç][oõ]es|requisitos|inscri[cç][oõ]es|cronograma|remunera[cç][aã]o|avalia[cç][aã]o psicol[oó]gica)\b/i.test(lines[i])) { to = i; break; }
  }
  const section = lines.slice(from, to);
  const subjectPatterns = [
    /portugu[eê]s|l[ií]ngua portuguesa/i, /direito\s+constitucional/i, /direito\s+administrativo/i,
    /direito\s+penal/i, /processual\s+penal/i, /direito\s+civil/i, /direito\s+tribut[aá]rio/i,
    /inform[aá]tica|tecnologia da informa[cç][aã]o/i, /racioc[ií]nio|matem[aá]tica|l[oó]gica/i,
    /contabilidade/i, /estat[ií]stica/i, /legisla[cç][aã]o/i, /atualidades|conhecimentos gerais/i,
    /conhecimentos\s+(?:b[aá]sicos|gerais|espec[ií]ficos)/i, /no[cç][oõ]es?\s+de\s+[^:–-]{3,80}/i,
    /reda[cç][aã]o|discursiva/i, /administra[cç][aã]o\s+(?:p[uú]blica|financeira)/i,
    /medicina\s+legal|criminal[ií]stica|criminologia|direitos?\s+humanos?/i,
    /legisla[cç][aã]o\s+(?:especial|penal|estadual|institucional)/i,
    /direito\s+(?:processual\s+civil|do\s+trabalho|previdenci[aá]rio|ambiental|eleitoral|empresarial)/i,
    /conhecimentos\s+(?:sobre|na\s+[aá]rea\s+de)\s+[^:–-]{3,80}/i,
  ];
  let current = "Conteúdo do cargo";
  const rows = [], seen = new Set();
  let foundSubjectHeading = false;
  for (const raw of section) {
    if (/^\[P[AÁ]GINA\s+\d+\]$/i.test(raw)) continue;
    let line = raw.replace(/^[\s•·▪\-–—\d.()]+/, "").trim();
    if (line.length < 4 || line.length > 200 || /^\d+$/.test(line) || /^(edital|anexo|p[aá]gina|cargo pretendido)\b/i.test(line)) continue;
    const pattern = subjectPatterns.find(re => re.test(line));
    const colon = line.indexOf(":");
    if (pattern && colon > 0 && line.slice(colon + 1).trim().length > 7) {
      current = line.slice(0, colon).replace(/^\d+(?:\.\d+)*\s*/, "").trim();
      foundSubjectHeading = true;
      line = line.slice(colon + 1).trim();
    }
    const looksHeading = (pattern && line.length < 100 && !line.includes(".")) || (/^[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9\s:–—()/.,-]+$/.test(line) && line.length < 110);
    if (looksHeading) {
      current = line.replace(/^\d+(?:\.\d+)*\s*/, "").replace(/\s*[:–—-]\s*$/, "").trim();
      if (pattern || subjectPatterns.some(re => re.test(current))) foundSubjectHeading = true;
      continue;
    }
    if (/^(conte[uú]do|programa de provas|conhecimentos (?:b[aá]sicos|gerais|espec[ií]ficos))\b/i.test(line)) { current = line; continue; }
    line = line.replace(/^\d+(?:\.\d+)*\s*/, "").replace(/\s*\.\.\.$/, "").trim();
    const sentenceCount = (line.match(/[.!?](?:\s|$)/g) || []).length;
    const clauseStarter = /^(a secret[aá]ria|o secret[aá]rio|considerando|resolve\b|ressocializa[cç][aã]o, tendo em vista|art\.?\s*\d|§\s*\d|(?:i|ii|iii|iv|v)\.\s*(?:abrir|determinar|esclarecer|publicar|estabelecer|conceder))/i.test(line);
    const denseProse = line.length > 160 && (line.match(/,/g) || []).length > 3 || /,\s*(?:tendo em vista|considerando|nos termos|em conformidade|resolve)/i.test(line);
    if (line.length < 7 || sentenceCount > 1 || clauseStarter || denseProse || /^(cargo|prova objetiva|distribui[cç][aã]o|valor da|n[uú]mero de quest[oõ]es|resolvem|considerando)\b/i.test(line)) continue;
    const key = `${fold(current)}::${fold(line)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const disc = fold(current).replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "conteudo_cargo";
    rows.push({ id: `topic-${rows.length + 1}-${disc}`, disc, subject: current, module: "Conteúdo do cargo", priority: "ciclo", minutes: 60, title: line, role });
  }
  if (!foundSubjectHeading) return [];
  return rows.filter(row => row.subject !== "Conteúdo do cargo").slice(0, 500);
}

function curriculumPreview(items) {
  const subjects = [...new Set(items.map(item => item.subject))];
  return `<strong>${subjects.length} disciplina(s) · ${items.length} assunto(s) identificados</strong><small>${subjects.map(esc).join(" · ")}</small>`;
}

function showCreate() { document.querySelector("#contestCreate").hidden = false; document.querySelector("#contestDialogTitle").textContent = "Monte o plano do cargo"; }
function showList() { document.querySelector("#contestCreate").hidden = true; document.querySelector("#contestDialogTitle").textContent = "Escolha seu próximo foco"; }
function savedProfile(profile) { return `<article class="contest-card"><button type="button" class="contest-card__select" data-contest-id="${esc(profile.id)}"><span class="contest-card__icon">▦</span><span class="contest-card__details"><strong>${esc(profile.name)}</strong><small>${esc(profile.role)} · prova ${esc(profile.examISO || "data não informada")}</small></span><span class="contest-card__arrow">›</span></button><button type="button" class="contest-card__delete" data-delete-contest="${esc(profile.id)}" aria-label="Excluir ${esc(profile.name)}" title="Excluir concurso">×</button></article>`; }

async function loadLibrary(user) {
  const local = localRead(user.uid);
  try {
    const snap = await getDoc(registryRef(user.uid));
    if (snap.exists()) {
      const cloud = snap.data();
      const removed = new Set(local.removedIds || []);
      const localProfiles = new Map((local.profiles || []).map(profile => [profile.id, profile]));
      const cloudProfiles = (cloud.profiles || []).filter(profile => !removed.has(profile.id));
      const merged = cloudProfiles.map(profile => ({ ...(localProfiles.get(profile.id) || {}), ...profile }));
      for (const profile of local.profiles || []) {
        if (!removed.has(profile.id) && !cloudProfiles.some(item => item.id === profile.id)) merged.push(profile);
      }
      return { ...local, ...cloud, profiles: merged, removedIds: [...new Set([...(cloud.removedIds || []), ...removed])] };
    }
  } catch (error) { console.warn("Biblioteca offline; usando cópia local", error); }
  return local;
}
async function persistLibrary(user, library) {
  const metadata = { activeId: library.activeId || null, removedIds: library.removedIds || [], profiles: (library.profiles || []).map(({ curriculum, ...item }) => item) };
  try { await setDoc(registryRef(user.uid), metadata); localWrite(user.uid, library); } catch (error) { console.warn("Biblioteca mantida neste navegador", error); localWrite(user.uid, library); }
}

async function persistProfile(user, profile) {
  const lib = await loadLibrary(user);
  lib.profiles = Array.isArray(lib.profiles) ? lib.profiles : [];
  lib.profiles = [profile, ...lib.profiles.filter(item => item.id !== profile.id)];
  lib.activeId = profile.id;
  localWrite(user.uid, lib);
  try { await setDoc(profileRef(user.uid, profile.id), profile); await persistLibrary(user, lib); }
  catch (error) { console.warn("Plano salvo apenas no navegador até sincronizar", error); }
}

export async function chooseContest(user) {
  ensureDialog();
  const dialog = document.querySelector("#contestLibrary");
  const list = document.querySelector("#contestList");
  const library = await loadLibrary(user);
  library.profiles = Array.isArray(library.profiles) ? library.profiles : [];
  library.removedIds = Array.isArray(library.removedIds) ? library.removedIds : [];
  if (!library.profiles.some(item => item.id === "pcpe-2027") && !library.removedIds.includes("pcpe-2027")) {
    const pcpe = { id: "pcpe-2027", name: "PCPE — Polícia Civil de Pernambuco", role: "Agente de Polícia", agency: "Polícia Civil de Pernambuco", board: "Cebraspe", examISO: "2027-03-07", startISO: todayISO(), dailyGoalMin: 180, questionGoal: 50, essayEnabled: true, sourceFileName: "Edital Verticalizado EBN — PCPE", curriculum: CURRICULUM.map(item => ({ ...item })) };
    library.profiles.unshift(pcpe);
    await persistProfile(user, pcpe);
  }
  const paint = () => {
    list.innerHTML = library.profiles.map(savedProfile).join("") || `<p class="contest-empty">Nenhum concurso cadastrado ainda.</p>`;
    document.querySelector("#contestCancelBtn").disabled = library.profiles.length === 0;
    list.querySelectorAll("[data-contest-id]").forEach(button => button.addEventListener("click", async () => {
      const profile = library.profiles.find(item => item.id === button.dataset.contestId);
      if (!profile) return;
      let full = profile;
      try { const saved = await getDoc(profileRef(user.uid, profile.id)); if (saved.exists()) full = { ...profile, ...saved.data() }; } catch {}
      activeProfile = full; library.activeId = full.id; localWrite(user.uid, library);
      dialog.close("selected");
    }));
    list.querySelectorAll("[data-delete-contest]").forEach(button => button.addEventListener("click", async () => {
      const id = button.dataset.deleteContest;
      const profile = library.profiles.find(item => item.id === id);
      if (!profile || !confirm(`Excluir ${profile.name} — ${profile.role}?\n\nO programa, o calendário, o progresso, as horas e os flashcards deste concurso serão apagados desta conta e deste navegador. Essa ação não pode ser desfeita.`)) return;
      button.disabled = true;
      try {
        const generic = id !== "pcpe-2027";
        const refs = generic
          ? [profileRef(user.uid, id), doc(db, "contest_progress", user.uid, "items", id), doc(db, "contest_lab", user.uid, "items", id), doc(db, "contest_cards", user.uid, "items", id)]
          : [profileRef(user.uid, id), doc(db, "pcpe_progress", user.uid), doc(db, "pcpe_lab", user.uid), doc(db, "pcpe_cards", user.uid)];
        const nextLibrary = {
          ...library,
          profiles: library.profiles.filter(item => item.id !== id),
          removedIds: [...new Set([...(library.removedIds || []), id])],
          activeId: library.activeId === id ? null : library.activeId,
        };
        const metadata = { activeId: nextLibrary.activeId, removedIds: nextLibrary.removedIds, profiles: nextLibrary.profiles.map(({ curriculum, ...item }) => item) };
        let registryError = null;
        try { await setDoc(registryRef(user.uid), metadata); }
        catch (error) { registryError = error; console.warn("Concurso removido localmente; a biblioteca ainda não sincronizou", error); }
        Object.assign(library, nextLibrary);
        localWrite(user.uid, library);
        const results = await Promise.allSettled(refs.map(ref => deleteDoc(ref)));
        const failedDeletes = results.filter(result => result.status === "rejected");
        const suffix = generic ? `:${id}` : "";
        ["pcpe-agente-quest-save-v1", "pcpe-lab-v1", "pcpe-cards-v1"].forEach(key => localStorage.removeItem(`${key}:${user.uid}${suffix}`));
        if (activeProfile?.id === id) activeProfile = null;
        paint();
        if (registryError || failedDeletes.length) alert("O concurso saiu desta lista, mas a limpeza completa na nuvem falhou. Publique as regras atualizadas de firestore.rules para sincronizar a exclusão entre aparelhos.");
      } catch (error) {
        console.error("Falha ao excluir concurso", error);
        alert("Não foi possível excluir os dados do concurso. Confirme se as regras firestore.rules já foram publicadas e tente novamente.");
        button.disabled = false;
      }
    }));
  };
  paint();
  document.querySelector("#newContestBtn").onclick = () => { document.querySelector("#contestForm").reset(); pendingCurriculum = []; pendingPdfText = ""; document.querySelector("#contestStartDate").value = todayISO(); document.querySelector("#contestPreview").textContent = "Selecione o edital para identificar o conteúdo programático do cargo."; showCreate(); };
  document.querySelector("#backContestBtn").onclick = showList;
  document.querySelector("#contestForm").addEventListener("submit", event => event.preventDefault());
  document.querySelector("#contestStartDate").value = todayISO();
  document.querySelector("#contestCancelBtn").onclick = () => { if (library.profiles.length) dialog.close("selected"); };
  const updateRolePreview = () => {
    if (!pendingPdfText) return;
    pendingCurriculum = parseProgramFromPdf(pendingPdfText, document.querySelector("#contestRole").value.trim(), document.querySelector("#contestRoleSection").value.trim());
    document.querySelector("#contestPreview").innerHTML = pendingCurriculum.length ? curriculumPreview(pendingCurriculum) : "Não foi possível identificar assuntos para este cargo nesse recorte do edital.";
  };
  document.querySelector("#contestRole").oninput = updateRolePreview;
  document.querySelector("#contestRoleSection").oninput = updateRolePreview;
  document.querySelector("#contestPdf").onchange = async () => {
    const file = document.querySelector("#contestPdf").files[0];
    const error = document.querySelector("#contestError"); error.hidden = true;
    if (!file) return;
    const preview = document.querySelector("#contestPreview");
    preview.textContent = "Lendo o edital e identificando matérias e assuntos…";
    try {
      const text = await readPdf(file, message => { preview.textContent = message; }, document.querySelector("#contestRole").value.trim(), document.querySelector("#contestRoleSection").value.trim());
      if (!text.trim()) throw new Error("Não foi possível extrair nem reconhecer o texto deste PDF. Confirme se o arquivo está íntegro e tente novamente.");
      pendingPdfText = text;
      pendingCurriculum = parseProgramFromPdf(text, document.querySelector("#contestRole").value.trim(), document.querySelector("#contestRoleSection").value.trim());
      if (!pendingCurriculum.length) throw new Error("Não encontrei assuntos no programa do cargo. Confira se selecionou o cargo correto e se o edital contém o conteúdo programático.");
      preview.innerHTML = curriculumPreview(pendingCurriculum);
      if (!document.querySelector("#contestName").value) document.querySelector("#contestName").value = file.name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ");
    } catch (e) { pendingCurriculum = []; pendingPdfText = ""; preview.textContent = "Não foi possível montar a lista de assuntos."; error.textContent = e.message || "Não foi possível ler este PDF."; error.hidden = false; }
  };
  document.querySelector("#saveContestBtn").onclick = async () => {
    const error = document.querySelector("#contestError"); error.hidden = true;
    const name = document.querySelector("#contestName").value.trim();
    const role = document.querySelector("#contestRole").value.trim();
    const examISO = document.querySelector("#contestExamDate").value;
    const startISO = document.querySelector("#contestStartDate").value || todayISO();
    const curriculum = pendingCurriculum;
    if (!name || !role || !examISO) { error.textContent = "Preencha nome do concurso, cargo pretendido e data da prova."; error.hidden = false; return; }
    if (!document.querySelector("#contestPdf").files[0]) { error.textContent = "Anexe o PDF do edital para montar o programa do cargo."; error.hidden = false; return; }
    if (!curriculum.length) { error.textContent = "Selecione novamente o PDF para reconhecer as disciplinas e os assuntos do cargo."; error.hidden = false; return; }
    if (examISO <= startISO) { error.textContent = "A data da prova precisa ser posterior ao início do ciclo."; error.hidden = false; return; }
    const id = `concurso-${Date.now().toString(36)}`;
    const profile = { id, name, role, roleSection: document.querySelector("#contestRoleSection").value.trim(), agency: document.querySelector("#contestAgency").value.trim(), board: document.querySelector("#contestBoard").value.trim(), examISO, startISO, dailyGoalMin: Math.round(Number(document.querySelector("#contestHours").value || 3) * 60), questionGoal: Number(document.querySelector("#contestQuestionGoal").value) || 50, essayEnabled: document.querySelector("#contestEssay").value === "yes", sourceFileName: document.querySelector("#contestPdf").files[0]?.name || "Edital PDF", curriculum, createdAt: new Date().toISOString() };
    await persistProfile(user, profile); activeProfile = profile; dialog.close("selected");
  };
  if (typeof dialog.showModal === "function") dialog.showModal(); else dialog.setAttribute("open", "");
  await new Promise(resolve => dialog.addEventListener("close", resolve, { once: true }));
  if (!activeProfile) activeProfile = library.profiles.find(item => item.id === library.activeId) || library.profiles[0];
  return activeProfile;
}

export function getActiveContest() { return activeProfile; }
