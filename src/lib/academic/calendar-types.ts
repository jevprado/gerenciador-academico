// Tipos, categorias e utilitários compartilhados para o Calendário do Semestre.

export const CALENDAR_CATEGORIES = [
  "academico",
  "matricula",
  "trancamento",
  "feriado",
  "ponto_facultativo",
  "outro",
] as const;

export type CalendarCategory = (typeof CALENDAR_CATEGORIES)[number];

export type CalendarEventRow = {
  id: string;
  semester_id: string;
  title: string;
  description: string | null;
  category: CalendarCategory;
  target: string | null;
  start_date: string;
  end_date: string;
  source: "manual" | "pdf";
};

export type CalendarSemesterOption = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
  min_average: number;
  min_attendance: number;
  eventCount: number;
  pdfEventCount: number;
};

export type ParsedCalendarEvent = {
  title: string;
  description: string | null;
  category: CalendarCategory;
  target: string | null;
  start_date: string;
  end_date: string;
};

export const CATEGORY_META: Record<
  CalendarCategory,
  {
    label: string;
    shortLabel: string;
    dotClass: string;
    cellClass: string;
    badgeClass: string;
    priority: number; // maior prioridade vence na cor da célula do dia no calendário mensal
  }
> = {
  feriado: {
    label: "Feriados",
    shortLabel: "Feriado",
    dotClass: "bg-rose-600 dark:bg-rose-400",
    cellClass:
      "bg-rose-500/20 text-rose-950 font-semibold ring-1 ring-inset ring-rose-500/40 dark:bg-rose-500/25 dark:text-rose-100 dark:ring-rose-400/40",
    badgeClass: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200",
    priority: 6,
  },
  ponto_facultativo: {
    label: "Pontos Facultativos",
    shortLabel: "Ponto Facultativo",
    dotClass: "bg-sky-500 dark:bg-sky-400",
    cellClass:
      "bg-sky-500/20 text-sky-950 font-semibold ring-1 ring-inset ring-sky-500/40 dark:bg-sky-500/25 dark:text-sky-100 dark:ring-sky-400/40",
    badgeClass: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
    priority: 5,
  },
  academico: {
    label: "Datas Acadêmicas",
    shortLabel: "Acadêmico",
    dotClass: "bg-emerald-600 dark:bg-emerald-400",
    cellClass:
      "bg-emerald-500/25 text-emerald-950 font-semibold ring-1 ring-inset ring-emerald-600/40 dark:bg-emerald-500/25 dark:text-emerald-100 dark:ring-emerald-400/40",
    badgeClass: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
    priority: 4,
  },
  matricula: {
    label: "Períodos de Matrícula",
    shortLabel: "Matrícula",
    dotClass: "bg-amber-500 dark:bg-amber-400",
    cellClass:
      "bg-amber-500/20 text-amber-950 font-medium ring-1 ring-inset ring-amber-500/40 dark:bg-amber-500/25 dark:text-amber-100 dark:ring-amber-400/40",
    badgeClass: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
    priority: 3,
  },
  trancamento: {
    label: "Trancamento e Retirada",
    shortLabel: "Trancamento",
    dotClass: "bg-purple-500 dark:bg-purple-400",
    cellClass:
      "bg-purple-500/15 text-purple-950 font-medium ring-1 ring-inset ring-purple-500/35 dark:bg-purple-500/20 dark:text-purple-100 dark:ring-purple-400/35",
    badgeClass: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-200",
    priority: 2,
  },
  outro: {
    label: "Outras Atividades",
    shortLabel: "Outro",
    dotClass: "bg-stone-500 dark:bg-stone-400",
    cellClass:
      "bg-stone-500/15 text-foreground font-medium ring-1 ring-inset ring-stone-500/30 dark:bg-stone-500/20 dark:text-stone-200",
    badgeClass: "bg-background text-muted border border-line",
    priority: 1,
  },
};

