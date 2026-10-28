/* ==========================================================================
   OPERAÇÃO PCPE — app.js
   Painel gamificado: missões, laboratório de horas, cronômetro e flashcards.
   Concurso PCPE 2026/2027 — Cargo 1, Agente de Polícia
   ========================================================================== */
import { auth } from "../firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  EXAM_DATE, CAMPAIGN_START, RISK_FROM, DAILY_GOAL_MIN, DISCIPLINES, WEEK, BREAK_MIN,
  $, $$, esc, toast, downloadFile, todayISO, fmtDur, hhmm, toMin, weekdayIndex, discMeta, diffDaysISO, pad,
} from "./config.js";
import { S, loadAll, save, flushNow, onSync, onChange, bumpStreak, effectiveStreak, exportAll, importAll, resetProgress } from "./store.js";

/* ------------------------------------------------------------------ */
/* DADOS DAS MISSÕES                                                   */
/* ------------------------------------------------------------------ */
const XP_PER_LEVEL = 150, XP_TASK = 20, XP_RULE = 10, XP_TOOL = 15, XP_VIDEO = 10, XP_BOSS = 500;

const RANKS = [
  "Recruta", "Cabo de Estudos", "Investigador Júnior", "Agente em Formação",
  "Patrulheiro de Questões", "Caçador de Pegadinhas da Banca", "Veterano do TAF",
  "Elite da Legislação Estadual", "Pronto(a) Para o Edital", "Classificado(a) — Agente PCPE",
];

/* IMPORTANTE: os ids das missões são "fase-posição". Para não bagunçar o progresso
   já salvo, tarefas novas entram SEMPRE no fim da lista da fase. */
