import { useMemo } from "react";
import type { Recipe, RecipeChange } from "../lib/types";

type VersionComparisonProps = {
  currentRecipe: Recipe;
  change: RecipeChange;
  onRollback?: (changeId: string) => void;
  canRollback?: boolean;
};

type FieldDiff = {
  field: string;
  label: string;
  before: unknown;
  after: unknown;
  changed: boolean;
};

export default function VersionComparison({
  currentRecipe,
  change,
  onRollback,
  canRollback = false,
}: VersionComparisonProps) {
  const diffs = useMemo(() => {
    if (change.action === "insert") {
      return [];
    }
    if (change.action === "delete") {
      return [];
    }

    const after = change.changes?.after;
    if (!after) return [];

    // Compare the version after this change with the current recipe
    const fields: FieldDiff[] = [
      {
        field: "title",
        label: "Title",
        before: after.title,
        after: currentRecipe.title,
        changed: after.title !== currentRecipe.title,
      },
      {
        field: "description",
        label: "Description",
        before: after.description ?? "",
        after: currentRecipe.description ?? "",
        changed: (after.description ?? "") !== (currentRecipe.description ?? ""),
      },
      {
        field: "tags",
        label: "Tags",
        before: (after.tags ?? []).join(", "),
        after: (currentRecipe.tags ?? []).join(", "),
        changed: JSON.stringify(after.tags ?? []) !== JSON.stringify(currentRecipe.tags ?? []),
      },
      {
        field: "ingredients",
        label: "Ingredients",
        before: after.ingredients ?? [],
        after: currentRecipe.ingredients ?? [],
        changed: JSON.stringify(after.ingredients ?? []) !== JSON.stringify(currentRecipe.ingredients ?? []),
      },
      {
        field: "steps",
        label: "Steps",
        before: after.steps ?? [],
        after: currentRecipe.steps ?? [],
        changed: JSON.stringify(after.steps ?? []) !== JSON.stringify(currentRecipe.steps ?? []),
      },
      {
        field: "prep_minutes",
        label: "Prep Time",
        before: after.prep_minutes ?? null,
        after: currentRecipe.prep_minutes ?? null,
        changed: (after.prep_minutes ?? null) !== (currentRecipe.prep_minutes ?? null),
      },
      {
        field: "cook_minutes",
        label: "Cook Time",
        before: after.cook_minutes ?? null,
        after: currentRecipe.cook_minutes ?? null,
        changed: (after.cook_minutes ?? null) !== (currentRecipe.cook_minutes ?? null),
      },
      {
        field: "servings",
        label: "Servings",
        before: after.servings ?? null,
        after: currentRecipe.servings ?? null,
        changed: (after.servings ?? null) !== (currentRecipe.servings ?? null),
      },
      {
        field: "source_url",
        label: "Source URL",
        before: after.source_url ?? "",
        after: currentRecipe.source_url ?? "",
        changed: (after.source_url ?? "") !== (currentRecipe.source_url ?? ""),
      },
    ];

    return fields.filter((f) => f.changed);
  }, [change, currentRecipe]);

  const formatValue = (value: unknown, field: string): string => {
    if (value === null || value === undefined) return "";
    if (field === "ingredients" || field === "steps") {
      if (Array.isArray(value)) {
        return value
          .map((item: unknown) =>
            item && typeof item === "object" && "text" in item
              ? String((item as { text?: string }).text ?? "")
              : String(item ?? "")
          )
          .filter(Boolean)
          .join("\n");
      }
      return "";
    }
    if (typeof value === "number") return value.toString();
    return String(value);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  if (change.action === "insert") {
    return (
      <div className="card stack">
        <div className="h2">Recipe Created</div>
        <div className="muted small">This recipe was created on {formatDate(change.changed_at)}</div>
      </div>
    );
  }

  if (change.action === "delete") {
    return (
      <div className="card stack">
        <div className="h2">Recipe Deleted</div>
        <div className="muted small">This recipe was deleted on {formatDate(change.changed_at)}</div>
      </div>
    );
  }

  if (diffs.length === 0) {
    return (
      <div className="card stack">
        <div className="h2">No Differences</div>
        <div className="muted small">
          The recipe at this point in time is identical to the current version. No changes have been made since this update.
        </div>
        {canRollback && onRollback && (
          <div style={{ marginTop: "16px" }}>
            <button
              className="btn danger"
              type="button"
              onClick={() => {
                if (confirm("Are you sure you want to rollback to this version? This will overwrite the current recipe.")) {
                  onRollback(change.id);
                }
              }}
            >
              Rollback to This Version
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="card stack">
        <div className="row" style={{ alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div className="h2">Version Comparison</div>
            <div className="muted small">Changed on {formatDate(change.changed_at)}</div>
          </div>
          {canRollback && onRollback && (
            <button
              className="btn danger"
              type="button"
              onClick={() => {
                if (confirm("Are you sure you want to rollback to this version? This will overwrite the current recipe.")) {
                  onRollback(change.id);
                }
              }}
            >
              Rollback to This Version
            </button>
          )}
        </div>
        <div className="hr" />
      </div>

      <div className="card stack">
        <div className="version-comparison-grid">
          <div className="version-column">
            <div className="version-header">
              <div className="h3">Version at This Point</div>
              <div className="muted small">State after this change</div>
            </div>
          </div>
          <div className="version-column">
            <div className="version-header">
              <div className="h3">Current Version</div>
              <div className="muted small">Latest state of the recipe</div>
            </div>
          </div>
        </div>

        {diffs.map((diff) => (
          <div key={diff.field} className="version-comparison-grid">
            <div className="version-column">
              <div className="version-field">
                <div className="version-field-label">{diff.label}</div>
                <div className="version-field-content removed">
                  {diff.field === "ingredients" || diff.field === "steps" ? (
                    <div className="version-list">
                      {Array.isArray(diff.before) && diff.before.length > 0 ? (
                        diff.before.map((item: unknown, idx: number) => (
                          <div key={idx} className="version-list-item">
                            {item && typeof item === "object" && "text" in item
                              ? String((item as { text?: string }).text ?? "")
                              : String(item ?? "")}
                          </div>
                        ))
                      ) : (
                        <div className="muted small">(empty)</div>
                      )}
                    </div>
                  ) : (
                    <div>{formatValue(diff.before, diff.field) || <span className="muted">(empty)</span>}</div>
                  )}
                </div>
              </div>
            </div>
            <div className="version-column">
              <div className="version-field">
                <div className="version-field-label">{diff.label}</div>
                <div className="version-field-content added">
                  {diff.field === "ingredients" || diff.field === "steps" ? (
                    <div className="version-list">
                      {Array.isArray(diff.after) && diff.after.length > 0 ? (
                        diff.after.map((item: unknown, idx: number) => (
                          <div key={idx} className="version-list-item">
                            {item && typeof item === "object" && "text" in item
                              ? String((item as { text?: string }).text ?? "")
                              : String(item ?? "")}
                          </div>
                        ))
                      ) : (
                        <div className="muted small">(empty)</div>
                      )}
                    </div>
                  ) : (
                    <div>{formatValue(diff.after, diff.field) || <span className="muted">(empty)</span>}</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

