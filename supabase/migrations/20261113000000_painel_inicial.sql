-- Estrutura inicial: semestres, disciplinas, horários, avaliações, faltas e prazos.
-- Todas as tabelas são privadas por usuário (RLS com auth.uid()).

-- ---------------------------------------------------------------------------
-- Semestres (RF09–RF13)
-- ---------------------------------------------------------------------------
create table public.semesters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  start_date date not null,
  end_date date not null,
  is_current boolean not null default false,
  archived boolean not null default false,
  min_average numeric(4,2) not null default 6 check (min_average between 0 and 10),
  min_attendance numeric(5,2) not null default 75 check (min_attendance between 0 and 100),
  created_at timestamptz not null default now(),
  check (end_date > start_date)
);

-- No máximo um semestre "atual" por usuário.
create unique index semesters_one_current_per_user on public.semesters (user_id) where is_current;
create index semesters_user_idx on public.semesters (user_id);

-- ---------------------------------------------------------------------------
-- Disciplinas (RF15–RF20)
-- ---------------------------------------------------------------------------
create type public.subject_status as enum ('cursando', 'aprovado', 'reprovado', 'trancado');

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  semester_id uuid not null references public.semesters (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  code text,
  professor text,
  room text,
  color text not null default '#275e4c' check (color ~ '^#[0-9a-fA-F]{6}$'),
  workload_hours integer not null default 60 check (workload_hours > 0),
  -- null = herda o critério do semestre (RF19)
  min_average numeric(4,2) check (min_average between 0 and 10),
  min_attendance numeric(5,2) check (min_attendance between 0 and 100),
  status public.subject_status not null default 'cursando',
  created_at timestamptz not null default now()
);
create index subjects_semester_idx on public.subjects (semester_id);
create index subjects_user_idx on public.subjects (user_id);

-- Horários semanais (RF17). weekday: 0 = domingo … 6 = sábado.
create table public.class_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id uuid not null references public.subjects (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  check (end_time > start_time)
);
create index class_schedules_subject_idx on public.class_schedules (subject_id);

-- ---------------------------------------------------------------------------
-- Avaliações e notas (RF22–RF25)
-- ---------------------------------------------------------------------------
create type public.assessment_type as enum ('prova', 'trabalho', 'lista', 'seminario', 'outro');

create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id uuid not null references public.subjects (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  type public.assessment_type not null default 'prova',
  date date,
  weight numeric(6,2) not null default 1 check (weight > 0),
  max_grade numeric(6,2) not null default 10 check (max_grade > 0),
  grade numeric(6,2) check (grade >= 0),
  created_at timestamptz not null default now(),
  check (grade is null or grade <= max_grade)
);
create index assessments_subject_idx on public.assessments (subject_id);

-- ---------------------------------------------------------------------------
-- Faltas (RF31) — quantidade em horas-aula
-- ---------------------------------------------------------------------------
create table public.absences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id uuid not null references public.subjects (id) on delete cascade,
  date date not null default current_date,
  quantity smallint not null default 1 check (quantity > 0),
  created_at timestamptz not null default now()
);
create index absences_subject_idx on public.absences (subject_id);

-- ---------------------------------------------------------------------------
-- Prazos e tarefas (RF34–RF37)
-- ---------------------------------------------------------------------------
create type public.deadline_priority as enum ('baixa', 'media', 'alta');

create table public.deadlines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  semester_id uuid not null references public.semesters (id) on delete cascade,
  subject_id uuid references public.subjects (id) on delete set null,
  assessment_id uuid references public.assessments (id) on delete set null,
  title text not null check (char_length(title) between 1 and 200),
  description text,
  type public.assessment_type not null default 'trabalho',
  priority public.deadline_priority not null default 'media',
  due_at timestamptz not null,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index deadlines_user_due_idx on public.deadlines (user_id, due_at);
create index deadlines_semester_idx on public.deadlines (semester_id);

-- ---------------------------------------------------------------------------
-- RLS: cada usuário só enxerga e altera os próprios dados
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['semesters','subjects','class_schedules','assessments','absences','deadlines'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "dono acessa" on public.%I for all to authenticated
         using ((select auth.uid()) = user_id)
         with check ((select auth.uid()) = user_id)', t);
  end loop;
end $$;

-- Impede ligar um registro a uma disciplina/semestre de outro usuário.
create or replace function public.check_parent_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'subjects' or (tg_table_name = 'deadlines') then
    if not exists (select 1 from public.semesters where id = new.semester_id and user_id = new.user_id) then
      raise exception 'semestre inválido';
    end if;
  end if;
  if tg_table_name in ('class_schedules','assessments','absences')
     or (tg_table_name = 'deadlines' and new.subject_id is not null) then
    if not exists (select 1 from public.subjects where id = new.subject_id and user_id = new.user_id) then
      raise exception 'disciplina inválida';
    end if;
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['subjects','class_schedules','assessments','absences','deadlines'] loop
    execute format(
      'create trigger check_parent_owner before insert or update on public.%I
         for each row execute function public.check_parent_owner()', t);
  end loop;
end $$;