const PHASES = [
  { id: "f1", label: "F1", title: "Base", dates: "05/10–15/11", proportion: "teoria completa",
    focus: "Primeira passada completa em todas as matérias, seguindo a semana-tipo (seg: Constitucional, ter: Administrativo, qua: Penal, qui: Processual Penal + Legislação Estadual, sex: Português, sáb: Informática + RLM, dom: Contabilidade + Estatística + Redação). No treino: base de força (negativas, dead hang, elástico) para a barra e base aeróbica (run-walk) para a corrida.",
    tasks: [
      { t: "Estudar Direito Constitucional — teoria completa", tag: "dir_constitucional" },
      { t: "Estudar Direito Administrativo — teoria completa", tag: "dir_administrativo" },
      { t: "Estudar Direito Penal — teoria + leis especiais (hediondos, tortura, ECA, drogas etc.)", tag: "dir_penal" },
      { t: "Estudar Direito Processual Penal — teoria completa", tag: "dir_processual_penal" },
      { t: "Estudar a legislação estadual e da carreira (Lei 6.123/1968, LC 137/2008, Decreto 44.469/2017, Lei 6.425/1972, Lei 14.735/2023) — confirme a lista no item 22 do edital", tag: "leg_estadual" },
      { t: "Revisar Língua Portuguesa — gramática e interpretação de texto", tag: "portugues" },
      { t: "Revisar Informática — Windows, Word, Excel, PowerPoint e redes", tag: "informatica" },
      { t: "Revisar Raciocínio Lógico — conjuntos, proporção, lógica proposicional", tag: "raciocinio_logico" },
      { t: "Introdução à Contabilidade Geral", tag: "contabilidade" },
      { t: "Introdução à Estatística — descritiva e probabilidade", tag: "estatistica" },
      { t: "Treino de barra: negativas controladas + dead hang + elástico (3x/semana)", tag: "barra" },
      { t: "Treino de corrida: run-walk 1:1, 20–25min (3x/semana)", tag: "corrida" },
      { t: "Manutenção de natação (1x/semana)", tag: "natacao" },
      { t: "Manutenção de salto horizontal — técnica (1x/semana)", tag: "salto" },
      { t: "Redação: ler como a nota é calculada (30 pontos, mínimo de 15, desconto de 6 × erros ÷ linhas) e escrever o primeiro texto de 30 linhas à mão", tag: "redacao" },
    ] },
  { id: "f2", label: "F2", title: "Construção", dates: "16/11–27/12", proportion: "teoria + questões",
    focus: "Aprofundar as matérias e começar questões comentadas, no mesmo template semanal. Redação: um texto por semana. No treino: elástico mais fino na barra, buscando a 1ª repetição livre; corrida contínua progressiva.",
    tasks: [
      { t: "Aprofundar Direito Constitucional + questões comentadas", tag: "dir_constitucional" },
      { t: "Aprofundar Direito Administrativo + questões comentadas", tag: "dir_administrativo" },
      { t: "Aprofundar Direito Penal (leis especiais) + questões comentadas", tag: "dir_penal" },
      { t: "Aprofundar Direito Processual Penal + questões comentadas", tag: "dir_processual_penal" },
      { t: "Fixar a legislação estadual e da carreira com flashcards (decoreba ativa)", tag: "leg_estadual" },
      { t: "Questões comentadas de Português (formato múltipla escolha)", tag: "portugues" },
      { t: "Praticar Word/Excel/PowerPoint com questões de concurso", tag: "informatica" },
      { t: "Questões de Raciocínio Lógico — foco em lógica proposicional", tag: "raciocinio_logico" },
      { t: "Questões de Contabilidade Geral — lançamentos e balancete", tag: "contabilidade" },
      { t: "Questões de Estatística — probabilidade e amostragem", tag: "estatistica" },
      { t: "Treino de barra: elástico mais fino, buscando a 1ª repetição livre", tag: "barra" },
      { t: "Treino de corrida: contínua 25min + 1 treino intervalado leve/semana", tag: "corrida" },
      { t: "Manutenção de natação (1x/semana)", tag: "natacao" },
      { t: "Manutenção de salto horizontal (1x/semana)", tag: "salto" },
      { t: "Redação: 1 texto manuscrito por semana, de 30 linhas, com revisão de grafia e vocabulário", tag: "redacao" },
    ] },
  { id: "f3", label: "F3", title: "Intensificação", dates: "28/12–31/01", proportion: "questões intensivas",
    focus: "Questões intensivas estilo banca (múltipla escolha, 5 alternativas) em todas as matérias, com revisão espaçada dos erros. Redação continua toda semana. No treino: reduzir a assistência do elástico buscando 2 repetições livres; corrida no ritmo-alvo com teste cronometrado quinzenal.",
    tasks: [
      { t: "Questões intensivas de Direito Constitucional", tag: "dir_constitucional" },
      { t: "Questões intensivas de Direito Administrativo", tag: "dir_administrativo" },
      { t: "Questões intensivas de Direito Penal", tag: "dir_penal" },
      { t: "Questões intensivas de Direito Processual Penal", tag: "dir_processual_penal" },
      { t: "Revisão ativa da legislação estadual e da carreira (flashcards)", tag: "leg_estadual" },
      { t: "Questões intensivas de Português", tag: "portugues" },
      { t: "Questões intensivas de Informática", tag: "informatica" },
      { t: "Questões intensivas de Raciocínio Lógico", tag: "raciocinio_logico" },
      { t: "Questões intensivas de Contabilidade Geral", tag: "contabilidade" },
      { t: "Questões intensivas de Estatística", tag: "estatistica" },
      { t: "Redação de tema de segurança pública + leitura de atualidades da área", tag: "redacao" },
      { t: "Treino de barra: elástico mais fino, buscando 2 repetições livres seguidas", tag: "barra" },
      { t: "Treino de corrida: ritmo-alvo de 5:15/km ou menos (5:30/km dá só 2.182m e reprova) + teste cronometrado de 12min quinzenal", tag: "corrida" },
      { t: "Manutenção de natação (1x/semana)", tag: "natacao" },
      { t: "Manutenção de salto horizontal (1x/semana)", tag: "salto" },
    ] },
  { id: "f4", label: "F4", title: "Simulados completos", dates: "01/02–21/02", proportion: "simulados cronometrados",
    focus: "Simulados completos cronometrados de P1 (20 questões) e P2 (40 questões) nas condições reais, com análise de erros por matéria. Redação cronometrada. No treino: simulação completa do TAF, com os 4 testes em sequência e 5min de intervalo entre eles.",
    tasks: [
      { t: "Simulado completo cronometrado — P1 Noções de Direito (20 questões)", tag: "geral" },
      { t: "Simulado completo cronometrado — P2 Conhecimentos Específicos (40 questões)", tag: "geral" },
      { t: "Analisar erros dos simulados por matéria e reforçar pontos fracos", tag: "geral" },
      { t: "Praticar redação cronometrada (tema de segurança pública, 30 linhas)", tag: "redacao" },
      { t: "Simular teste de barra em condição real (tentativa de 3 repetições)", tag: "barra" },
      { t: "Simular teste de corrida de 12 minutos em condição real, cronometrado", tag: "corrida" },
      { t: "Revisar técnica de salto horizontal antes do simulado completo do TAF", tag: "salto" },
      { t: "Revisar técnica de natação antes do simulado completo do TAF", tag: "natacao" },
      { t: "Simulado completo do TAF — os 4 testes em sequência, intervalo de 5min", tag: "geral" },
    ] },
  { id: "f5", label: "F5", title: "Reta final", dates: "22/02–07/03", proportion: "revisão leve · taper",
    focus: "Revisão leve de todas as matérias, sem conteúdo novo. Foco no que dá mais retorno por minuto (legislação estadual e leis penais especiais). No treino: taper — reduzir o volume em 40–50%, sem buscar recorde, chegando descansado para o dia da prova.",
    tasks: [
      { t: "Revisão leve geral de Direito (P1) — sem conteúdo novo", tag: "geral" },
      { t: "Revisão leve geral de Conhecimentos Específicos (P2) — sem conteúdo novo", tag: "geral" },
      { t: "Revisão final da legislação estadual e das leis penais especiais", tag: "leg_estadual" },
      { t: "Treino leve de manutenção — barra, sem buscar recorde pessoal", tag: "barra" },
      { t: "Treino leve de manutenção — corrida, volume reduzido", tag: "corrida" },
      { t: "Descanso ativo na véspera (06/03) — nada de treino pesado, só alongamento leve", tag: "geral" },
      { t: "Organizar documentos, caneta preta transparente e local de prova para 07/03 (tarde)", tag: "geral" },
    ] },
  { id: "boss", label: "BOSS", title: "Concurso PCPE — Agente", dates: "07/03/2027 · tarde", proportion: "P1 (20) + P2 (40) + P3 Redação", isBoss: true,
    focus: "O chefe final. Nota mínima de 30,00 em 60,00 na soma de P1+P2 (só elimina; quem avança é o ranking). A redação vale 30 pontos e exige 15. O TAF vem depois, como apto/inapto.",
    tasks: [ { t: "Realizar a prova — Cargo 1, Agente de Polícia (PCPE)", tag: "geral", xp: XP_BOSS } ] },
];

