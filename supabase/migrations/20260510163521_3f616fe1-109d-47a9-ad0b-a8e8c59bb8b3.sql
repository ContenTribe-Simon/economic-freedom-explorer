
-- Generic updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE TRIGGER trg_profiles_updated
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- finance_models
CREATE TABLE public.finance_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  model_version TEXT,
  model_release TEXT,
  data_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_opened_at TIMESTAMPTZ
);
CREATE INDEX idx_finance_models_user ON public.finance_models(user_id, updated_at DESC);
ALTER TABLE public.finance_models ENABLE ROW LEVEL SECURITY;

CREATE POLICY "models_select_own" ON public.finance_models
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "models_insert_own" ON public.finance_models
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "models_update_own" ON public.finance_models
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "models_delete_own" ON public.finance_models
  FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER trg_finance_models_updated
  BEFORE UPDATE ON public.finance_models
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- finance_snapshots
CREATE TABLE public.finance_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  model_id UUID REFERENCES public.finance_models(id) ON DELETE CASCADE,
  snapshot_name TEXT NOT NULL,
  note TEXT,
  scenario_name TEXT,
  scenario_type TEXT,
  snapshot_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_finance_snapshots_user ON public.finance_snapshots(user_id, created_at DESC);
CREATE INDEX idx_finance_snapshots_model ON public.finance_snapshots(model_id);
ALTER TABLE public.finance_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "snapshots_select_own" ON public.finance_snapshots
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "snapshots_insert_own" ON public.finance_snapshots
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "snapshots_update_own" ON public.finance_snapshots
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "snapshots_delete_own" ON public.finance_snapshots
  FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER trg_finance_snapshots_updated
  BEFORE UPDATE ON public.finance_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
