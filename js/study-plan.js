/* ==========================================================================
   OPERAÇÃO PCPE — programa pós-edital e ciclo de estudos (Agente)
   Conteúdos e prioridades transcritos do Edital Verticalizado EBN enviado.
   ========================================================================== */
import { DISCIPLINES, discMeta, registerDiscipline, esc, uid, todayISO, addDaysISO, parseISO, weekdayIndex, EXAM_ISO } from "./config.js";

export const ESSAY_THEMES = [
  "Integração entre instituições e políticas de segurança pública",
  "Enfrentamento ao crime organizado e às facções",
  "Investigação de crimes cibernéticos e preservação de provas digitais",
  "Prevenção e enfrentamento da violência contra a mulher",
  "Sistema prisional, ressocialização e segurança pública",
  "Uso de dados e evidências na formulação de políticas de segurança",
  "Adolescência, prevenção da violência e medidas socioeducativas",
  "Uso proporcional da força, direitos fundamentais e atividade policial",
  "Saúde mental e valorização dos profissionais de segurança pública",
  "Prevenção do tráfico de armas e controle de armas de fogo",
  "Cooperação federativa e inteligência na segurança pública",
  "Desafios contemporâneos da segurança pública em Pernambuco",
];

const rows = [
  ["leg_estadual", "alta", 120, "Constituição de Pernambuco: arts. 101 a 105-B"],
  ["leg_estadual", "alta", 120, "Lei nº 6.425/1972: Estatuto do Policial Civil"],
  ["leg_estadual", "alta", 90, "Lei Complementar nº 137/2008"],
  ["leg_estadual", "alta", 90, "Lei Complementar nº 317/2015"],
  ["leg_estadual", "media", 60, "Lei nº 6.123/1968: Estatuto dos Servidores de Pernambuco"],

  ["dir_constitucional", "alta", 90, "Aplicabilidade das normas constitucionais"],
  ["dir_constitucional", "alta", 150, "Direitos e garantias fundamentais"],
  ["dir_constitucional", "alta", 120, "Organização político-administrativa do Estado"],
  ["dir_constitucional", "alta", 60, "Poder Executivo"],
  ["dir_constitucional", "alta", 60, "Poder Legislativo"],
  ["dir_constitucional", "alta", 90, "Poder Judiciário"],
  ["dir_constitucional", "media", 60, "Constituição de 1988: princípios fundamentais e poder constituinte"],
  ["dir_constitucional", "media", 60, "Administração pública e servidores públicos na Constituição"],
  ["dir_constitucional", "media", 60, "Funções essenciais à Justiça: Ministério Público, advocacia e Defensoria"],
  ["dir_constitucional", "media", 60, "Defesa do Estado e das instituições democráticas"],
  ["dir_constitucional", "media", 60, "Segurança pública na Constituição de Pernambuco"],

  ["dir_administrativo", "alta", 120, "Atos administrativos"],
  ["dir_administrativo", "alta", 150, "Poderes administrativos: hierárquico, disciplinar, regulamentar e de polícia; uso e abuso"],
  ["dir_administrativo", "alta", 120, "Regime jurídico-administrativo e princípios expressos e implícitos"],
  ["dir_administrativo", "alta", 120, "Responsabilidade civil do Estado"],
  ["dir_administrativo", "alta", 120, "Organização administrativa: centralização, descentralização e administração direta e indireta"],
  ["dir_administrativo", "alta", 150, "Controle da Administração Pública e improbidade administrativa"],
  ["dir_administrativo", "alta", 90, "Processo administrativo"],
  ["dir_administrativo", "alta", 90, "Agente público: legislação pertinente e disposições constitucionais"],
  ["dir_administrativo", "media", 45, "Estado, governo e Administração Pública"],
  ["dir_administrativo", "media", 45, "Noções gerais de Direito Administrativo"],
  ["dir_administrativo", "media", 45, "Serviços públicos"],
  ["dir_administrativo", "media", 75, "Licitações e contratos administrativos"],
  ["dir_administrativo", "media", 45, "Cargo, emprego e função pública"],

  ["dir_penal", "alta", 120, "Aplicação da lei penal: tempo, espaço, lugar do crime, prazos e irretroatividade"],
  ["dir_penal", "alta", 120, "Crimes contra a pessoa"],
  ["dir_penal", "alta", 120, "Crimes contra o patrimônio"],
  ["dir_penal", "alta", 120, "Crimes contra a Administração Pública"],
  ["dir_penal", "alta", 90, "Crimes hediondos: Lei nº 8.072/1990"],
  ["dir_penal", "alta", 90, "Abuso de autoridade: Lei nº 13.869/2019"],
  ["dir_penal", "alta", 90, "Tortura: Lei nº 9.455/1997"],
  ["dir_penal", "alta", 90, "Organizações criminosas: Lei nº 12.850/2013"],
  ["dir_penal", "alta", 120, "Violência doméstica e familiar contra a mulher: Lei nº 11.340/2006"],
  ["dir_penal", "alta", 120, "Lei de Drogas: Lei nº 11.343/2006"],
  ["dir_penal", "alta", 90, "Violência contra criança e adolescente: Lei nº 14.344/2022"],
  ["dir_penal", "alta", 90, "Estatuto do Desarmamento: Lei nº 10.826/2003"],
  ["dir_penal", "media", 45, "Princípios básicos do Direito Penal"],
  ["dir_penal", "media", 45, "Crime e contravenção penal"],
  ["dir_penal", "media", 60, "Crimes contra a dignidade sexual"],
  ["dir_penal", "media", 45, "Crimes de preconceito de raça ou cor: Lei nº 7.716/1989"],
  ["dir_penal", "media", 60, "Estatuto da Criança e do Adolescente: Lei nº 8.069/1990"],
  ["dir_penal", "media", 45, "Crimes de trânsito: Lei nº 9.503/1997"],
  ["dir_penal", "media", 45, "Crimes ambientais: Lei nº 9.605/1998"],
  ["dir_penal", "media", 45, "Disposições constitucionais aplicáveis ao Direito Penal"],

  ["dir_processual_penal", "alta", 120, "Inquérito policial"],
  ["dir_processual_penal", "alta", 180, "Provas: perícias, interrogatório, confissão, testemunhas, reconhecimento, acareação, documentos, indícios, busca e apreensão"],
  ["dir_processual_penal", "alta", 150, "Prisão e liberdade provisória"],
  ["dir_processual_penal", "alta", 120, "Medidas cautelares diversas da prisão"],
  ["dir_processual_penal", "alta", 90, "Prisão temporária: Lei nº 7.960/1989"],
  ["dir_processual_penal", "alta", 75, "Investigação criminal: Lei nº 12.830/2013"],
  ["dir_processual_penal", "media", 45, "Aplicação da lei processual penal no tempo, espaço e em relação às pessoas"],
  ["dir_processual_penal", "media", 60, "Juizados especiais criminais: Lei nº 9.099/1995"],
  ["dir_processual_penal", "media", 45, "Disposições constitucionais aplicáveis ao Processo Penal"],

  ["portugues", "alta", 150, "Compreensão e interpretação de textos"],
  ["portugues", "alta", 120, "Ortografia oficial"],
  ["portugues", "alta", 180, "Estrutura morfossintática: classes de palavras, coordenação, subordinação, pontuação, concordância, regência, crase e colocação pronominal"],
  ["portugues", "alta", 150, "Reescrita de frases e parágrafos: sentido, substituição, reorganização e formalidade"],
  ["portugues", "media", 60, "Tipos e gêneros textuais"],
  ["portugues", "media", 75, "Coesão textual: referenciação, conectores, sequenciação, tempos e modos verbais"],
  ["portugues", "media", 75, "Correspondência oficial conforme o Manual de Redação da Presidência"],

  ["informatica", "alta", 180, "Microsoft 365: Word, Excel e PowerPoint; recursos, fórmulas, gráficos, slides e integração"],
  ["informatica", "alta", 120, "Redes, Internet, intranet, nuvem, deep web, dark web, e-mail e navegadores"],
  ["informatica", "alta", 120, "Segurança: controle de acesso, malware, antivírus, criptografia e backup"],
  ["informatica", "media", 75, "Windows: operações, arquivos, pastas, configurações e Windows Explorer"],

  ["raciocinio_logico", "alta", 120, "Razões, proporções, regra de três e porcentagens"],
  ["raciocinio_logico", "alta", 150, "Equações e inequações de primeiro e segundo graus"],
  ["raciocinio_logico", "alta", 120, "Funções e gráficos"],
  ["raciocinio_logico", "alta", 120, "Princípios de contagem"],
  ["raciocinio_logico", "alta", 90, "Compreensão de estruturas lógicas"],
  ["raciocinio_logico", "alta", 120, "Lógica de argumentação: analogias, inferências, deduções e conclusões"],
  ["raciocinio_logico", "alta", 180, "Lógica proposicional: proposições, tabelas-verdade, equivalências, De Morgan e diagramas"],
  ["raciocinio_logico", "alta", 90, "Lógica de primeira ordem"],
  ["raciocinio_logico", "alta", 150, "Princípios de contagem e probabilidade"],
  ["raciocinio_logico", "media", 60, "Conjuntos numéricos e operações com conjuntos"],
  ["raciocinio_logico", "media", 45, "Sistema legal de medidas"],
  ["raciocinio_logico", "media", 75, "Sistemas lineares"],
  ["raciocinio_logico", "media", 75, "Progressões aritméticas e geométricas"],
  ["raciocinio_logico", "media", 60, "Problemas aritméticos, geométricos e matriciais"],

  ["estatistica", "alta", 150, "Estatística descritiva e análise exploratória: gráficos, tabelas, posição, dispersão, assimetria e curtose"],
  ["estatistica", "alta", 120, "Probabilidade: conceitos, axiomas, probabilidade condicional e independência"],
  ["estatistica", "media", 75, "Amostragem: métodos, tipos e tamanho amostral"],

  ["contabilidade", "alta", 75, "Conceitos, objetivos e finalidades da Contabilidade"],
  ["contabilidade", "alta", 90, "Atos e fatos administrativos: permutativos, modificativos e mistos"],
  ["contabilidade", "alta", 150, "Escrituração: lançamentos, livros, métodos, regime de competência e regime de caixa"],
  ["contabilidade", "alta", 180, "Operações contábeis I: juros, descontos, tributos, aluguéis e variação monetária/cambial"],
  ["contabilidade", "alta", 180, "Operações contábeis II: folha, compras, vendas, provisões, depreciação e baixa de bens"],
  ["contabilidade", "alta", 90, "Balancete de verificação: conceitos, modelos e elaboração"],
  ["contabilidade", "alta", 120, "Balanço patrimonial: conceitos, objetivo e composição"],
  ["contabilidade", "media", 75, "Patrimônio, equação fundamental e situação líquida"],
  ["contabilidade", "media", 60, "Contas: débito, crédito e saldos"],
  ["contabilidade", "media", 60, "Plano de contas: elenco, função e funcionamento"],
  ["contabilidade", "media", 75, "Demonstração do resultado do exercício"],
  ["contabilidade", "media", 60, "Normas Brasileiras de Contabilidade"],

  ["redacao", "alta", 60, "Atualidades: tópicos relevantes e atuais da área de segurança pública"],
];