const RULES = [
  { t: "A nota mínima (30/60) é sobre a soma de P1+P2 e só elimina. Para passar do corte de 4.680, o que conta é o ranking: reforce a matéria mais fraca do momento, não só a favorita." },
  { t: "Treino de barra e corrida tem prioridade fixa seg–sáb, mesmo em semana cheia de estudo — o TAF é eliminatório por si só, nota alta na prova não compensa reprovação nele." },
  { t: "Domingo é descanso físico (sem treino), mas pode ter revisão geral ou prática de redação." },
  { t: "Revisão espaçada: a cada 2 semanas, revisar rapidamente Direito Penal e Processual Penal — matérias com mais leis específicas para decorar." },
  { t: "Na véspera (06/03) e na manhã do dia da prova (07/03, que é à tarde): nada de treino pesado, só alongamento leve e descanso mental." },
];

const TOOLKIT = [
  { t: "Montar um caderno de erros separado por P1 (Direito) e P2 (Específicos), mais um de erros de grafia da redação." },
  { t: "A prova é múltipla escolha com 5 alternativas (A–E), não o Certo/Errado clássico do Cebraspe. Treine nesse formato desde o início." },
  { t: "Resumir as leis da carreira citadas no edital (Lei 6.123/1968, LC 137/2008, Decreto 44.469/2017, Lei 6.425/1972, Lei 14.735/2023): decoreba pura, com alto retorno por hora estudada." },
  { t: "Buscar provas anteriores do Cebraspe para Agente/Investigador, mesmo de outros estados, para treinar o estilo da banca." },
  { t: "A partir da Fase 4, treinar com simulados cronometrados completos (60 questões objetivas + redação, sem consulta). Use o Cronômetro no modo regressivo de 4h." },
];

