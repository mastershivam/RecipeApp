-- Recipe change log (audit trail).
CREATE TABLE IF NOT EXISTS recipe_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id uuid NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  changes jsonb,
  changed_at timestamptz DEFAULT now()
);

ALTER TABLE recipe_changes ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION log_recipe_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO recipe_changes (recipe_id, user_id, action, changes)
    VALUES (
      NEW.id,
      auth.uid(),
      'insert',
      jsonb_build_object(
        'after',
        jsonb_build_object(
          'title', NEW.title,
          'description', NEW.description,
          'tags', NEW.tags,
          'ingredients', NEW.ingredients,
          'steps', NEW.steps,
          'prep_minutes', NEW.prep_minutes,
          'cook_minutes', NEW.cook_minutes,
          'servings', NEW.servings,
          'source_url', NEW.source_url,
          'cover_photo_id', NEW.cover_photo_id,
          'is_favorite', NEW.is_favorite,
          'last_cooked_at', NEW.last_cooked_at
        )
      )
    );
    RETURN NEW;
  ELSIF (TG_OP = 'UPDATE') THEN
    INSERT INTO recipe_changes (recipe_id, user_id, action, changes)
    VALUES (
      NEW.id,
      auth.uid(),
      'update',
      jsonb_build_object(
        'before',
        jsonb_build_object(
          'title', OLD.title,
          'description', OLD.description,
          'tags', OLD.tags,
          'ingredients', OLD.ingredients,
          'steps', OLD.steps,
          'prep_minutes', OLD.prep_minutes,
          'cook_minutes', OLD.cook_minutes,
          'servings', OLD.servings,
          'source_url', OLD.source_url,
          'cover_photo_id', OLD.cover_photo_id,
          'is_favorite', OLD.is_favorite,
          'last_cooked_at', OLD.last_cooked_at
        ),
        'after',
        jsonb_build_object(
          'title', NEW.title,
          'description', NEW.description,
          'tags', NEW.tags,
          'ingredients', NEW.ingredients,
          'steps', NEW.steps,
          'prep_minutes', NEW.prep_minutes,
          'cook_minutes', NEW.cook_minutes,
          'servings', NEW.servings,
          'source_url', NEW.source_url,
          'cover_photo_id', NEW.cover_photo_id,
          'is_favorite', NEW.is_favorite,
          'last_cooked_at', NEW.last_cooked_at
        )
      )
    );
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    INSERT INTO recipe_changes (recipe_id, user_id, action, changes)
    VALUES (
      OLD.id,
      auth.uid(),
      'delete',
      jsonb_build_object(
        'before',
        jsonb_build_object(
          'title', OLD.title,
          'description', OLD.description,
          'tags', OLD.tags,
          'ingredients', OLD.ingredients,
          'steps', OLD.steps,
          'prep_minutes', OLD.prep_minutes,
          'cook_minutes', OLD.cook_minutes,
          'servings', OLD.servings,
          'source_url', OLD.source_url,
          'cover_photo_id', OLD.cover_photo_id,
          'is_favorite', OLD.is_favorite,
          'last_cooked_at', OLD.last_cooked_at
        )
      )
    );
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

ALTER FUNCTION log_recipe_changes() SET row_security = off;

DROP TRIGGER IF EXISTS recipes_change_log_trigger ON recipes;
CREATE TRIGGER recipes_change_log_trigger
AFTER INSERT OR UPDATE OR DELETE ON recipes
FOR EACH ROW EXECUTE FUNCTION log_recipe_changes();

CREATE POLICY "Users can view change log for accessible recipes"
  ON recipe_changes FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM recipes r
    WHERE r.id = recipe_changes.recipe_id
      AND (
        r.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM recipe_shares s
          WHERE s.recipe_id = r.id AND s.shared_with = auth.uid()
        )
        OR EXISTS (
          SELECT 1
          FROM recipe_group_shares gs
          JOIN group_members gm ON gm.group_id = gs.group_id
          WHERE gs.recipe_id = r.id
            AND gm.user_id = auth.uid()
            AND gm.status = 'accepted'
        )
      )
  ));