export const TARGET_OPTIONS = [
  "Estudante",
  "Geral",
  "Estudante/Coordenação",
  "Coordenação",
  "Docente",
  "STI",
  "SAA",
  "DEG/SAA",
  "DEG/DAIA",
  "Unidade Acadêmica",
] as const;

export function isStudentRelevantTarget(target: string | null | undefined): boolean {
  if (!target) return true;
  const t = target.toLowerCase();
  return t.includes("estudante") || t.includes("geral") || t.includes("discente") || t.includes("aluno");
}

// Datas oficiais do Calendário Universitário de Graduação 2026.1 da UnB (SAA/UnB).
export const UNB_2026_1_EVENTS: ParsedCalendarEvent[] = [
  // Informações Gerais - Consolidação anterior e Período Letivo
  {
    title: "Consolidação de turmas do 2025.2",
    description: "Data limite para consolidação, pelos docentes, das turmas do período 2025.2 (Até 18/12/2025).",
    category: "academico",
    target: "Docente",
    start_date: "2025-12-18",
    end_date: "2025-12-18",
  },
  {
    title: "Consolidação de turmas do Verão 2026 (2025.4)",
    description: "Data limite para consolidação, pelos docentes, das turmas do Verão 2026 (2025.4) (Até 19/02/2026).",
    category: "academico",
    target: "Docente",
    start_date: "2026-02-19",
    end_date: "2026-02-19",
  },
  {
    title: "Primeiro dia letivo",
    description: "Início oficial do período letivo 2026.1 na UnB.",
    category: "academico",
    target: "Geral",
    start_date: "2026-02-23",
    end_date: "2026-02-23",
  },
  {
    title: "Último dia letivo",
    description: "Encerramento oficial do período letivo 2026.1 na UnB.",
    category: "academico",
    target: "Geral",
    start_date: "2026-07-23",
    end_date: "2026-07-23",
  },

  // Período de Aulas
  {
    title: "Início do período de aulas",
    description: "Primeiro dia de aulas do semestre 2026.1.",
    category: "academico",
    target: "Geral",
    start_date: "2026-03-16",
    end_date: "2026-03-16",
  },
  {
    title: "25% do período de aulas",
    description: "Marco de 25% de realização do período de aulas.",
    category: "academico",
    target: "Geral",
    start_date: "2026-04-15",
    end_date: "2026-04-15",
  },
  {
    title: "50% do período de aulas",
    description: "Marco de 50% de realização do período de aulas.",
    category: "academico",
    target: "Geral",
    start_date: "2026-05-18",
    end_date: "2026-05-18",
  },
  {
    title: "75% do período de aulas",
    description: "Marco de 75% de realização do período de aulas.",
    category: "academico",
    target: "Geral",
    start_date: "2026-06-19",
    end_date: "2026-06-19",
  },
  {
    title: "Término do período de aulas",
    description: "Último dia de aulas do semestre 2026.1.",
    category: "academico",
    target: "Geral",
    start_date: "2026-07-18",
    end_date: "2026-07-18",
  },

  // Processo de Matrícula no 2026.1
  {
    title: "Período de Matrícula",
    description:
      "Período para solicitação de matrícula de 06h do dia 23/02 até às 23h59 do dia 26/02/2026 no SIGAA > Portal Discente > Ensino > Matrícula on-line > Realizar Matrícula.",
    category: "matricula",
    target: "Estudante",
    start_date: "2026-02-23",
    end_date: "2026-02-26",
  },
  {
    title: "Solicitação de matrícula pela Coordenação",
    description:
      "Solicitação de matrículas em turmas que não permitem matrícula on-line de 06h do dia 23/02 até às 23h59 do dia 26/02/2026.",
    category: "matricula",
    target: "Coordenação",
    start_date: "2026-02-23",
    end_date: "2026-02-26",
  },
  {
    title: "Processamento das matrículas",
    description: "Processamento das solicitações de matrícula pelo STI.",
    category: "matricula",
    target: "STI",
    start_date: "2026-02-27",
    end_date: "2026-03-02",
  },
  {
    title: "Resultado da matrícula",
    description: "Resultado da matrícula até às 12h do dia 02/03/2026.",
    category: "matricula",
    target: "Estudante",
    start_date: "2026-03-02",
    end_date: "2026-03-02",
  },
  {
    title: "Ajuste de vagas (preparação para rematrícula)",
    description:
      "Ajuste de vagas em turmas ofertadas e criação de novas turmas em salas da própria Unidade a partir do dia 28/02 até às 23h59 do dia 02/03/2026.",
    category: "matricula",
    target: "Coordenação",
    start_date: "2026-02-28",
    end_date: "2026-03-02",
  },
  {
    title: "Período de Rematrícula",
    description:
      "Período para solicitação de rematrícula de 06h do dia 03/03 até às 23h59 do dia 05/03/2026 no SIGAA > Portal Discente > Ensino > Matrícula on-line > Realizar Matrícula.",
    category: "matricula",
    target: "Estudante",
    start_date: "2026-03-03",
    end_date: "2026-03-05",
  },
  {
    title: "Solicitação de rematrícula pela Coordenação",
    description:
      "Solicitação de rematrícula em turmas que não permitem matrícula on-line de 06h do dia 03/03 até às 23h59 do dia 05/03/2026.",
    category: "matricula",
    target: "Coordenação",
    start_date: "2026-03-03",
    end_date: "2026-03-05",
  },
  {
    title: "Processamento das rematrículas",
    description: "Processamento das solicitações de rematrícula pelo STI.",
    category: "matricula",
    target: "STI",
    start_date: "2026-03-06",
    end_date: "2026-03-09",
  },
  {
    title: "Resultado da rematrícula",
    description: "Resultado da rematrícula até às 12h do dia 09/03/2026.",
    category: "matricula",
    target: "Estudante",
    start_date: "2026-03-09",
    end_date: "2026-03-09",
  },
  {
    title: "Ajuste de vagas (preparação para matrícula extraordinária)",
    description:
      "Ajuste de vagas em turmas ofertadas e criação de novas turmas em salas da própria Unidade a partir das 08h do dia 09/03 até às 23h59 do dia 12/03/2026.",
    category: "matricula",
    target: "Coordenação",
    start_date: "2026-03-09",
    end_date: "2026-03-12",
  },
  {
    title: "Matrícula Extraordinária",
    description:
      "Matrícula Extraordinária de 10h do dia 10/03 até às 23h59 do dia 13/03/2026 no SIGAA > Portal Discente > Ensino > Matrícula on-line > Realizar Matrícula Extraordinária.",
    category: "matricula",
    target: "Estudante/Coordenação",
    start_date: "2026-03-10",
    end_date: "2026-03-13",
  },
  {
    title: "Matrícula para estudantes em Mobilidade Acadêmica",
    description:
      "Solicitação, para SAA via SEI, de matrícula em componentes curriculares para estudantes em Mobilidade Acadêmica (de outras IFES).",
    category: "matricula",
    target: "Estudante/Coordenação",
    start_date: "2026-03-10",
    end_date: "2026-04-11",
  },
  {
    title: "Matrícula de ingressantes por TF e DCS",
    description:
      "Solicitação, para SAA via SEI, de matrícula para estudantes ingressantes por Transferência Facultativa (TF) e Portador de Diploma de Curso Superior (DCS) em componentes com flexibilização de pré-requisitos.",
    category: "matricula",
    target: "Coordenação",
    start_date: "2026-03-10",
    end_date: "2026-04-11",
  },

  // Retirada e Trancamentos
  {
    title: "Retirada de disciplina(s)",
    description:
      "Retirada de disciplina(s) de 10h do dia 10/03 até às 23h59 do dia 13/03/2026 no SIGAA > Portal Discente > Ensino > Retirar Matrícula.",
    category: "trancamento",
    target: "Estudante",
    start_date: "2026-03-10",
    end_date: "2026-03-13",
  },
  {
    title: "Matrícula e retirada de TCC e Estágio",
    description:
      "Solicitação de matrícula e/ou retirada de componentes do tipo atividade (TCC e Estágio) diretamente na Coordenação de curso e conforme prazos e regras internas do curso.",
    category: "matricula",
    target: "Estudante",
    start_date: "2026-03-16",
    end_date: "2026-07-18",
  },
  {
    title: "Trancamento parcial de matrícula automático",
    description:
      "Suspensão das atividades curriculares de um componente curricular apenas ou de um grupo de componentes. Deverá ser realizado através do SIGAA > Portal do Aluno > Ensino > Trancamento de Matrícula.",
    category: "trancamento",
    target: "Estudante",
    start_date: "2026-03-14",
    end_date: "2026-05-18",
  },
  {
    title: "Trancamento geral de matrícula automático",
    description:
      "Suspensão de todas as atividades acadêmicas pelo período de um semestre letivo. Deverá ser realizado através do SIGAA > Portal do Aluno > Ensino > Trancamento Automático.",
    category: "trancamento",
    target: "Estudante",
    start_date: "2026-02-23",
    end_date: "2026-06-19",
  },

  // Aluno Especial e Outras Atividades
  {
    title: "Aluno Especial — Solicitação na Coordenação",
    description: "Solicitação de matrícula como Aluno Especial na Coordenação responsável pela oferta da disciplina.",
    category: "matricula",
    target: "Estudante",
    start_date: "2026-03-16",
    end_date: "2026-03-17",
  },
  {
    title: "Aluno Especial — Análise pela Coordenação",
    description: "Análise das solicitações de Aluno Especial e envio para SAA.",
    category: "matricula",
    target: "Coordenação",
    start_date: "2026-03-16",
    end_date: "2026-04-03",
  },
  {
    title: "Aluno Especial — Matrícula pela SAA",
    description: "Matrícula nas disciplinas de Aluno Especial e comunicação aos estudantes.",
    category: "matricula",
    target: "SAA",
    start_date: "2026-03-16",
    end_date: "2026-04-13",
  },
  {
    title: "Data limite para Reintegração no 2026.1",
    description: "Data limite para reingresso no 2026.1, desde que o processo tenha sido analisado pelo DEG (Até 11/04/2026).",
    category: "outro",
    target: "DEG/DAIA",
    start_date: "2026-04-11",
    end_date: "2026-04-11",
  },
  {
    title: "Mobilidade Acadêmica ANDIFES (para 2026.2)",
    description: "Envio das solicitações de mobilidade acadêmica em 2026.2 para as IFES de destino (Até 06/06/2026).",
    category: "outro",
    target: "Estudante/Coordenação",
    start_date: "2026-06-06",
    end_date: "2026-06-06",
  },
  {
    title: "Matrícula na Atividade de Monitoria",
    description: "Período para matrícula na Atividade de Monitoria pelas Unidades Acadêmicas.",
    category: "outro",
    target: "Unidade Acadêmica",
    start_date: "2026-03-03",
    end_date: "2026-07-18",
  },
  {
    title: "Envio das listas de monitores bolsistas",
    description:
      "Envio das listas de monitores bolsistas avaliados positivamente, por meio do formulário próprio (Office 365).",
    category: "outro",
    target: "Unidade Acadêmica",
    start_date: "2026-06-22",
    end_date: "2026-07-24",
  },
  {
    title: "Consolidação da Atividade de Monitoria",
    description: "Data limite para consolidação da Atividade de Monitoria no SIGAA pelo docente (Até 21/07/2026).",
    category: "outro",
    target: "Docente",
    start_date: "2026-07-21",
    end_date: "2026-07-21",
  },
  {
    title: "Publicação do Edital de Dupla Diplomação",
    description:
      "Publicação do Edital de Dupla Diplomação na página https://saa.unb.br/graduacao/dupla-e-mudanca. Solicitação por meio do formulário eletrônico (A partir de 24/04/2026).",
    category: "outro",
    target: "Estudante",
    start_date: "2026-04-24",
    end_date: "2026-04-24",
  },
  {
    title: "Publicação do Edital de Mudança de Curso",
    description:
      "Publicação do Edital de Mudança de Curso na página https://saa.unb.br/graduacao/dupla-e-mudanca. Solicitação por meio do formulário eletrônico (A partir de 24/04/2026).",
    category: "outro",
    target: "Estudante",
    start_date: "2026-04-24",
    end_date: "2026-04-24",
  },
  {
    title: "Atividades Complementares — Solicitação",
    description: "Data limite para solicitação de Atividades Complementares nas Unidades Acadêmicas (Até 24/04/2026).",
    category: "academico",
    target: "Estudante",
    start_date: "2026-04-24",
    end_date: "2026-04-24",
  },
  {
    title: "Atividades Complementares — Encaminhamento à SAA",
    description:
      "Encaminhamento dos processos à SAA até o dia 04/05/2026. As solicitações encaminhadas após 04/05/2026 só serão registradas após o término do semestre.",
    category: "academico",
    target: "Unidade Acadêmica",
    start_date: "2026-05-04",
    end_date: "2026-05-04",
  },
  {
    title: "Registro de Menção Final",
    description: "Data limite para registro e consolidação das turmas no SIGAA pelos docentes (Até 21/07/2026).",
    category: "academico",
    target: "Docente",
    start_date: "2026-07-21",
    end_date: "2026-07-21",
  },
  {
    title: "Processamento dos desligamentos",
    description: "Processamento dos desligamentos referente ao semestre 2026.1 pela SAA.",
    category: "academico",
    target: "SAA",
    start_date: "2026-07-24",
    end_date: "2026-07-24",
  },
  {
    title: "Solicitação de Revisão de Menção Final",
    description:
      "Data limite para solicitação de revisão de menção final nas Unidades Acadêmicas (Até 24/08/2026). Análise pelo Corpo Docente em até 15 dias.",
    category: "academico",
    target: "Estudante",
    start_date: "2026-08-24",
    end_date: "2026-08-24",
  },

  // Feriados e Pontos Facultativos (Página 4)
  {
    title: "Sexta-feira Santa",
    description: "Feriado nacional.",
    category: "feriado",
    target: "Geral",
    start_date: "2026-04-03",
    end_date: "2026-04-03",
  },
  {
    title: "Ponto Facultativo",
    description: "Sábado da Semana Santa.",
    category: "ponto_facultativo",
    target: "Geral",
    start_date: "2026-04-04",
    end_date: "2026-04-04",
  },
  {
    title: "Ponto Facultativo (Circ. 1/2026/MRT)",
    description: "Véspera do feriado de Tiradentes (Circular 1/2026/MRT).",
    category: "ponto_facultativo",
    target: "Geral",
    start_date: "2026-04-20",
    end_date: "2026-04-20",
  },
  {
    title: "Tiradentes",
    description: "Feriado nacional.",
    category: "feriado",
    target: "Geral",
    start_date: "2026-04-21",
    end_date: "2026-04-21",
  },
  {
    title: "Dia do Trabalho",
    description: "Feriado nacional.",
    category: "feriado",
    target: "Geral",
    start_date: "2026-05-01",
    end_date: "2026-05-01",
  },
  {
    title: "Corpus Christi",
    description: "Feriado.",
    category: "feriado",
    target: "Geral",
    start_date: "2026-06-04",
    end_date: "2026-06-04",
  },
  {
    title: "Ponto Facultativo (Circ. 1/2026/MRT)",
    description: "Sexta-feira após Corpus Christi (Circular 1/2026/MRT).",
    category: "ponto_facultativo",
    target: "Geral",
    start_date: "2026-06-05",
    end_date: "2026-06-05",
  },
  {
    title: "Ponto Facultativo",
    description: "Sábado após Corpus Christi.",
    category: "ponto_facultativo",
    target: "Geral",
    start_date: "2026-06-06",
    end_date: "2026-06-06",
  },
];