const VIDEO_TRACKS = [
  { tag: "dir_constitucional", t: "Direitos e garantias fundamentais (CF/88)", query: "direitos e garantias fundamentais constituição aula concurso" },
  { tag: "dir_constitucional", t: "Organização político-administrativa do Estado", query: "organização político administrativa do estado aula concurso" },
  { tag: "dir_administrativo", t: "Atos administrativos — conceito e atributos", query: "atos administrativos conceito atributos aula concurso" },
  { tag: "dir_administrativo", t: "Poderes da administração pública (hierárquico, disciplinar, de polícia)", query: "poderes da administração pública aula concurso" },
  { tag: "dir_penal", t: "Crimes contra a pessoa e contra o patrimônio", query: "crimes contra a pessoa crimes contra o patrimônio aula concurso" },
  { tag: "dir_penal", t: "Lei de drogas (Lei 11.343/2006) — resumo", query: "lei de drogas 11343 resumo aula concurso" },
  { tag: "dir_penal", t: "Estatuto do Desarmamento — resumo", query: "estatuto do desarmamento resumo aula concurso" },
  { tag: "dir_processual_penal", t: "Inquérito policial — conceito e características", query: "inquérito policial conceito características aula concurso" },
  { tag: "dir_processual_penal", t: "Prisão e liberdade provisória", query: "prisão e liberdade provisória aula concurso" },
  { tag: "leg_estadual", t: "Estatuto do Policial Civil de Pernambuco (Lei 6.425/1972)", query: "estatuto do policial civil pernambuco lei 6425 resumo" },
  { tag: "portugues", t: "Coesão e coerência textual", query: "coesão e coerência textual aula concurso" },
  { tag: "portugues", t: "Concordância verbal e nominal", query: "concordância verbal e nominal aula concurso" },
  { tag: "informatica", t: "Redes de computadores — conceitos básicos de internet e segurança", query: "redes de computadores conceitos internet segurança aula concurso" },
  { tag: "informatica", t: "Excel — fórmulas e funções básicas para concurso", query: "excel fórmulas funções básicas concurso" },
  { tag: "raciocinio_logico", t: "Lógica proposicional — tabela-verdade e equivalências", query: "lógica proposicional tabela verdade equivalências aula concurso" },
  { tag: "raciocinio_logico", t: "Razões, proporções e regra de três", query: "razões proporções regra de três aula concurso" },
  { tag: "contabilidade", t: "Patrimônio e equação contábil fundamental", query: "patrimônio equação contábil fundamental aula concurso" },
  { tag: "contabilidade", t: "Balancete de verificação e balanço patrimonial", query: "balancete de verificação balanço patrimonial aula concurso" },
  { tag: "estatistica", t: "Probabilidade — conceitos básicos e condicional", query: "probabilidade conceitos básicos condicional aula concurso" },
  { tag: "estatistica", t: "Técnicas de amostragem", query: "técnicas de amostragem estatística aula concurso" },
  { tag: "redacao", t: "Como estruturar redação dissertativa para concurso", query: "como estruturar redação dissertativa concurso policial" },
  { tag: "barra", t: "Progressão de barra fixa para iniciantes (negativas, elástico)", query: "progressão barra fixa iniciantes negativas elástico pull up" },
  { tag: "corrida", t: "Treino de corrida para teste de 12 minutos (Cooper)", query: "treino corrida teste 12 minutos cooper concurso" },
];

const VIDEO_GROUPS = [
  ["dir_constitucional", "Direito Constitucional"], ["dir_administrativo", "Direito Administrativo"], ["dir_penal", "Direito Penal"],
  ["dir_processual_penal", "Direito Processual Penal"], ["leg_estadual", "Legislação Estadual"], ["portugues", "Língua Portuguesa"],
  ["informatica", "Informática"], ["raciocinio_logico", "Raciocínio Lógico"], ["contabilidade", "Contabilidade Geral"],
  ["estatistica", "Estatística"], ["redacao", "Redação"], ["barra", "TAF — Barra"], ["corrida", "TAF — Corrida"],
];

const ALL_TASKS = [];
PHASES.forEach(w => w.tasks.forEach((task, i) => { task.id = w.id + "-" + i; task.xp = task.xp || XP_TASK; task.phase = w.id; ALL_TASKS.push(task); }));
RULES.forEach((r, i) => { r.id = "rule-" + i; r.xp = XP_RULE; ALL_TASKS.push(r); });
TOOLKIT.forEach((r, i) => { r.id = "tool-" + i; r.xp = XP_TOOL; ALL_TASKS.push(r); });
VIDEO_TRACKS.forEach((v, i) => { v.id = "yt-" + i; v.xp = XP_VIDEO; ALL_TASKS.push(v); });
const TASK_BY_ID = new Map(ALL_TASKS.map(t => [t.id, t]));

/* ------------------------------------------------------------------ */
/* MODELO DERIVADO                                                     */
/* ------------------------------------------------------------------ */
const isDone = id => !!S.progress.completed[id];
const currentXP = () => ALL_TASKS.reduce((sum, t) => sum + (isDone(t.id) ? t.xp : 0), 0);
const bossDone = () => isDone("boss-0");
function levelFromXP(xp) {
  const cap = bossDone() ? RANKS.length : RANKS.length - 1;
  return Math.min(cap, Math.floor(xp / XP_PER_LEVEL) + 1);
}
function disciplineProgress(key) {
  const tasks = ALL_TASKS.filter(t => t.tag === key);
  const done = tasks.filter(t => isDone(t.id)).length;
  return { done, total: tasks.length, pct: tasks.length ? Math.round(done / tasks.length * 100) : 0 };
}
function phaseProgress(phase) {
  const done = phase.tasks.filter(t => isDone(t.id)).length;
  return { done, total: phase.tasks.length, pct: phase.tasks.length ? Math.round(done / phase.tasks.length * 100) : 0 };
}
function minutesOn(dateISO) {
  const entries = (S.lab && S.lab.entries) || [];
  let sec = 0;
  entries.forEach(e => { if (e.date === dateISO && discMeta(e.disc).group === "estudo") sec += e.sec || 0; });
  return Math.round(sec / 60);
}
const goalMin = () => Math.max(30, Number(S.lab && S.lab.goalMin) || DAILY_GOAL_MIN);

