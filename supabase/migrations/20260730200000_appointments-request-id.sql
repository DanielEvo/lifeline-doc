-- BUG-13: chave de idempotência pra scheduleAppointment. O client gera um
-- requestId por submissão do dialog de criação; se o mesmo requestId chegar
-- duas vezes (duplo clique, retry de rede), o unique index rejeita o
-- segundo INSERT e o servidor devolve o agendamento já criado em vez de
-- duplicar. Séries recorrentes usam "<requestId>:<indice>" por ocorrência.
ALTER TABLE public.appointments ADD COLUMN request_id TEXT;

CREATE UNIQUE INDEX appointments_doctor_request_id_uidx
  ON public.appointments (doctor_id, request_id)
  WHERE request_id IS NOT NULL;
