-- UX-15/TECH-30 (HANDOVER_AGENDA_v2.md, Parte 4.2): "Tipo de Atendimento" é
-- uma entidade nova, exclusiva de consulta, separada de EventCategory (que
-- fica intocada, exclusiva de bloqueio). Sem FK — mesmo padrão não
-- normalizado que categoria_id já usa hoje (referência solta, resolvida em
-- memória via Map no client); o catálogo de tipos em si vive em JSON local
-- (appointment-types.json), mesmo padrão de categories.server.ts.
ALTER TABLE public.appointments ADD COLUMN tipo_atendimento_id TEXT;
