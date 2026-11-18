-- Calendário acadêmico do semestre: datas importantes extraídas de PDF ou cadastradas manualmente.
-- Privado por usuário (RLS com auth.uid()).

create type public.calendar_event_category as enum (
  'academico',
  'matricula',
  'trancamento',
  'feriado',
  'ponto_facultativo',
  'outro'
);

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  semester_id uuid not null references public.semesters (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  description text,
  category public.calendar_event_category not null default 'academico',
  target text check (target is null or char_length(target) <= 60),
  start_date date not null,
  end_date date not null,
  source text not null default 'manual' check (source in ('manual', 'pdf')),
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create index calendar_events_semester_idx on public.calendar_events (semester_id, start_date);
create index calendar_events_user_idx on public.calendar_events (user_id);

alter table public.calendar_events enable row level security;

create policy "dono acessa" on public.calendar_events for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Atualiza check_parent_owner para validar também calendar_events.
create or replace function public.check_parent_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name in ('subjects', 'calendar_events') then
    if not exists (select 1 from public.semesters where id = new.semester_id and user_id = new.user_id) then
      raise exception 'semestre inválido';
    end if;

  elsif tg_table_name = 'deadlines' then
    if not exists (select 1 from public.semesters where id = new.semester_id and user_id = new.user_id) then
      raise exception 'semestre inválido';
    end if;
    if new.subject_id is not null
       and not exists (select 1 from public.subjects where id = new.subject_id and user_id = new.user_id) then
      raise exception 'disciplina inválida';
    end if;

  else -- class_schedules, assessments, absences
    if not exists (select 1 from public.subjects where id = new.subject_id and user_id = new.user_id) then
      raise exception 'disciplina inválida';
    end if;
  end if;

  return new;
end $$;

create trigger check_parent_owner before insert or update on public.calendar_events
  for each row execute function public.check_parent_owner();
