import "server-only";

import { notFound, redirect } from "next/navigation";
import { dbError } from "@/lib/supabase/db-error";
import { createClient } from "@/lib/supabase/server";

// Leituras das telas de cadastro. RLS garante que só vêm dados do usuário logado.

async function db() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect("/login");
  return supabase;
}

export type SemesterRow = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
  min_average: number;
  min_attendance: number;
};

export async function listSemesters() {
  const supabase = await db();
  const { data, error } = await supabase
    .from("semesters")
    .select("id, name, start_date, end_date, is_current, min_average, min_attendance, subjects(count)")
    .order("start_date", { ascending: false });
  if (error) throw dbError(error);
  return (data ?? []).map((s) => ({
    ...(s as SemesterRow),
    subjectCount: (s.subjects as unknown as { count: number }[])[0]?.count ?? 0,
  }));
}

export async function getCurrentSemester() {
  const supabase = await db();
  const { data, error } = await supabase
    .from("semesters")
    .select("id, name, start_date, end_date, is_current, min_average, min_attendance")
    .eq("is_current", true)
    .maybeSingle<SemesterRow>();
  if (error) throw dbError(error);
  return data;
}

export type Schedule = { weekday: number; start_time: string; end_time: string };

export type SubjectListRow = {
  id: string;
  name: string;
  code: string | null;
  professor: string | null;
  color: string;
  status: string;
  workload_hours: number;
  min_average: number | null;
  min_attendance: number | null;
  class_schedules: Schedule[];
  assessments: { weight: number; max_grade: number; grade: number | null }[];
  absences: { quantity: number }[];
};

export async function listSubjects(semesterId: string) {
  const supabase = await db();
  const { data, error } = await supabase
    .from("subjects")
    .select(
      "id, name, code, professor, color, status, workload_hours, min_average, min_attendance, class_schedules(weekday, start_time, end_time), assessments(weight, max_grade, grade), absences(quantity)",
    )
    .eq("semester_id", semesterId)
    .order("name")
    .returns<SubjectListRow[]>();
  if (error) throw dbError(error);
  return data ?? [];
}

export type SubjectDetail = Omit<SubjectListRow, "assessments" | "absences"> & {
  room: string | null;
  semesters: SemesterRow;
  assessments: {
    id: string;
    name: string;
    type: string;
    date: string | null;
    weight: number;
    max_grade: number;
    grade: number | null;
  }[];
  absences: { id: string; date: string; quantity: number }[];
};

export async function getSubject(id: string) {
  // IDs inválidos viram 404 em vez de erro do Postgres.
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await db();
  const { data, error } = await supabase
    .from("subjects")
    .select(
      "id, name, code, professor, room, color, status, workload_hours, min_average, min_attendance, semesters(id, name, start_date, end_date, is_current, min_average, min_attendance), class_schedules(weekday, start_time, end_time), assessments(id, name, type, date, weight, max_grade, grade), absences(id, date, quantity)",
    )
    .eq("id", id)
    .order("date", { referencedTable: "assessments", ascending: true, nullsFirst: false })
    .order("date", { referencedTable: "absences", ascending: false })
    .maybeSingle<SubjectDetail>();
  if (error) throw dbError(error);
  if (!data) notFound();
  return data;
}

export type DeadlineRow = {
  id: string;
  title: string;
  description: string | null;
  type: string;
  priority: "baixa" | "media" | "alta";
  due_at: string;
  completed_at: string | null;
  subjects: { id: string; name: string; color: string } | null;
};

export async function listDeadlines(semesterId: string) {
  const supabase = await db();
  const { data, error } = await supabase
    .from("deadlines")
    .select("id, title, description, type, priority, due_at, completed_at, subjects(id, name, color)")
    .eq("semester_id", semesterId)
    .order("due_at")
    .returns<DeadlineRow[]>();
  if (error) throw dbError(error);
  return data ?? [];
}
