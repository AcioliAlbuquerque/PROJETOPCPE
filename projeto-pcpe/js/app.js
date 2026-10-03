/* ==========================================================================
   OPERAÇÃO PCPE — app.js
   Painel gamificado do cronograma de estudos e treino TAF
   Concurso PCPE 2026/2027 — Cargo 1, Agente de Polícia
   ========================================================================== */
import { auth, db } from "../firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

(function(){
  "use strict";

  /* ------------------------------------------------------------------ */
  /* AUTENTICAÇÃO / USUÁRIO ATUAL                                        */
  /* ------------------------------------------------------------------ */

  let currentUser = null;
  let cloudSyncTimer = null;

  /* ------------------------------------------------------------------ */
  /* DADOS                                                               */
  /* ------------------------------------------------------------------ */

  // Prova: 07/03/2027, turno da tarde (horário exato ainda não divulgado — ajuste quando sair o edital de locais)
  const EXAM_DATE = new Date("2027-03-07T14:00:00-03:00");
  const CAMPAIGN_START = new Date("2026-10-05T00:00:00-03:00");
  const XP_PER_LEVEL = 150;
  const XP_TASK = 20;
  const XP_RULE = 10;
  const XP_TOOL = 15;
  const XP_VIDEO = 10;
  const XP_BOSS = 500;

  const DISCIPLINES = {
    dir_constitucional:  { label: "Direito Constitucional",    module: "P1" },
    dir_administrativo:  { label: "Direito Administrativo",    module: "P1" },
    dir_penal:           { label: "Direito Penal",             module: "P1" },
    dir_processual_penal:{ label: "Direito Processual Penal",  module: "P1" },
    leg_estadual:        { label: "Legislação Estadual",       module: "P1" },
    portugues:           { label: "Língua Portuguesa",         module: "P2" },
    informatica:         { label: "Informática",               module: "P2" },
    raciocinio_logico:   { label: "Raciocínio Lógico",         module: "P2" },
    contabilidade:       { label: "Contabilidade Geral",       module: "P2" },
    estatistica:         { label: "Estatística",               module: "P2" },
    redacao:             { label: "Redação / Atualidades",     module: "P2" },
    barra:               { label: "Barra (flexão)",            module: "TAF" },
    corrida:              { label: "Corrida 12min",             module: "TAF" },
    natacao:              { label: "Natação 50m",               module: "TAF" },
    salto:                { label: "Salto horizontal",          module: "TAF" },
  };

  const RANKS = [
    "Recruta", "Cabo de Estudos", "Investigador Júnior", "Agente em Formação",
    "Patrulheiro de Questões", "Caçador de Pegadinhas da Banca", "Veterano do TAF",
    "Elite da Legislação Estadual", "Pronto(a) Para o Edital", "Classificado(a) — Agente PCPE"
  ];

  const PHASES = [
    {
      id: "f1", label: "F1", title: "Base", dates: "05/10–15/11",
      proportion: "teoria completa",
      focus: "Primeira passada completa em todas as 10 matérias, seguindo o template semanal (seg: Constitucional, ter: Administrativo, qua: Penal, qui: Processual Penal + Legislação Estadual, sex: Português, sáb: Informática+RLM, dom: Contabilidade+Estatística+revisão). No treino: construir a base de força (negativas, dead hang, elástico) para a barra e a base aeróbica (run-walk) para a corrida.",
      tasks: [
        { t: "Estudar Direito Constitucional — teoria completa", tag: "dir_constitucional" },
        { t: "Estudar Direito Administrativo — teoria completa", tag: "dir_administrativo" },
        { t: "Estudar Direito Penal — teoria + leis especiais (hediondos, tortura, ECA, drogas etc.)", tag: "dir_penal" },
        { t: "Estudar Direito Processual Penal — teoria completa", tag: "dir_processual_penal" },
        { t: "Estudar Legislação Estadual (Constituição PE, Estatuto do Policial Civil, LC 137/2008, LC 317/2015)", tag: "leg_estadual" },
        { t: "Revisar Língua Portuguesa — gramática e interpretação de texto", tag: "portugues" },
        { t: "Revisar Informática — Windows, Word, Excel, PowerPoint e redes", tag: "informatica" },
        { t: "Revisar Raciocínio Lógico — conjuntos, proporção, lógica proposicional", tag: "raciocinio_logico" },
        { t: "Introdução à Contabilidade Geral", tag: "contabilidade" },
        { t: "Introdução à Estatística — descritiva e probabilidade", tag: "estatistica" },
        { t: "Treino de barra: negativas controladas + dead hang + elástico (3x/semana)", tag: "barra" },
        { t: "Treino de corrida: run-walk 1:1, 20–25min (3x/semana)", tag: "corrida" },
        { t: "Manutenção de natação (1x/semana)", tag: "natacao" },
        { t: "Manutenção de salto horizontal — técnica (1x/semana)", tag: "salto" },
      ]
    },
    {
      id: "f2", label: "F2", title: "Construção", dates: "16/11–27/12",
      proportion: "teoria + questões",
      focus: "Aprofundar as 10 matérias e começar questões comentadas por matéria, no mesmo template semanal. No treino: elástico de assistência mais fino na barra, buscando a 1ª repetição livre; corrida contínua progressiva.",
      tasks: [
        { t: "Aprofundar Direito Constitucional + questões comentadas", tag: "dir_constitucional" },
        { t: "Aprofundar Direito Administrativo + questões comentadas", tag: "dir_administrativo" },
        { t: "Aprofundar Direito Penal (leis especiais) + questões comentadas", tag: "dir_penal" },
        { t: "Aprofundar Direito Processual Penal + questões comentadas", tag: "dir_processual_penal" },
        { t: "Fixar Legislação Estadual com flashcards (decoreba ativa)", tag: "leg_estadual" },
        { t: "Questões comentadas de Português (formato múltipla escolha)", tag: "portugues" },
        { t: "Praticar Word/Excel/PowerPoint com questões de concurso", tag: "informatica" },
        { t: "Questões de Raciocínio Lógico — foco em lógica proposicional", tag: "raciocinio_logico" },
        { t: "Questões de Contabilidade Geral — lançamentos e balancete", tag: "contabilidade" },
        { t: "Questões de Estatística — probabilidade e amostragem", tag: "estatistica" },
        { t: "Treino de barra: elástico mais fino, buscando a 1ª repetição livre", tag: "barra" },
        { t: "Treino de corrida: contínua 25min + 1 treino intervalado leve/semana", tag: "corrida" },
        { t: "Manutenção de natação (1x/semana)", tag: "natacao" },
        { t: "Manutenção de salto horizontal (1x/semana)", tag: "salto" },
      ]
    },
    {
      id: "f3", label: "F3", title: "Intensificação", dates: "28/12–31/01",
      proportion: "questões intensivas",
      focus: "Questões intensivas estilo banca (múltipla escolha, 5 alternativas) em todas as matérias, com revisão espaçada dos erros. Início da prática de redação. No treino: reduzir a assistência do elástico na barra buscando 2 repetições livres; corrida em ritmo-alvo com teste cronometrado quinzenal.",
      tasks: [
        { t: "Questões intensivas de Direito Constitucional", tag: "dir_constitucional" },
        { t: "Questões intensivas de Direito Administrativo", tag: "dir_administrativo" },
        { t: "Questões intensivas de Direito Penal", tag: "dir_penal" },
        { t: "Questões intensivas de Direito Processual Penal", tag: "dir_processual_penal" },
        { t: "Revisão ativa de Legislação Estadual (flashcards)", tag: "leg_estadual" },
        { t: "Questões intensivas de Português", tag: "portugues" },
        { t: "Questões intensivas de Informática", tag: "informatica" },
        { t: "Questões intensivas de Raciocínio Lógico", tag: "raciocinio_logico" },
        { t: "Questões intensivas de Contabilidade Geral", tag: "contabilidade" },
        { t: "Questões intensivas de Estatística", tag: "estatistica" },
        { t: "Primeiro treino de redação (tema de segurança pública) + leitura de atualidades da área", tag: "redacao" },
        { t: "Treino de barra: elástico mais fino, buscando 2 repetições livres seguidas", tag: "barra" },
        { t: "Treino de corrida: ritmo-alvo (~5:30/km) + teste cronometrado de 12min quinzenal", tag: "corrida" },
        { t: "Manutenção de natação (1x/semana)", tag: "natacao" },
        { t: "Manutenção de salto horizontal (1x/semana)", tag: "salto" },
      ]
    },
    {
      id: "f4", label: "F4", title: "Simulados completos", dates: "01/02–21/02",
      proportion: "simulados cronometrados",
      focus: "Simulados completos cronometrados de P1 (20 questões) e P2 (40 questões) nas condições reais de tempo, com análise de erros por matéria. Redação cronometrada. No treino: simulação completa do TAF — os 4 testes em sequência real, com 5min de intervalo entre eles.",
      tasks: [
        { t: "Simulado completo cronometrado — P1 Noções de Direito (20 questões)", tag: "dir_constitucional" },
        { t: "Simulado completo cronometrado — P2 Conhecimentos Específicos (40 questões)", tag: "portugues" },
        { t: "Analisar erros dos simulados por matéria e reforçar pontos fracos", tag: "geral" },
        { t: "Praticar redação cronometrada (tema de segurança pública)", tag: "redacao" },
        { t: "Simular teste de barra em condição real (tentativa de 3 repetições)", tag: "barra" },
        { t: "Simular teste de corrida de 12 minutos em condição real, cronometrado", tag: "corrida" },
        { t: "Revisar técnica de salto horizontal antes do simulado completo do TAF", tag: "salto" },
        { t: "Revisar técnica de natação antes do simulado completo do TAF", tag: "natacao" },
        { t: "Simulado completo do TAF — os 4 testes em sequência, intervalo de 5min", tag: "geral" },
      ]
    },
    {
      id: "f5", label: "F5", title: "Reta final", dates: "22/02–07/03",
      proportion: "revisão leve · taper",
      focus: "Revisão leve de todas as matérias, sem conteúdo novo — foco no que dá mais retorno por minuto (Legislação Estadual e leis penais especiais). No treino: taper — reduzir o volume em 40–50%, sem buscar recorde pessoal, chegando descansado para o dia da prova.",
      tasks: [
        { t: "Revisão leve geral de Direito (P1) — sem conteúdo novo", tag: "geral" },
        { t: "Revisão leve geral de Conhecimentos Específicos (P2) — sem conteúdo novo", tag: "geral" },
        { t: "Revisão final de Legislação Estadual e leis penais especiais", tag: "leg_estadual" },
        { t: "Treino leve de manutenção — barra, sem buscar recorde pessoal", tag: "barra" },
        { t: "Treino leve de manutenção — corrida, volume reduzido", tag: "corrida" },
        { t: "Descanso ativo na véspera (06/03) — nada de treino pesado, só alongamento leve", tag: "geral" },
        { t: "Organizar documentos e local de prova para 07/03 (tarde)", tag: "geral" },
      ]
    },
    {
      id: "boss", label: "BOSS", title: "Concurso PCPE — Agente", dates: "07/03/2027 · tarde",
      proportion: "P1 (20) + P2 (40) + P3 Redação",
      focus: "O chefe final da campanha. Nota mínima: 30,00 de 60,00 pontos em P1+P2. Redação eliminatória e classificatória. TAF em etapa posterior, apto/inapto.",
      isBoss: true,
      tasks: [
        { t: "Realizar a prova — Cargo 1, Agente de Polícia (PCPE)", tag: "geral", xp: XP_BOSS },
      ]
    },
  ];

  const RULES = [
    { t: "A nota mínima (30/60) é sobre a soma de P1+P2 — reforce sempre a matéria mais fraca do momento, não só a favorita." },
    { t: "Treino de barra e corrida tem prioridade fixa seg–sáb, mesmo em semana cheia de estudo — o TAF é eliminatório por si só, nota alta na prova não compensa reprovação nele." },
    { t: "Domingo é descanso físico (sem treino), mas pode ter revisão geral ou prática de redação." },
    { t: "Revisão espaçada: a cada 2 semanas, revisar rapidamente Direito Penal e Processual Penal — matérias com mais leis específicas para decorar." },
    { t: "Na véspera (06/03) e na manhã do dia da prova (07/03, que é à tarde): nada de treino pesado, só alongamento leve e descanso mental." },
  ];

  const TOOLKIT = [
    { t: "Montar um caderno de erros separado por P1 (Direito) e P2 (Específicos + Redação)." },
    { t: "A prova é múltipla escolha com 5 alternativas (A–E) — não é o Certo/Errado clássico do Cebraspe. Treine nesse formato específico desde o início." },
    { t: "Resumir as leis específicas citadas no edital (Estatuto do Policial Civil, Lei 6.123/1968, LC 137/2008, LC 317/2015) — são itens de decoreba pura, com alto retorno por hora estudada." },
    { t: "Buscar provas anteriores do Cebraspe para cargos de Agente/Investigador com o mesmo formato de múltipla escolha, mesmo que de outros estados, para treinar o estilo da banca." },
    { t: "A partir da Fase 4, treinar com simulados cronometrados completos (60 questões objetivas + redação, sem consulta)." },
  ];

  // Trilha de vídeos gratuitos (YouTube) cobrindo as matérias de P1, P2 e a
  // técnica dos testes do TAF. Cada item vira uma missão marcável.
  const VIDEO_TRACKS = [
    // ---- Direito (P1) ----
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
    // ---- Específicos (P2) ----
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
    // ---- TAF ----
    { tag: "barra", t: "Progressão de barra fixa para iniciantes (negativas, elástico)", query: "progressão barra fixa iniciantes negativas elástico pull up" },
    { tag: "corrida", t: "Treino de corrida para teste de 12 minutos (Cooper)", query: "treino corrida teste 12 minutos cooper concurso" },
  ];

  /* ------------------------------------------------------------------ */
  /* ESTADO / STORAGE                                                    */
  /* ------------------------------------------------------------------ */

  const STORAGE_KEY = "pcpe-agente-quest-save-v1";

  function loadState(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return { completed:{}, streak:{ count:0, lastDate:null } };
      const parsed = JSON.parse(raw);
      return {
        completed: parsed.completed || {},
        streak: parsed.streak || { count:0, lastDate:null }
      };
    }catch(e){
      console.warn("Save corrompido, iniciando novo.", e);
      return { completed:{}, streak:{ count:0, lastDate:null } };
    }
  }

  let state = loadState();

  function saveState(){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    queueCloudSync();
  }

  function queueCloudSync(){
    if(!currentUser) return;
    clearTimeout(cloudSyncTimer);
    cloudSyncTimer = setTimeout(async ()=>{
      try{
        await setDoc(doc(db, "pcpe_progress", currentUser.uid), state);
      }catch(e){
        console.warn("Não consegui sincronizar com a nuvem agora. O progresso continua salvo neste navegador.", e);
      }
    }, 500);
  }

  function todayISO(){
    const d = new Date();
    return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
  }

  function bumpStreak(){
    const today = todayISO();
    const last = state.streak.lastDate;
    if(last === today) return;
    if(last){
      const diffDays = Math.round((new Date(today) - new Date(last)) / 86400000);
      state.streak.count = (diffDays === 1) ? state.streak.count + 1 : 1;
    } else {
      state.streak.count = 1;
    }
    state.streak.lastDate = today;
  }

  /* ------------------------------------------------------------------ */
  /* MODELO DERIVADO                                                     */
  /* ------------------------------------------------------------------ */

  const ALL_TASKS = [];
  PHASES.forEach(w=>{
    w.tasks.forEach((task, i)=>{
      const id = w.id+"-"+i;
      task.id = id;
      task.xp = task.xp || XP_TASK;
      task.phase = w.id;
      ALL_TASKS.push(task);
    });
  });
  RULES.forEach((r,i)=>{ r.id = "rule-"+i; r.xp = XP_RULE; ALL_TASKS.push(r); });
  TOOLKIT.forEach((r,i)=>{ r.id = "tool-"+i; r.xp = XP_TOOL; ALL_TASKS.push(r); });
  VIDEO_TRACKS.forEach((v,i)=>{ v.id = "yt-"+i; v.xp = XP_VIDEO; ALL_TASKS.push(v); });

  function isDone(id){ return !!state.completed[id]; }

  function currentXP(){
    return ALL_TASKS.reduce((sum,t)=> sum + (isDone(t.id) ? t.xp : 0), 0);
  }

  function levelFromXP(xp){
    return Math.min(RANKS.length, Math.floor(xp / XP_PER_LEVEL) + 1);
  }

  function disciplineProgress(key){
    const tasks = ALL_TASKS.filter(t=>t.tag === key);
    if(tasks.length === 0) return { done:0, total:0, pct:0 };
    const done = tasks.filter(t=>isDone(t.id)).length;
    return { done, total: tasks.length, pct: Math.round((done/tasks.length)*100) };
  }

  function phaseProgress(phase){
    const tasks = phase.tasks;
    const done = tasks.filter(t=>isDone(t.id)).length;
    return { done, total: tasks.length, pct: tasks.length ? Math.round((done/tasks.length)*100) : 0 };
  }

  /* ------------------------------------------------------------------ */
  /* RENDER — HUD                                                        */
  /* ------------------------------------------------------------------ */

  const $ = sel => document.querySelector(sel);

  function renderHUD(){
    const xp = currentXP();
    const level = levelFromXP(xp);
    const rankName = RANKS[level-1];
    const xpIntoLevel = xp - (level-1)*XP_PER_LEVEL;
    const xpForNext = level >= RANKS.length ? xpIntoLevel : XP_PER_LEVEL;
    const pct = level >= RANKS.length ? 100 : Math.min(100, Math.round((xpIntoLevel/XP_PER_LEVEL)*100));

    $("#levelBadge").textContent = "LV " + level;
    $("#rankName").textContent = rankName;
    $("#xpLabel").textContent = (level>=RANKS.length ? xp+" XP · MÁXIMO" : xpIntoLevel+" / "+xpForNext+" XP");
    $("#xpBar").style.width = pct+"%";
    $("#xpBarWrap").setAttribute("aria-valuenow", pct);

    const totalTasks = ALL_TASKS.length;
    const doneTasks = ALL_TASKS.filter(t=>isDone(t.id)).length;
    $("#questPct").textContent = doneTasks+" / "+totalTasks;
    $("#questBar").style.width = Math.round((doneTasks/totalTasks)*100)+"%";

    const now = new Date();
    const totalSpan = EXAM_DATE - CAMPAIGN_START;
    const elapsed = Math.min(Math.max(now - CAMPAIGN_START, 0), totalSpan);
    const campaignPct = Math.round((elapsed/totalSpan)*100);
    $("#campaignBar").style.width = campaignPct+"%";
    $("#campaignPct").textContent = campaignPct+"%";

    $("#streakCount").textContent = "🔥 " + state.streak.count + (state.streak.count===1 ? " dia" : " dias");
  }

  function renderCountdown(){
    const now = new Date();
    let diff = EXAM_DATE - now;
    if(diff < 0) diff = 0;
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    $("#cdDays").textContent = String(days).padStart(2,"0");
    $("#cdHours").textContent = String(hours).padStart(2,"0");
    $("#cdMins").textContent = String(mins).padStart(2,"0");
    $("#cdSecs").textContent = String(secs).padStart(2,"0");
  }

  /* ------------------------------------------------------------------ */
  /* RENDER — DISCIPLINAS                                                */
  /* ------------------------------------------------------------------ */

  function renderDisciplines(){
    const boxP1 = $("#barsP1");
    const boxP2 = $("#barsP2");
    const boxTAF = $("#barsTAF");
    boxP1.innerHTML = ""; boxP2.innerHTML = ""; boxTAF.innerHTML = "";

    const boxByModule = { P1: boxP1, P2: boxP2, TAF: boxTAF };

    Object.entries(DISCIPLINES).forEach(([key, meta])=>{
      const prog = disciplineProgress(key);
      const row = document.createElement("div");
      row.className = "bar-row" + (prog.done === 0 && prog.total > 0 ? " is-zero" : "");
      row.innerHTML = `
        <div class="bar-row-top">
          <span class="discipline-name">${meta.label} ${prog.done===0 && prog.total>0 ? '<span class="zero-flag">risco</span>' : ''}</span>
          <span class="discipline-pct">${prog.done}/${prog.total} · ${prog.pct}%</span>
        </div>
        <div class="bar-track"><div class="bar-fill${meta.module!=="P1"?" bar-fill--purple":""}" style="width:${prog.pct}%"></div></div>
      `;
      boxByModule[meta.module].appendChild(row);
    });
  }

  /* ------------------------------------------------------------------ */
  /* RENDER — MAPA                                                       */
  /* ------------------------------------------------------------------ */

  function renderMap(){
    const path = $("#mapPath");
    path.innerHTML = "";
    PHASES.forEach(w=>{
      const prog = phaseProgress(w);
      const wrap = document.createElement("div");
      wrap.className = "node-wrap" + (prog.pct===100 ? " is-done" : "") + (w.isBoss ? " is-boss" : "");
      wrap.innerHTML = `
        <button class="node-btn" style="--pct:${prog.pct}" data-phase="${w.id}" aria-label="Abrir missões de ${w.title}, ${prog.done} de ${prog.total} concluídas">
          <span class="node-inner">
            <span class="node-week">${w.label}</span>
            <span class="node-label">${prog.pct===100 ? "✓" : (w.isBoss ? "☠" : prog.pct+"%")}</span>
            <span class="node-dates">${w.dates}</span>
          </span>
        </button>
      `;
      path.appendChild(wrap);
    });
    path.querySelectorAll(".node-btn").forEach(btn=>{
      btn.addEventListener("click", ()=> openDrawer(btn.dataset.phase));
    });
  }

  /* ------------------------------------------------------------------ */
  /* RENDER — REGRAS / KIT                                               */
  /* ------------------------------------------------------------------ */

  function renderChecklist(container, items){
    container.innerHTML = "";
    items.forEach(item=>{
      const li = document.createElement("li");
      li.className = "quest-row" + (isDone(item.id) ? " is-checked" : "");
      li.innerHTML = `
        <input type="checkbox" id="${item.id}" ${isDone(item.id)?"checked":""}>
        <label for="${item.id}">${item.t}</label>
        <span class="xp-tag">+${item.xp} XP</span>
      `;
      container.appendChild(li);
    });
    container.querySelectorAll("input[type=checkbox]").forEach(cb=>{
      cb.addEventListener("change", ()=> toggleTask(cb.id));
    });
  }

  function renderRules(){ renderChecklist($("#rulesList"), RULES); }
  function renderToolkit(){ renderChecklist($("#toolkitList"), TOOLKIT); }

  /* ------------------------------------------------------------------ */
  /* RENDER — TRILHA DE VÍDEOS (YOUTUBE)                                 */
  /* ------------------------------------------------------------------ */

  function youtubeSearchUrl(query){
    return "https://www.youtube.com/results?search_query=" + encodeURIComponent(query);
  }

  function renderVideos(){
    const container = $("#videoGroups");
    if(!container) return;
    container.innerHTML = "";

    const groups = [
      { key: "dir_constitucional", title: "Direito Constitucional" },
      { key: "dir_administrativo", title: "Direito Administrativo" },
      { key: "dir_penal", title: "Direito Penal" },
      { key: "dir_processual_penal", title: "Direito Processual Penal" },
      { key: "leg_estadual", title: "Legislação Estadual" },
      { key: "portugues", title: "Língua Portuguesa" },
      { key: "informatica", title: "Informática" },
      { key: "raciocinio_logico", title: "Raciocínio Lógico" },
      { key: "contabilidade", title: "Contabilidade Geral" },
      { key: "estatistica", title: "Estatística" },
      { key: "redacao", title: "Redação" },
      { key: "barra", title: "TAF — Barra" },
      { key: "corrida", title: "TAF — Corrida" },
    ];

    groups.forEach(group=>{
      const items = VIDEO_TRACKS.filter(v=>v.tag === group.key);
      if(!items.length) return;

      const heading = document.createElement("h3");
      heading.className = "video-group-title";
      heading.textContent = group.title;
      container.appendChild(heading);

      const ul = document.createElement("ul");
      ul.className = "video-list";
      items.forEach(item=>{
        const li = document.createElement("li");
        li.className = "quest-row" + (isDone(item.id) ? " is-checked" : "");
        li.innerHTML = `
          <input type="checkbox" id="${item.id}" ${isDone(item.id)?"checked":""}>
          <label for="${item.id}">${item.t}</label>
          <a class="yt-link" href="${youtubeSearchUrl(item.query)}" target="_blank" rel="noopener">▶ buscar no YouTube</a>
          <span class="xp-tag">+${item.xp} XP</span>
        `;
        ul.appendChild(li);
      });
      container.appendChild(ul);

      ul.querySelectorAll("input[type=checkbox]").forEach(cb=>{
        cb.addEventListener("change", ()=> toggleTask(cb.id));
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* DRAWER DE MISSÃO                                                    */
  /* ------------------------------------------------------------------ */

  let currentPhaseId = null;
  const backdrop = $("#drawerBackdrop");
  const drawer = $("#questDrawer");

  function openDrawer(phaseId){
    currentPhaseId = phaseId;
    const w = PHASES.find(x=>x.id===phaseId);
    if(!w) return;
    $("#drawerEyebrow").textContent = w.isBoss ? "BOSS FINAL" : "FASE " + w.label.replace("F","");
    $("#drawerTitle").textContent = w.title;
    $("#drawerDates").textContent = w.dates;
    $("#drawerProportion").textContent = w.proportion;
    $("#drawerFocus").textContent = w.focus;
    renderDrawerTasks();
    drawer.classList.add("open");
    backdrop.classList.add("open");
    drawer.setAttribute("aria-hidden","false");
    $("#drawerClose").focus();
  }

  function closeDrawer(){
    drawer.classList.remove("open");
    backdrop.classList.remove("open");
    drawer.setAttribute("aria-hidden","true");
  }

  function renderDrawerTasks(){
    const w = PHASES.find(x=>x.id===currentPhaseId);
    if(!w) return;
    const list = $("#drawerTasks");
    list.innerHTML = "";
    w.tasks.forEach(task=>{
      const li = document.createElement("li");
      li.className = "quest-row" + (isDone(task.id) ? " is-checked" : "");
      li.innerHTML = `
        <input type="checkbox" id="drawer-${task.id}" ${isDone(task.id)?"checked":""}>
        <div>
          <label for="drawer-${task.id}">${task.t}</label><br>
          <span class="tag">${DISCIPLINES[task.tag] ? DISCIPLINES[task.tag].label : "geral"}</span>
        </div>
        <span class="xp-tag">+${task.xp} XP</span>
      `;
      list.appendChild(li);
    });
    list.querySelectorAll("input[type=checkbox]").forEach(cb=>{
      cb.addEventListener("change", ()=> toggleTask(cb.id.replace("drawer-","")));
    });

    const prog = phaseProgress(w);
    $("#drawerProgressCount").textContent = prog.done+"/"+prog.total;
    $("#drawerProgressFill").style.width = prog.pct+"%";
  }

  /* ------------------------------------------------------------------ */
  /* AÇÕES                                                                */
  /* ------------------------------------------------------------------ */

  let toastTimer = null;
  function showToast(msg){
    const el = $("#xpToast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(()=> el.classList.remove("show"), 1800);
  }

  function toggleTask(id){
    const task = ALL_TASKS.find(t=>t.id===id);
    if(!task) return;
    const willBeDone = !isDone(id);
    state.completed[id] = willBeDone;
    if(willBeDone){
      bumpStreak();
      showToast((task.xp===XP_BOSS ? "🏆 BOSS DERROTADO! +" : "+ ") + task.xp + " XP");
    }
    saveState();
    renderAll();
    if(drawer.classList.contains("open")) renderDrawerTasks();
  }

  function resetProgress(){
    if(!confirm("Isso vai apagar TODO o progresso salvo neste navegador. Tem certeza?")) return;
    state = { completed:{}, streak:{ count:0, lastDate:null } };
    saveState();
    renderAll();
    closeDrawer();
    showToast("Save reiniciado");
  }

  function exportProgress(){
    const blob = new Blob([JSON.stringify(state, null, 2)], { type:"application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "pcpe-agente-quest-save.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function importProgress(file){
    const reader = new FileReader();
    reader.onload = () => {
      try{
        const parsed = JSON.parse(reader.result);
        if(!parsed || typeof parsed !== "object") throw new Error("formato inválido");
        state = {
          completed: parsed.completed || {},
          streak: parsed.streak || { count:0, lastDate:null }
        };
        saveState();
        renderAll();
        showToast("Progresso importado");
      }catch(e){
        alert("Não foi possível ler esse arquivo de save.");
      }
    };
    reader.readAsText(file);
  }

  /* ------------------------------------------------------------------ */
  /* INIT / AUTENTICAÇÃO                                                  */
  /* ------------------------------------------------------------------ */

  function renderAll(){
    renderHUD();
    renderDisciplines();
    renderMap();
    renderVideos();
    renderRules();
    renderToolkit();
  }

  function renderUserBadge(){
    const badge = $("#userBadge");
    const label = $("#userEmailLabel");
    if(!badge || !label || !currentUser) return;
    badge.hidden = false;
    label.textContent = currentUser.displayName || currentUser.email || "Operador(a)";
  }

  async function loadStateFromCloud(){
    try{
      const ref = doc(db, "pcpe_progress", currentUser.uid);
      const snap = await getDoc(ref);
      if(snap.exists()){
        const cloud = snap.data();
        state = {
          completed: cloud.completed || {},
          streak: cloud.streak || { count:0, lastDate:null }
        };
      } else {
        await setDoc(ref, state);
      }
    }catch(e){
      console.warn("Não consegui buscar o progresso da nuvem, usando o save local deste navegador.", e);
    }
  }

  function init(){
    renderAll();
    renderCountdown();
    setInterval(renderCountdown, 1000);

    $("#drawerClose").addEventListener("click", closeDrawer);
    backdrop.addEventListener("click", closeDrawer);
    document.addEventListener("keydown", e=>{ if(e.key==="Escape") closeDrawer(); });

    $("#resetBtn").addEventListener("click", resetProgress);
    $("#exportBtn").addEventListener("click", exportProgress);
    $("#importInput").addEventListener("change", e=>{
      if(e.target.files[0]) importProgress(e.target.files[0]);
      e.target.value = "";
    });
    $("#logoutBtn")?.addEventListener("click", async ()=>{
      try{ await signOut(auth); } finally { window.location.href = "login.html"; }
    });
  }

  document.addEventListener("DOMContentLoaded", ()=>{
    onAuthStateChanged(auth, async (user)=>{
      if(!user){
        window.location.href = "login.html";
        return;
      }
      currentUser = user;
      await loadStateFromCloud();
      renderUserBadge();
      init();
    });
  });
})();