export const CURRICULUM = rows.map(([disc, priority, minutes, title], index) => ({
  id: `pcpe-${disc}-${priority}-${index + 1}`,
  disc,
  priority,
  minutes,
  title,
}));

export function setCurriculum(items) {
  CURRICULUM.splice(0, CURRICULUM.length, ...(items || []).map((item, i) => ({
    id: item.id || `topic-${i + 1}`, disc: item.disc || "materia_1",
    subject: item.subject || DISCIPLINES[item.disc]?.label || "Matéria",
    module: item.module || "Conteúdo programático", priority: item.priority === "ciclo" ? "ciclo" : item.priority === "media" ? "media" : "alta",
    minutes: Math.max(30, Number(item.minutes) || 60), title: item.title || `Tópico ${i + 1}`,
  })));
  CURRICULUM.forEach(item => registerDiscipline(item.disc, item.subject, item.module));
}

export function renderCurriculum(root) {
  if (!root) return;
  const groups = Object.keys(DISCIPLINES).filter(key => DISCIPLINES[key].group === "estudo");
  root.innerHTML = groups.map(key => {
    const meta = discMeta(key);
    const topics = CURRICULUM.filter(item => item.disc === key);
    if (!topics.length) return "";
    const cards = (topics.every(item => item.priority === "ciclo") ? ["ciclo"] : ["alta", "media"]).map(priority => {
      const list = topics.filter(item => item.priority === priority);
      if (!list.length) return "";
      return `<div class="curriculum-priority curriculum-priority--${priority}">
        <h3><span>${priority === "ciclo" ? "PROGRAMA COMPLETO DO CARGO" : priority === "alta" ? "ALTA PRIORIDADE" : "MÉDIA PRIORIDADE"}</span><small>${list.length} assuntos · ${Math.round(list.reduce((n, item) => n + item.minutes, 0) / 60)}h estimadas</small></h3>
        <ul>${list.map(item => `<li><span>${esc(item.title)}</span><small>${item.minutes} min</small></li>`).join("")}</ul>
      </div>`;
    }).join("");
    return `<article class="curriculum-subject" style="--subject-color:${meta.color}">
      <header><span class="curriculum-module">${esc(meta.module)}</span><h3>${esc(meta.label)}</h3><span class="curriculum-count">${topics.length} tópicos</span></header>
      ${cards}
    </article>`;
  }).join("");
}