/* ------------------------------------------------------------------ */
/* RENDER                                                              */
/* ------------------------------------------------------------------ */
let user = null;

function renderHUD() {
  const xp = currentXP();
  const level = levelFromXP(xp);
  const maxed = level >= RANKS.length;
  const waitingBoss = !bossDone() && xp >= (RANKS.length - 1) * XP_PER_LEVEL;
  const into = xp - (level - 1) * XP_PER_LEVEL;
  const pct = maxed || waitingBoss ? 100 : Math.min(100, Math.round(into / XP_PER_LEVEL * 100));

  $("#levelBadge").textContent = "LV " + level;
  $("#rankName").textContent = RANKS[level - 1];
  $("#xpLabel").textContent = maxed ? xp + " XP · MÁXIMO" : waitingBoss ? xp + " XP · derrote o BOSS" : into + " / " + XP_PER_LEVEL + " XP";
  $("#xpBar").style.width = pct + "%";
  $("#xpBarWrap").setAttribute("aria-valuenow", pct);

  const doneTasks = ALL_TASKS.filter(t => isDone(t.id)).length;
  $("#questPct").textContent = doneTasks + " / " + ALL_TASKS.length;
  $("#questBar").style.width = Math.round(doneTasks / ALL_TASKS.length * 100) + "%";

  const span = EXAM_DATE - CAMPAIGN_START;
  const elapsed = Math.min(Math.max(Date.now() - CAMPAIGN_START, 0), span);
  const cp = Math.round(elapsed / span * 100);
  $("#campaignBar").style.width = cp + "%";
  $("#campaignPct").textContent = cp + "%";

  renderToday();
  const st = effectiveStreak();
  $("#streakCount").textContent = "🔥 " + st + (st === 1 ? " dia" : " dias");
}

function renderToday() {
  const min = minutesOn(todayISO()), goal = goalMin();
  $("#todayBar").style.width = Math.min(100, Math.round(min / goal * 100)) + "%";
  $("#todayLabel").textContent = fmtDur(min * 60) + " / " + fmtDur(goal * 60);
}

function renderCountdown() {
  let diff = Math.max(0, EXAM_DATE - Date.now());
  $("#cdDays").textContent = pad(Math.floor(diff / 86400000));
  $("#cdHours").textContent = pad(Math.floor(diff % 86400000 / 3600000));
  $("#cdMins").textContent = pad(Math.floor(diff % 3600000 / 60000));
  $("#cdSecs").textContent = pad(Math.floor(diff % 60000 / 1000));
}

function renderDisciplines() {
  const boxes = { P1: $("#barsP1"), P2: $("#barsP2"), P3: $("#barsP3"), TAF: $("#barsTAF") };
  Object.values(boxes).forEach(b => { b.innerHTML = ""; });
  const riskOn = Date.now() >= RISK_FROM;
  Object.entries(DISCIPLINES).forEach(([key, meta]) => {
    const box = boxes[meta.module];
    if (!box) return;
    const p = disciplineProgress(key);
    const risk = riskOn && p.done === 0 && p.total > 0;
    const row = document.createElement("div");
    row.className = "bar-row" + (risk ? " is-zero" : "");
    row.innerHTML = `
      <div class="bar-row-top">
        <span class="discipline-name">${esc(meta.label)} ${risk ? '<span class="zero-flag">risco</span>' : ""}</span>
        <span class="discipline-pct">${p.done}/${p.total} · ${p.pct}%</span>
      </div>
      <div class="bar-track"><div class="bar-fill${meta.module !== "P1" ? " bar-fill--purple" : ""}" style="width:${p.pct}%"></div></div>`;
    box.appendChild(row);
  });
}

function renderMap() {
  const path = $("#mapPath");
  path.innerHTML = "";
  PHASES.forEach(w => {
    const p = phaseProgress(w);
    const wrap = document.createElement("div");
    wrap.className = "node-wrap" + (p.pct === 100 ? " is-done" : "") + (w.isBoss ? " is-boss" : "");
    wrap.innerHTML = `
      <button class="node-btn" type="button" style="--pct:${p.pct}" data-phase="${w.id}" aria-label="Abrir missões de ${esc(w.title)}, ${p.done} de ${p.total} concluídas">
        <span class="node-inner">
          <span class="node-week">${w.label}</span>
          <span class="node-label">${p.pct === 100 ? "✓" : w.isBoss ? "☠" : p.pct + "%"}</span>
          <span class="node-dates">${w.dates}</span>
        </span>
      </button>`;
    path.appendChild(wrap);
  });
}

