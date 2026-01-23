-- Recipe metadata for favorites and recently cooked.
ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS is_favorite boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_cooked_at timestamptz,
  ADD COLUMN IF NOT EXISTS nutrition_cache jsonb,
  ADD COLUMN IF NOT EXISTS nutrition_updated_at timestamptz;