const SUBJECT_ORDER = ["portugues", "dir_penal", "raciocinio_logico", "dir_processual_penal", "informatica", "dir_administrativo", "contabilidade", "dir_constitucional", "estatistica", "leg_estadual", "redacao"];
const SUBJECT_WEIGHTS = { portugues: 2, dir_penal: 2, raciocinio_logico: 2, dir_processual_penal: 2, informatica: 2, dir_administrativo: 1, contabilidade: 1, dir_constitucional: 1, estatistica: 1, leg_estadual: 1, redacao: 1 };

function interleave(items) {
  const keys = [...new Set([...SUBJECT_ORDER.filter(key => items.some(item => item.disc === key)), ...items.map(item => item.disc).filter((key, i, all) => all.indexOf(key) === i)])];
  const queues = new Map(keys.map(disc => [disc, items.filter(item => item.disc === disc)]));
  const ordered = [];
  let remaining = items.length;
  while (remaining) {
    let moved = 0;
    for (const disc of keys) {
      const queue = queues.get(disc);
      for (let n = 0; n < (SUBJECT_WEIGHTS[disc] || 1) && queue.length; n++) {
        ordered.push(queue.shift());
        remaining--;
        moved++;
      }
    }
    if (!moved) break;
  }
  return ordered;
}

