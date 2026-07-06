-- Phase 7 hardening: finance_snapshots.model_id must reference a finance_models row owned
-- by the SAME user. The original policies (20260510163521) validated only
-- auth.uid() = user_id on all four operations, so an authenticated user could INSERT or
-- UPDATE a snapshot whose model_id pointed at another user's model UUID. The table is not
-- queried by the client yet (CLOUD_MODEL.md: supplementary index, prepared for future use),
-- so this is schema-hardening before wiring, not an active-exploit fix.
--
-- Note on the EXISTS subquery: policies run as the invoking user, so the subquery on
-- finance_models is itself subject to that table's RLS ("models_select_own") — a foreign
-- model row is invisible, EXISTS returns false, and the write is rejected. The check is
-- therefore enforced even if finance_models.user_id were ever readable more broadly.
-- model_id stays nullable: a snapshot not linked to any model remains legal.

DROP POLICY "snapshots_insert_own" ON public.finance_snapshots;
CREATE POLICY "snapshots_insert_own" ON public.finance_snapshots
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND (
      model_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.finance_models m
        WHERE m.id = model_id AND m.user_id = auth.uid()
      )
    )
  );

DROP POLICY "snapshots_update_own" ON public.finance_snapshots;
CREATE POLICY "snapshots_update_own" ON public.finance_snapshots
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND (
      model_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.finance_models m
        WHERE m.id = model_id AND m.user_id = auth.uid()
      )
    )
  );