function checkRow(item, extra = "") {
  const done = isDone(item.id);
  return `<li class="quest-row${done ? " is-checked" : ""}">
    <input type="checkbox" id="${item.id}" data-task="${item.id}"${done ? " checked" : ""}>
    <label for="${item.id}">${esc(item.t)}</label>${extra}
    <span class="xp-tag">+${item.xp} XP</span></li>`;
}
function renderRules() { $("#rulesList").innerHTML = RULES.map(r => checkRow(r)).join(""); }
function renderToolkit() { $("#toolkitList").innerHTML = TOOLKIT.map(r => checkRow(r)).join(""); }
function renderVideos() {
  $("#videoGroups").innerHTML = VIDEO_GROUPS.map(([key, title]) => {
    const items = VIDEO_TRACKS.filter(v => v.tag === key);
    if (!items.length) return "";
    return `<h3 class="video-group-title">${esc(title)}</h3><ul class="video-list">` +
      items.map(v => checkRow(v, `<a class="yt-link" href="https://www.youtube.com/results?search_query=${encodeURIComponent(v.query)}" target="_blank" rel="noopener noreferrer">▶ buscar no YouTube</a>`)).join("") + "</ul>";
  }).join("");
}

function renderMarcos() {
  const checks = S.progress.checks || {};
  $$("#checkList input[data-check]").forEach(cb => {
    cb.checked = !!checks[cb.dataset.check];
    cb.closest(".quest-row").classList.toggle("is-checked", cb.checked);
  });
  const left = diffDaysISO(todayISO(), "2026-11-12");
  $("#msLeft").textContent = left > 0 ? `Faltam ${left} dias para 12/11.` : left === 0 ? "Hoje é 12/11." : "12/11 já passou: confirme no edital se as inscrições ainda estão abertas.";
}

function renderWeek() {
  const startInput = $("#weekStart");
  const start = (S.lab && S.lab.weekStart) || startInput.value || "19:00";
  if (startInput.value !== start) startInput.value = start;
  const today = weekdayIndex();
  $("#weekToday").textContent = "Hoje: " + WEEK[today].dia + " · " + WEEK[today].blocks.reduce((a, b) => a + b.min, 0) / 60 + "h líquidas";
  $("#weekGrid").innerHTML = WEEK.map((d, i) => {
    let t = toMin(start);
    const blocks = d.blocks.map((b, j) => {
      const meta = discMeta(b.disc);
      const from = t; t += b.min;
      const html = `<div class="wk-block" style="--bar:${meta.color}">
        <span class="wk-time">${hhmm(from)}–${hhmm(t)} · ${fmtDur(b.min * 60)}</span>
        <span class="wk-name">${esc(meta.label)}</span>
        <span class="wk-sub">${esc(b.nome)}</span></div>` +
        (j < d.blocks.length - 1 ? `<div class="wk-break">pausa de ${BREAK_MIN}min</div>` : "");
      if (j < d.blocks.length - 1) t += BREAK_MIN;
      return html;
    }).join("");
    return `<div class="week-day${i === today ? " is-today" : ""}"><h3>${d.dia}${i === today ? "<small>hoje</small>" : ""}</h3>${blocks}<div class="wk-taf">🏋️ ${esc(d.taf)}</div></div>`;
  }).join("");
}

const backdrop = $("#drawerBackdrop");
const drawer = $("#questDrawer");
let currentPhaseId = null;
let drawerOpener = null;

function openDrawer(phaseId, opener) {
  const w = PHASES.find(x => x.id === phaseId);
  if (!w) return;
  currentPhaseId = phaseId;
  drawerOpener = opener || document.activeElement;
  $("#drawerEyebrow").textContent = w.isBoss ? "CONCURSO" : "FASE " + w.label.replace("F", "");
  $("#drawerTitle").textContent = w.title;
  $("#drawerDates").textContent = w.dates;
  $("#drawerProportion").textContent = w.proportion;
  $("#drawerFocus").textContent = w.focus;
  renderDrawerTasks();
  drawer.removeAttribute("inert");
  drawer.classList.add("open");
  backdrop.classList.add("open");
  drawer.setAttribute("aria-hidden", "false");
  $("#drawerClose").focus();
}
function closeDrawer() {
  if (!drawer.classList.contains("open")) return;
  drawer.classList.remove("open");
  backdrop.classList.remove("open");
  drawer.setAttribute("aria-hidden", "true");
  drawer.setAttribute("inert", "");
  const back = currentPhaseId && document.querySelector('.node-btn[data-phase="' + currentPhaseId + '"]');
  if (back) back.focus();
  else if (drawerOpener && document.contains(drawerOpener)) drawerOpener.focus();
  else $("#main").focus();
}
function renderDrawerTasks() {
  const w = PHASES.find(x => x.id === currentPhaseId);
  if (!w) return;
  const keepFocus = document.activeElement && document.activeElement.id;
  $("#drawerTasks").innerHTML = w.tasks.map(task => {
    const done = isDone(task.id);
    const tag = DISCIPLINES[task.tag] ? DISCIPLINES[task.tag].label : "geral";
    return `<li class="quest-row${done ? " is-checked" : ""}">
      <input type="checkbox" id="drawer-${task.id}" data-task="${task.id}"${done ? " checked" : ""}>
      <div><label for="drawer-${task.id}">${esc(task.t)}</label><br><span class="tag">${esc(tag)}</span></div>
      <span class="xp-tag">+${task.xp} XP</span></li>`;
  }).join("");
  const p = phaseProgress(w);
  $("#drawerProgressCount").textContent = p.done + "/" + p.total;
  $("#drawerProgressFill").style.width = p.pct + "%";
  if (keepFocus) { const el = document.getElementById(keepFocus); if (el) el.focus(); }
}

