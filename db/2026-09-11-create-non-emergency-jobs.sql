-- Braconier: stop non-emergency calls creating ServiceTrade jobs.
--
-- Re-keying Braconier's ServiceTrade rows to the Main Router (2026-09-10) switched on
-- inbound job creation for EVERY actionable Braconier call, office-hours ones included,
-- where there had never been any. The rule is: a work order only for an existing customer
-- with an emergency.
--
-- src/routes/webhook/retell.js reads this beside create_emergency_jobs and defaults it to
-- TRUE when absent, so every other tenant on that path — Winninger, Pacific Western,
-- Done Right, Adaptive Outbound — keeps its current behaviour untouched. Only the explicit
-- false below changes anything.

BEGIN;

ALTER TABLE public.servicetrade_job_configs
  ADD COLUMN IF NOT EXISTS create_non_emergency_jobs boolean;

UPDATE public.servicetrade_job_configs
   SET create_non_emergency_jobs = false
 WHERE agent_id = 'agent_41010d0d8c1f46cf1d9dfcddbf';

COMMIT;

-- Verify: Braconier false, everyone else NULL (which the code reads as true).
SELECT agent_id,
       "Companyname",
       create_emergency_jobs,
       create_non_emergency_jobs
  FROM public.servicetrade_job_configs
 ORDER BY create_non_emergency_jobs NULLS LAST;