function studyEvent(date, priority, blocks, index, dailyMinutes = 180, questionGoal = 50) {
  const topicBlocks = blocks.map(item => ({ topicId: item.id, title: item.title, disc: item.disc, priority: item.priority, minutes: item.minutes, done: false }));
  const used = topicBlocks.reduce((n, item) => n + item.minutes, 0);
  const first = topicBlocks[0];
  if (used < dailyMinutes) topicBlocks.push({ topicId: null, title: "Revisão ativa e leitura dirigida dos assuntos desta etapa", disc: first ? first.disc : "geral", priority, minutes: dailyMinutes - used, done: false, review: true });
  const names = [...new Set(topicBlocks.filter(item => !item.review).map(item => discMeta(item.disc).short))];
  return {
    id: uid(), date, kind: "study", phase: "cycle", title: `${priority === "ciclo" ? "Conteúdo do cargo" : priority === "alta" ? "Alta" : priority === "media" ? "Média" : "Revisão"} · ${names.join(" + ") || "revisão dirigida"}`,
    blocks: topicBlocks, minutes: dailyMinutes, questionTarget: questionGoal, questionsDone: false, done: false, sequence: index,
  };
}

function packStage(items, dates, priority, startIndex, dailyMinutes, questionGoal) {
  const ordered = interleave(items).sort((a, b) => b.minutes - a.minutes);
  const bins = [];
  for (const item of ordered) {
    let best = -1, smallestRemainder = Infinity;
    bins.forEach((bin, index) => {
      const remainder = dailyMinutes - bin.minutes - item.minutes;
      if (remainder >= 0 && remainder < smallestRemainder) { best = index; smallestRemainder = remainder; }
    });
    if (best < 0) { bins.push({ minutes: 0, blocks: [] }); best = bins.length - 1; }
    bins[best].blocks.push(item);
    bins[best].minutes += item.minutes;
  }
  return bins.slice(0, dates.length).map((bin, index) => studyEvent(dates[index], priority, bin.blocks, startIndex + index, dailyMinutes, questionGoal));
}

