/* Biblioteca de concursos por conta. Os programas são cadastrados manualmente e sincronizados por perfil. */
import { db } from "../firebase-config.js";
import { doc, getDoc, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { CURRICULUM } from "./study-plan.js";
import { todayISO, esc } from "./config.js";

const registryRef = uid => doc(db, "contest_registry", uid);
const profileRef = (uid, id) => doc(db, "contest_profiles", uid, "items", id);
const localKey = uid => `pcpe-contest-library:${uid}`;
let activeProfile = null;
let activeUser = null;
let pendingCurriculum = [];

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
        <section class="contest-manual-program" aria-labelledby="contestProgramTitle">
          <div><h4 id="contestProgramTitle">Monte o programa manualmente</h4><p>Cadastre cada assunto, informe sua disciplina, prioridade e tempo de estudo.</p></div>
          <div class="contest-topic-entry">
            <label>Disciplina<input id="contestSubject" maxlength="90" placeholder="Ex.: Direito Constitucional"></label>
            <label>Assunto<input id="contestTopic" maxlength="180" placeholder="Ex.: Direitos e garantias fundamentais"></label>
            <label>Prioridade<select id="contestTopicPriority"><option value="alta">Alta</option><option value="media">Média</option></select></label>
            <label>Tempo (min)<input id="contestTopicMinutes" type="number" min="30" max="600" step="30" value="60"></label>
            <button class="timer-btn timer-btn--primary" type="button" id="contestAddTopic">＋ Adicionar assunto</button>
          </div>
          <div class="contest-draft-list" id="contestDraftList" aria-live="polite"></div>
        </section>
        <div class="contest-dialog__actions"><button type="button" class="btn-primary" id="saveContestBtn">Salvar cargo e preparar ciclo</button><button type="button" class="btn-ghost" id="backContestBtn">Voltar à lista</button></div>
        <p class="contest-error" id="contestError" role="alert" hidden></p>
      </section>
    </form>
  </dialog>`);
}

function curriculumPreview(items) {
  const subjects = [...new Set(items.map(item => item.subject))];
  return `<strong>${subjects.length} disciplina(s) · ${items.length} assunto(s) cadastrados</strong><small>${subjects.map(esc).join(" · ")}</small>`;
}

function disciplineKey(subject) {
  return subject.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || `disciplina_${uid()}`;
}

function topicRecord(subject, title, priority, minutes) {
  const disc = disciplineKey(subject);
  return { id: `manual-${disc}-${uid()}`, disc, subject, module: "Programa do cargo", priority, minutes: Math.max(30, Number(minutes) || 60), title };
}

function renderDraftCurriculum() {
  const root = document.querySelector("#contestDraftList");
  if (!root) return;
  root.innerHTML = pendingCurriculum.length
    ? `<p class="contest-draft-summary">${curriculumPreview(pendingCurriculum)}</p><ul>${pendingCurriculum.map(item => `<li><span><strong>${esc(item.subject)}</strong><small>${esc(item.title)} · ${item.priority === "alta" ? "Alta" : "Média"} · ${item.minutes} min</small></span><button type="button" data-remove-draft="${esc(item.id)}" aria-label="Remover ${esc(item.title)}">×</button></li>`).join("")}</ul>`
    : `<p class="section-hint">Nenhum assunto cadastrado. Adicione pelo menos um para preparar o ciclo.</p>`;
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
  activeUser = user;
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
  document.querySelector("#newContestBtn").onclick = () => {
    document.querySelector("#contestForm").reset();
    pendingCurriculum = [];
    document.querySelector("#contestStartDate").value = todayISO();
    renderDraftCurriculum();
    showCreate();
  };
  document.querySelector("#backContestBtn").onclick = showList;
  document.querySelector("#contestForm").addEventListener("submit", event => event.preventDefault());
  document.querySelector("#contestStartDate").value = todayISO();
  document.querySelector("#contestCancelBtn").onclick = () => { if (library.profiles.length) dialog.close("selected"); };
  renderDraftCurriculum();
  document.querySelector("#contestAddTopic").onclick = () => {
    const subject = document.querySelector("#contestSubject").value.trim();
    const title = document.querySelector("#contestTopic").value.trim();
    const error = document.querySelector("#contestError");
    error.hidden = true;
    if (!subject || !title) { error.textContent = "Preencha a disciplina e o assunto antes de adicionar."; error.hidden = false; return; }
    const duplicate = pendingCurriculum.some(item => item.disc === disciplineKey(subject) && item.title.toLocaleLowerCase("pt-BR") === title.toLocaleLowerCase("pt-BR"));
    if (duplicate) { error.textContent = "Esse assunto já foi adicionado para esta disciplina."; error.hidden = false; return; }
    pendingCurriculum.push(topicRecord(subject, title, document.querySelector("#contestTopicPriority").value, document.querySelector("#contestTopicMinutes").value));
    document.querySelector("#contestTopic").value = "";
    renderDraftCurriculum();
  };
  document.querySelector("#contestDraftList").onclick = event => {
    const button = event.target.closest("[data-remove-draft]");
    if (!button) return;
    pendingCurriculum = pendingCurriculum.filter(item => item.id !== button.dataset.removeDraft);
    renderDraftCurriculum();
  };
  document.querySelector("#saveContestBtn").onclick = async () => {
    const error = document.querySelector("#contestError"); error.hidden = true;
    const name = document.querySelector("#contestName").value.trim();
    const role = document.querySelector("#contestRole").value.trim();
    const examISO = document.querySelector("#contestExamDate").value;
    const startISO = document.querySelector("#contestStartDate").value || todayISO();
    const curriculum = pendingCurriculum;
    if (!name || !role || !examISO) { error.textContent = "Preencha nome do concurso, cargo pretendido e data da prova."; error.hidden = false; return; }
    if (!curriculum.length) { error.textContent = "Adicione ao menos uma disciplina e um assunto ao programa do cargo."; error.hidden = false; return; }
    if (examISO <= startISO) { error.textContent = "A data da prova precisa ser posterior ao início do ciclo."; error.hidden = false; return; }
    const id = `concurso-${Date.now().toString(36)}`;
    const profile = { id, name, role, roleSection: document.querySelector("#contestRoleSection").value.trim(), agency: document.querySelector("#contestAgency").value.trim(), board: document.querySelector("#contestBoard").value.trim(), examISO, startISO, dailyGoalMin: Math.round(Number(document.querySelector("#contestHours").value || 3) * 60), questionGoal: Number(document.querySelector("#contestQuestionGoal").value) || 50, essayEnabled: document.querySelector("#contestEssay").value === "yes", sourceFileName: "Programa cadastrado manualmente", curriculum, createdAt: new Date().toISOString() };
    await persistProfile(user, profile); activeProfile = profile; dialog.close("selected");
  };
  if (typeof dialog.showModal === "function") dialog.showModal(); else dialog.setAttribute("open", "");
  await new Promise(resolve => dialog.addEventListener("close", resolve, { once: true }));
  if (!activeProfile) activeProfile = library.profiles.find(item => item.id === library.activeId) || library.profiles[0];
  return activeProfile;
}

export function getActiveContest() { return activeProfile; }

export async function persistActiveCurriculum(items) {
  if (!activeProfile || !activeUser) throw new Error("Nenhum concurso ativo para salvar o programa.");
  const profile = { ...activeProfile, curriculum: items.map(item => ({ ...item })) };
  activeProfile = profile;
  const library = localRead(activeUser.uid);
  library.profiles = [profile, ...(library.profiles || []).filter(item => item.id !== profile.id)];
  library.activeId = profile.id;
  localWrite(activeUser.uid, library);
  let synced = true;
  try { await setDoc(profileRef(activeUser.uid, profile.id), profile); }
  catch (error) { synced = false; console.warn("Programa salvo localmente; perfil ainda não sincronizou", error); }
  try {
    const metadata = { activeId: profile.id, removedIds: library.removedIds || [], profiles: library.profiles.map(({ curriculum, ...item }) => item) };
    await setDoc(registryRef(activeUser.uid), metadata);
  } catch (error) { synced = false; console.warn("Programa salvo localmente; biblioteca ainda não sincronizou", error); }
  return synced;
}
