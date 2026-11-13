-- Dados de exemplo para o painel (os mesmos do antigo mock).
-- Troque o e-mail abaixo pelo da sua conta e rode no SQL Editor do Supabase.
do $$
declare
  uid uuid := (select id from auth.users where email = 'SEU_EMAIL_AQUI');
  sem uuid;
  calc uuid; ed uuid; fis uuid; bd uuid; pe uuid;
begin
  if uid is null then raise exception 'Usuário não encontrado'; end if;

  insert into public.semesters (user_id, name, start_date, end_date, is_current)
  values (uid, '2026.2', '2026-08-03', '2026-12-18', true) returning id into sem;

  insert into public.subjects (user_id, semester_id, name, professor, color, workload_hours)
    values (uid, sem, 'Cálculo II', 'Profa. Helena Duarte', '#3b82f6', 60) returning id into calc;
  insert into public.subjects (user_id, semester_id, name, professor, color, workload_hours)
    values (uid, sem, 'Estruturas de Dados', 'Prof. Ricardo Lima', '#10b981', 60) returning id into ed;
  insert into public.subjects (user_id, semester_id, name, professor, color, workload_hours)
    values (uid, sem, 'Física Geral II', 'Prof. Marcos Teixeira', '#f59e0b', 60) returning id into fis;
  insert into public.subjects (user_id, semester_id, name, professor, color, workload_hours)
    values (uid, sem, 'Banco de Dados', 'Profa. Carla Nunes', '#8b5cf6', 60) returning id into bd;
  insert into public.subjects (user_id, semester_id, name, professor, color, workload_hours)
    values (uid, sem, 'Probabilidade e Estatística', 'Prof. André Souza', '#ef4444', 60) returning id into pe;

  insert into public.class_schedules (user_id, subject_id, weekday, start_time, end_time) values
    (uid, calc, 1, '08:00', '10:00'), (uid, ed, 2, '10:00', '12:00'), (uid, fis, 3, '14:00', '16:00'),
    (uid, bd, 4, '08:00', '10:00'), (uid, pe, 5, '10:00', '12:00');

  insert into public.assessments (user_id, subject_id, name, type, date, weight, grade) values
    (uid, calc, 'P1', 'prova', '2026-09-21', 1, 7.8),
    (uid, ed, 'P1', 'prova', '2026-09-22', 1, 8.6),
    (uid, fis, 'P1', 'prova', '2026-09-23', 1, 5.2),
    (uid, fis, 'P2', 'prova', '2026-11-16', 1, null),
    (uid, bd, 'P1', 'prova', '2026-09-24', 1, 9.1),
    (uid, pe, 'P1', 'prova', '2026-11-27', 1, null);

  insert into public.absences (user_id, subject_id, date, quantity) values
    (uid, calc, '2026-09-01', 2), (uid, ed, '2026-09-08', 4), (uid, fis, '2026-10-07', 6),
    (uid, bd, '2026-10-02', 1), (uid, pe, '2026-10-16', 12);

  insert into public.deadlines (user_id, semester_id, subject_id, title, type, due_at) values
    (uid, sem, calc, 'Lista 4 — Integrais múltiplas', 'lista', '2026-11-11 23:59-03'),
    (uid, sem, fis, 'P2 — Eletromagnetismo', 'prova', '2026-11-16 14:00-03'),
    (uid, sem, ed, 'Trabalho — Árvores AVL', 'trabalho', '2026-11-19 23:59-03'),
    (uid, sem, bd, 'Modelagem ER do projeto', 'trabalho', '2026-11-24 23:59-03'),
    (uid, sem, pe, 'Seminário — Distribuições', 'seminario', '2026-11-27 10:00-03');
end $$;