function toggleTask(id) {
  const task = TASK_BY_ID.get(id);
  if (!task) return;
  const willBeDone = !isDone(id);
  S.progress.completed[id] = willBeDone;
  if (willBeDone) {
    bumpStreak();
    toast((task.xp === XP_BOSS ? "🏆 BOSS DERROTADO! +" : "+") + task.xp + " XP", 1800);
  }
  save("progress");
}

function renderAll() {
  renderHUD(); renderDisciplines(); renderMap(); renderVideos(); renderRules(); renderToolkit(); renderMarcos(); renderWeek();
  if (drawer.classList.contains("open")) renderDrawerTasks();
}

/* ------------------------------------------------------------------ */
/* ABAS (rotas por hash)                                               */
/* ------------------------------------------------------------------ */
const VIEWS = ["missoes", "lab", "cronometro", "flashcards", "conteudos"];
const TITLES = {
  missoes: "Missões",
  lab: "Laboratório",
  cronometro: "Cronômetro",
  flashcards: "Flashcards",
  conteudos: "Conteúdos",
};
const modules = {};

function showView(name, { focusTab = false } = {}) {
  if (!VIEWS.includes(name)) name = "missoes";
  VIEWS.forEach(v => {
    const on = v === name;
    $("#view-" + v).hidden = !on;
    const tab = $("#tab-" + v);
    tab.setAttribute("aria-selected", String(on));
    tab.tabIndex = on ? 0 : -1;
  });
  document.title = TITLES[name] + " // OPERAÇÃO PCPE";
  if (focusTab) $("#tab-" + name).focus();
  const m = modules[name];
  if (m && typeof m.onShow === "function") { try { m.onShow(); } catch (e) { console.error(e); } }
}

