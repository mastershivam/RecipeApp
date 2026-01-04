-- Full-text search setup for recipes (trigger-based).
ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE OR REPLACE FUNCTION recipes_search_vector_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(array_to_string(NEW.tags, ' '), '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.ingredients::text, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(NEW.steps::text, '')), 'C');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS recipes_search_vector_trigger ON recipes;
CREATE TRIGGER recipes_search_vector_trigger
BEFORE INSERT OR UPDATE ON recipes
FOR EACH ROW EXECUTE FUNCTION recipes_search_vector_update();

UPDATE recipes SET search_vector = NULL;

CREATE INDEX IF NOT EXISTS recipes_search_vector_idx
  ON recipes
  USING gin (search_vector);