function makeQuestionEvent(date, topicNames, index) {
  const subjectSummary = topicNames.length ? topicNames.slice(0, 3).join(" · ") : "caderno de erros e pontos fracos";
  return { id: uid(), date, kind: "practice", title: `Questões + correção · ${subjectSummary}`, blocks: [], minutes: 180, questionTarget: 50, questionsDone: false, done: false, sequence: index };
}

function makeWeekendEvent(date, kind, previousTopics, index, settings = {}) {
  if (kind === "mock") {
    const names = [...new Set(previousTopics.map(item => discMeta(item.disc).short))];
    const count = settings.contestId === "pcpe-2027" ? 60 : (Number(settings.questionGoal) || 50);
    return { id: uid(), date, kind, phase: "cycle", title: `Simulado semanal · ${names.slice(0, 4).join(" + ") || "conteúdo acumulado"}`, blocks: [], minutes: Number(settings.dailyGoalMin) || 180, questionTarget: count, p1Target: Math.round(count / 3), p2Target: count - Math.round(count / 3), questionsDone: false, done: false, sequence: index };
  }
  const theme = settings.contestId === "pcpe-2027" ? ESSAY_THEMES[index % ESSAY_THEMES.length] : "Treino discursivo conforme o conteúdo programático e os temas do edital";
  return { id: uid(), date, kind: "essay", phase: "cycle", title: `Redação · ${theme}`, theme, blocks: [], minutes: 90, questionTarget: 0, questionsDone: false, done: false, sequence: index };
}

