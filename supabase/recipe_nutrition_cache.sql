-- Add nutrition cache columns for AI per-serving estimates.
ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS nutrition_cache jsonb,
  ADD COLUMN IF NOT EXISTS nutrition_updated_at timestamptz;
