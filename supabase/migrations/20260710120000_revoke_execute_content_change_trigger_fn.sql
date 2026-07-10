-- Phase 12 workstream B (security): restore the trigger-function execute-revoke baseline.
--
-- Migration 20260510163534 deliberately REVOKEd EXECUTE on the project's trigger functions
-- (set_updated_at, handle_new_user) from PUBLIC, anon and authenticated, so no API role can
-- invoke them directly. Migration 20260709090000 later added a THIRD trigger function,
-- set_updated_at_on_content_change(), but did not carry that revoke. New PostgreSQL
-- functions default to EXECUTE granted to PUBLIC, so on the live database anon/authenticated
-- can execute this one — a deviation from the established baseline, not a match to it.
--
-- Severity is LOW: it is a BEFORE-UPDATE trigger function that references NEW/OLD, so calling
-- it directly outside a trigger raises an error rather than exposing or mutating any data;
-- there is no data-access exploit here. This migration exists to keep the hardening baseline
-- consistent (every trigger function's EXECUTE is revoked from API roles) and to leave no
-- anon-executable public function for a security linter / Deep scan to flag. No RLS policy,
-- trigger wiring, or function body is touched.

REVOKE EXECUTE ON FUNCTION public.set_updated_at_on_content_change() FROM PUBLIC, anon, authenticated;