function route() {
  const hash = decodeURIComponent(location.hash.replace(/^#/, ""));
  if (VIEWS.includes(hash)) { showView(hash); return; }
  if (hash && document.getElementById(hash)) {
    showView("missoes");
    document.getElementById(hash).scrollIntoView({ block: "start" });
    return;
  }
  showView("missoes");
}

function wireTabs() {
  const tabs = $$(".view-tab");
  tabs.forEach(tab => {
    tab.addEventListener("click", () => { location.hash = "#" + tab.dataset.view; });
    tab.addEventListener("keydown", e => {
      const i = tabs.indexOf(tab);
      let j = -1;
      if (e.key === "ArrowRight") j = (i + 1) % tabs.length;
      else if (e.key === "ArrowLeft") j = (i - 1 + tabs.length) % tabs.length;
      else if (e.key === "Home") j = 0;
      else if (e.key === "End") j = tabs.length - 1;
      if (j < 0) return;
      e.preventDefault();
      location.hash = "#" + tabs[j].dataset.view;
      tabs[j].focus();
    });
  });
  window.addEventListener("hashchange", route);
  $("#miniTimer").addEventListener("click", () => { location.hash = "#cronometro"; });
}

/* ------------------------------------------------------------------ */
/* EVENTOS                                                             */
/* ------------------------------------------------------------------ */
function wireEvents() {
  document.addEventListener("change", e => {
    const t = e.target;
    if (t.matches && t.matches("input[data-task]")) toggleTask(t.dataset.task);
    else if (t.matches && t.matches("input[data-check]")) {
      S.progress.checks = Object.assign({}, S.progress.checks, { [t.dataset.check]: t.checked });
      save("progress");
    }
  });
  $("#mapPath").addEventListener("click", e => {
    const btn = e.target.closest(".node-btn");
    if (btn) openDrawer(btn.dataset.phase, btn);
  });

  $("#drawerClose").addEventListener("click", closeDrawer);
  backdrop.addEventListener("click", closeDrawer);
  document.addEventListener("keydown", e => {
    if (!drawer.classList.contains("open")) return;
    if (e.key === "Escape") { closeDrawer(); return; }
    if (e.key === "Tab") {
      const f = $$("button, input, a[href]", drawer).filter(el => !el.disabled);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  $("#weekStart").addEventListener("change", e => {
    if (!/^\d{2}:\d{2}$/.test(e.target.value)) return;
    S.lab.weekStart = e.target.value;
    save("lab");
  });

  $("#resetBtn").addEventListener("click", () => {
    if (!confirm("Isso zera suas missões, a sequência e o checklist do edital.\n\nAs horas do Laboratório e os flashcards NÃO são apagados.\n\nContinuar?")) return;
    resetProgress();
    closeDrawer();
    toast("Missões reiniciadas");
  });
  $("#exportBtn").addEventListener("click", () => {
    downloadFile("pcpe-backup-" + todayISO() + ".json", JSON.stringify(exportAll(), null, 2));
    toast("Backup baixado");
  });
  $("#importBtn").addEventListener("click", () => $("#importInput").click());
  $("#importInput").addEventListener("change", e => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const obj = JSON.parse(reader.result);
        const parts = ["progress", "lab", "cards"].filter(k => obj && obj[k]);
        const label = parts.length ? parts.map(k => ({ progress: "missões", lab: "horas", cards: "flashcards" }[k])).join(", ") : "missões";
        if (!confirm("Importar " + label + " deste arquivo? Isso substitui o que você tem agora nessas partes.")) return;
        importAll(obj);
        toast("Backup importado");
      } catch (err) {
        alert("Não foi possível ler esse arquivo. Use um backup .json exportado por este painel.");
      }
    };
    reader.readAsText(file);
  });
  $("#logoutBtn").addEventListener("click", async () => {
    try { await flushNow(); await signOut(auth); } catch (e) { /* sai mesmo assim */ }
    window.location.href = "login.html";
  });

  onSync(s => {
    const chip = $("#syncStatus");
    chip.dataset.state = s.status;
    chip.textContent = s.status === "ok" ? "☁ Sincronizado" : s.status === "saving" ? "☁ Salvando…" : s.status === "error" ? "⚠ Sem nuvem" : "☁ Só neste aparelho";
    chip.title = s.msg || "";
    if (s.status === "error" && s.msg) chip.setAttribute("aria-label", s.msg);
  });

  onChange(name => {
    if (name === "progress") renderAll();
    else if (name === "lab") { renderToday(); renderWeek(); }
  });

  setInterval(renderCountdown, 1000);
  setInterval(renderToday, 60000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { renderHUD(); renderWeek(); } });
}

/* ------------------------------------------------------------------ */
/* ABERTURA                                                            */
/* ------------------------------------------------------------------ */
async function loadModule(name, file) {
  try {
    const m = await import(file);
    modules[name] = m;
    if (typeof m.init === "function") await m.init({ user });
  } catch (err) {
    console.error("Falha ao carregar " + file, err);
    const view = $("#view-" + name);
    if (view && !view.querySelector(".module-error")) {
      const p = document.createElement("p");
      p.className = "empty module-error";
      p.textContent = "Esta tela não carregou (" + file + "). Confira se o arquivo foi enviado ao GitHub.";
      view.prepend(p);
    }
  }
}

let started = false;
async function start(u) {
  if (started) return;
  started = true;
  user = u;
  $("#userBadge").hidden = false;
  $("#userEmailLabel").textContent = u.displayName || u.email || "Operador(a)";
  const cloud = loadAll(u).catch(e => console.error(e));
  await Promise.race([cloud, new Promise(r => setTimeout(r, 4000))]);
  wireEvents();
  wireTabs();
  renderAll();
  renderCountdown();
  document.body.classList.remove("is-auth-pending");
  route();
  await Promise.all([
    loadModule("lab", "./lab.js"),
    loadModule("cronometro", "./timer.js"),
    loadModule("flashcards", "./flashcards.js"),
  ]);
  const cur = currentViewName();
  if (modules[cur] && typeof modules[cur].onShow === "function") { try { modules[cur].onShow(); } catch (e) { console.error(e); } }
}
function currentViewName() { const h = location.hash.replace(/^#/, ""); return VIEWS.includes(h) ? h : "missoes"; }

document.addEventListener("DOMContentLoaded", () => {
  const slow = setTimeout(() => { const m = $("#authPendingMsg"); if (m) m.hidden = false; }, 8000);
  onAuthStateChanged(auth, u => {
    clearTimeout(slow);
    if (!u) { window.location.href = "login.html"; return; }
    start(u);
  });
});