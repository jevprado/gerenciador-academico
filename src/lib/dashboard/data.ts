import "server-only";

import { absenceHours } from "@/lib/academic/attendance";
import { TYPE_LABEL, WEEKDAYS, maxAbsences, partialAverage } from "@/lib/academic/calc";
import { dbError } from "@/lib/supabase/db-error";
import { createClient } from "@/lib/supabase/server";

export type Subject = {
  id: string;
  name: string;
  professor: string | null;
  color: string;
  average: number | null; // média parcial ponderada (só avaliações com nota)
  minAverage: number;
  absences: number;
  maxAbsences: number;
  schedules: string[];
};

export type Deadline = {
  id: string;
  title: string;
  subjectId: string | null;
  type: string;
  dueAt: string;
};

export type Semester = { id: string; name: string; start: string; end: string };

export type DashboardData = {
  semester: Semester;
  subjects: Subject[];
  deadlines: Deadline[];
} | null;

type SubjectRow = {
  id: string;
  name: string;
  professor: string | null;
  color: string;
  workload_hours: number;
  min_average: number | null;
  min_attendance: number | null;
  class_schedules: { weekday: number; start_time: string; end_time: string | null }[];
  assessments: { weight: number; max_grade: number; grade: number | null }[];
  class_attendance: { status: string; hours: number }[];
};

// Lê o semestre atual do usuário logado. RLS garante que só vêm os dados dele.
export async function getDashboardData(): Promise<DashboardData> {
  const supabase = await createClient();

  const { data: sem, error } = await supabase
    .from("semesters")
    .select("id, name, start_date, end_date, min_average, min_attendance")
    .eq("is_current", true)
    .maybeSingle();
  if (error) throw dbError(error);
  if (!sem) return null;

  const [subjectsRes, deadlinesRes] = await Promise.all([
    supabase
      .from("subjects")
      .select(
        "id, name, professor, color, workload_hours, min_average, min_attendance, class_schedules(weekday, start_time, end_time), assessments(weight, max_grade, grade), class_attendance(status, hours)",
      )
      .eq("semester_id", sem.id)
      .eq("status", "cursando")
      .order("name")
      .returns<SubjectRow[]>(),
    supabase
      .from("deadlines")
      .select("id, title, subject_id, type, due_at")
      .eq("semester_id", sem.id)
      .is("completed_at", null)
      .order("due_at")
      .limit(8),
  ]);
  if (subjectsRes.error) throw dbError(subjectsRes.error);
  if (deadlinesRes.error) throw dbError(deadlinesRes.error);

  const subjects: Subject[] = (subjectsRes.data ?? []).map((s) => {
    const average = partialAverage(s.assessments);
    const minAttendance = Number(s.min_attendance ?? sem.min_attendance);
    const schedules = [
      ...new Set(
        [...s.class_schedules]
          .sort((a, b) => a.weekday - b.weekday || a.start_time.localeCompare(b.start_time))
          .map((c) => {
            const start = c.start_time.slice(0, 5);
            const end = c.end_time?.slice(0, 5);
            return end ? `${WEEKDAYS[c.weekday]} ${start}–${end}` : `${WEEKDAYS[c.weekday]} ${start}`;
          }),
      ),
    ];
    return {
      id: s.id,
      name: s.name,
      professor: s.professor,
      color: s.color,
      average,
      minAverage: Number(s.min_average ?? sem.min_average),
      absences: absenceHours(s.class_attendance),
      maxAbsences: maxAbsences(s.workload_hours, minAttendance),
      schedules,
    };
  });

  return {
    semester: { id: sem.id, name: sem.name, start: sem.start_date, end: sem.end_date },
    subjects,
    deadlines: (deadlinesRes.data ?? []).map((d) => ({
      id: d.id,
      title: d.title,
      subjectId: d.subject_id,
      type: TYPE_LABEL[d.type] ?? d.type,
      dueAt: d.due_at,
    })),
  };
}
