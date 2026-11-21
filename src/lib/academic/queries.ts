import "server-only";

import { notFound, redirect } from "next/navigation";
import {
  buildClassSessions,
  summarizeAttendance,
  teachingPeriod,
  todayInBrasilia,
  type AttendanceStatus,
} from "@/lib/academic/attendance";
import { maxAbsences } from "@/lib/academic/calc";
import type { CalendarEventRow, CalendarSemesterOption } from "@/lib/academic/calendar-types";
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
  class_attendance: { status: string; hours: number }[];
};

export async function listSubjects(semesterId: string) {
  const supabase = await db();
  const { data, error } = await supabase
    .from("subjects")
    .select(
      "id, name, code, professor, color, status, workload_hours, min_average, min_attendance, class_schedules(weekday, start_time, end_time), assessments(weight, max_grade, grade), class_attendance(status, hours)",
    )
    .eq("semester_id", semesterId)
    .order("name")
    .returns<SubjectListRow[]>();
  if (error) throw dbError(error);
  return data ?? [];
}

export type SubjectDetail = Omit<SubjectListRow, "assessments" | "class_attendance"> & {
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
  class_attendance: { date: string; status: AttendanceStatus; hours: number }[];
};

export async function getSubject(id: string) {
  // IDs inválidos viram 404 em vez de erro do Postgres.
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await db();
  const { data, error } = await supabase
    .from("subjects")
    .select(
      "id, name, code, professor, room, color, status, workload_hours, min_average, min_attendance, semesters(id, name, start_date, end_date, is_current, min_average, min_attendance), class_schedules(weekday, start_time, end_time), assessments(id, name, type, date, weight, max_grade, grade), class_attendance(date, status, hours)",
    )
    .eq("id", id)
    .order("date", { referencedTable: "assessments", ascending: true, nullsFirst: false })
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

export async function listCalendarSemesters(): Promise<CalendarSemesterOption[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("semesters")
    .select("id, name, start_date, end_date, is_current, min_average, min_attendance, calendar_events(source)")
    .order("start_date", { ascending: false });
  if (error) throw dbError(error);
  return (data ?? []).map((row) => {
    const events = (row.calendar_events as unknown as { source: string }[] | null) ?? [];
    return {
      id: row.id,
      name: row.name,
      start_date: row.start_date,
      end_date: row.end_date,
      is_current: row.is_current,
      min_average: row.min_average,
      min_attendance: row.min_attendance,
      eventCount: events.length,
      pdfEventCount: events.filter((e) => e.source === "pdf").length,
    };
  });
}

export async function listCalendarEvents(semesterId: string) {
  const supabase = await db();
  const { data, error } = await supabase
    .from("calendar_events")
    .select("id, semester_id, title, description, category, target, start_date, end_date, source")
    .eq("semester_id", semesterId)
    .order("start_date", { ascending: true })
    .order("end_date", { ascending: true })
    .order("title", { ascending: true })
    .returns<CalendarEventRow[]>();
  if (error) throw dbError(error);
  return data ?? [];
}


/** Disciplina + todas as datas de aula do semestre (com feriados do calendário) + resumo de faltas. */
export async function getSubjectAttendance(id: string) {
  const subject = await getSubject(id);
  const events = await listCalendarEvents(subject.semesters.id);
  const today = todayInBrasilia();
  const sessions = buildClassSessions({
    schedules: subject.class_schedules,
    marks: subject.class_attendance,
    events,
    semester: subject.semesters,
    today,
  });
  const maxAbs = maxAbsences(subject.workload_hours, Number(subject.min_attendance ?? subject.semesters.min_attendance));
  return {
    subject,
    sessions,
    today,
    hasCalendar: events.length > 0,
    period: teachingPeriod(subject.semesters, events),
    summary: summarizeAttendance(sessions, maxAbs, today),
  };
}
