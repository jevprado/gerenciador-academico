// Regras de cálculo compartilhadas entre painel e telas de disciplina.

export const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
export const TYPE_LABEL: Record<string, string> = {
  prova: "Prova",
  trabalho: "Trabalho",
  lista: "Lista",
  seminario: "Seminário",
  outro: "Outro",
};

type Graded = { weight: number; max_grade: number; grade: number | null };

// Média parcial ponderada (escala 0–10), só com avaliações que já têm nota (RF25).
export function partialAverage(assessments: Graded[]) {
  const graded = assessments.filter((a) => a.grade !== null);
  const total = graded.reduce((acc, a) => acc + Number(a.weight), 0);
  if (!total) return null;
  return graded.reduce((acc, a) => acc + (Number(a.grade) / Number(a.max_grade)) * 10 * Number(a.weight), 0) / total;
}

// Horas de falta permitidas antes de reprovar por frequência (RF32).
export function maxAbsences(workloadHours: number, minAttendance: number) {
  return Math.floor(workloadHours * (1 - minAttendance / 100));
}

export const fmtGrade = (n: number) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const fmtDay = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });
// "2026-11-16" → "16/11/2026"
export const fmtIsoDate = (iso: string) => fmtDay.format(Date.parse(iso));
