-- Phase 12 concurrency-correctness fix (Codex review): finance_models.updated_at is the
-- optimistic-concurrency token for overwriteModel (src/lib/cloud/models.ts). The generic
-- set_updated_at() trigger bumped it on EVERY update — including loadModel's harmless
-- last_opened_at bookkeeping write — so merely OPENING a model (in this or another
-- tab/device) invalidated other sessions' tokens and made later, entirely legitimate
-- overwrites fail with a false "changed elsewhere" conflict although data_json never
-- changed.
--
-- From this migration, finance_models.updated_at moves ONLY when the model's CONTENT
-- (data_json) actually changes. Bookkeeping updates (last_opened_at) and metadata edits
-- (name) leave it untouched, and any client-supplied updated_at on a non-content update is
-- discarded in favour of the old value — the column is fully server-owned.
--
-- The GENERIC public.set_updated_at() is deliberately left untouched: the profiles and
-- finance_snapshots triggers still use it (their updated_at is not a concurrency token,
-- and the generic function cannot reference data_json — profiles has no such column).
-- No RLS policy is touched here.

CREATE OR REPLACE FUNCTION public.set_updated_at_on_content_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.data_json IS DISTINCT FROM OLD.data_json THEN
    NEW.updated_at = now();
  ELSE
    NEW.updated_at = OLD.updated_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER trg_finance_models_updated ON public.finance_models;
CREATE TRIGGER trg_finance_models_updated
  BEFORE UPDATE ON public.finance_models
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_on_content_change();
