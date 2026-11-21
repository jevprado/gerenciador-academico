-- Frequência por aula: um registro por disciplina e data (presente, falta, cancelada, sem aula).
-- As datas das aulas não são gravadas — são calculadas pelos horários + calendário do semestre.
-- Só o que o estudante marca fica aqui. Substitui a tabela "absences" (dados migrados abaixo).

create type public.attendance_status as enum ('presente', 'falta', 'cancelada', 'sem_aula');

create table public.class_attendance (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id uuid not null references public.subjects (id) on delete cascade,
  date date not null,
  status public.attendance_status not null,
  -- horas-aula daquele dia (conta como falta quando status = 'falta')
  hours smallint not null default 2 check (hours between 1 and 12),
  updated_at timestamptz not null default now(),
  unique (subject_id, date)
);
create index class_attendance_user_idx on public.class_attendance (user_id);

alter table public.class_attendance enable row level security;

create policy "dono acessa" on public.class_attendance for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- check_parent_owner (versão do calendário) já valida subject_id para tabelas filhas de disciplina.
create trigger check_parent_owner before insert or update on public.class_attendance
  for each row execute function public.check_parent_owner();

-- Leva as faltas já registradas para a tabela nova (somando as do mesmo dia).
insert into public.class_attendance (user_id, subject_id, date, status, hours)
select user_id, subject_id, date, 'falta', least(12, sum(quantity))
from public.absences
group by user_id, subject_id, date
on conflict (subject_id, date) do nothing;