export function buildInitialSchedule(startISO = todayISO(), examISO = EXAM_ISO, curriculum = CURRICULUM, settings = {}) {
  const dailyMinutes = Math.max(60, Number(settings.dailyGoalMin) || 180);
  const questionGoal = Math.max(10, Number(settings.questionGoal) || 50);
  const examEve = addDaysISO(examISO, -1);
  const availableDays = [];
  for (let date = startISO; date <= examEve; date = addDaysISO(date, 1)) availableDays.push(date);
  const weekdays = availableDays.filter(date => weekdayIndex(parseISO(date)) < 5);
  const completeProgram = curriculum.length > 0 && curriculum.every(item => item.priority === "ciclo");
  const highItems = completeProgram ? curriculum : curriculum.filter(item => item.priority === "alta");
  const mediaItems = completeProgram ? [] : curriculum.filter(item => item.priority === "media");
  const highEvents = packStage(highItems, weekdays, completeProgram ? "ciclo" : "alta", 0, dailyMinutes, questionGoal);
  const mediaEvents = packStage(mediaItems, weekdays.slice(highEvents.length), "media", highEvents.length, dailyMinutes, questionGoal);
  const plannedStudy = [...highEvents, ...mediaEvents].slice(0, weekdays.length);
  const studyByDate = new Map(plannedStudy.map((event, i) => [weekdays[i], event]));
  const lastStudyDate = plannedStudy.length ? plannedStudy[plannedStudy.length - 1].date : addDaysISO(startISO, -1);
  const roundedCycleEnd = addDaysISO(lastStudyDate, (6 - weekdayIndex(parseISO(lastStudyDate)) + 7) % 7);
  const cycleEndPlanned = roundedCycleEnd > examEve ? examEve : roundedCycleEnd;
  const cycleDays = availableDays.filter(date => date <= cycleEndPlanned);
  const allEvents = [];
  let mockIndex = 0, essayIndex = 0;
  const coveredTopics = new Map();
  for (const event of plannedStudy) event.blocks.filter(block => block.topicId).forEach(block => {
    if (!coveredTopics.has(block.disc)) coveredTopics.set(block.disc, []);
    coveredTopics.get(block.disc).push(block.title);
  });
  for (const date of cycleDays) {
    const day = weekdayIndex(parseISO(date));
    if (day < 5) {
      const event = studyByDate.get(date) || studyEvent(date, "revisao", [], allEvents.length, dailyMinutes, questionGoal);
      if (event.title.startsWith("Revisão")) event.title = `Revisão teórica do ciclo · ${dailyMinutes} min`;
      allEvents.push(event);
    } else if (day === 5) {
      const weekTopics = plannedStudy.filter(event => event.date >= addDaysISO(date, -5) && event.date < date).flatMap(event => event.blocks.filter(block => block.topicId));
      allEvents.push(makeWeekendEvent(date, "mock", weekTopics, mockIndex++, { ...settings, questionGoal }));
    } else if (date !== examISO && settings.essayEnabled !== false) {
      allEvents.push(makeWeekendEvent(date, "essay", [], essayIndex++, settings));
    } else if (date !== examISO) {
      allEvents.push(studyEvent(date, "revisao", [], allEvents.length, dailyMinutes, questionGoal));
    }
  }
  for (let date = addDaysISO(cycleEndPlanned, 1), seq = 0; date <= examEve; date = addDaysISO(date, 1), seq++) {
    const dayTopics = [...coveredTopics.entries()].map(([disc, names]) => `${discMeta(disc).short}: ${names[seq % Math.max(1, names.length)]}`).filter((_, i) => i < 3);
    const isSaturday = weekdayIndex(parseISO(date)) === 5;
    const title = isSaturday ? `Simulado pós-ciclo · ${questionGoal} questões` : `Pós-ciclo · ${questionGoal} questões + correção${dayTopics.length ? " · " + dayTopics.join(" / ") : ""}`;
    allEvents.push({ id: uid(), date, kind: "questions", phase: "questions", title, blocks: [], minutes: dailyMinutes, questionTarget: questionGoal, p1Target: isSaturday ? Math.round(questionGoal / 3) : Math.round(questionGoal / 3), p2Target: questionGoal - Math.round(questionGoal / 3), questionsDone: false, done: false, sequence: seq });
  }
  return { events: allEvents.sort((a, b) => a.date.localeCompare(b.date) || a.sequence - b.sequence), cycleEndPlanned, examEve, studyDays: plannedStudy.length, topicCount: plannedStudy.reduce((n, event) => n + event.blocks.filter(block => block.topicId).length, 0) };
}

export const curriculumMeta = { source: "Edital Verticalizado PCPE — EBN, pós-edital 2026", examISO: EXAM_ISO };
