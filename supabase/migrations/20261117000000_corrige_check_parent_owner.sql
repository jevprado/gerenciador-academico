-- Corrige check_parent_owner: a versão anterior lia new.subject_id também na
-- tabela subjects (que não tem essa coluna), e todo insert de disciplina falhava
-- com 'record "new" has no field "subject_id"'.
-- Agora cada tabela só acessa os campos que realmente tem.
create or replace function public.check_parent_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'subjects' then
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
