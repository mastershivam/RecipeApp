export default function TagFilter({
    tags,
    active,
    onToggle,
    onClear,
    action,
  }: {
    tags: string[];
    active: Set<string>;
    onToggle: (t: string) => void;
    onClear: () => void;
    action?: React.ReactNode;
  }) {
    if (tags.length === 0) return null;
  
    return (
      <div className="card">
        <div className="row" style={{ alignItems: "center" }}>
          <div>
            <div className="h2">Tags</div>
            <div className="muted small">Filter by tag</div>
          </div>
          <div style={{ display: "flex", gap: 8, flex: 0, whiteSpace: "nowrap" }}>
            {action}
            <button className="btn" onClick={onClear} disabled={active.size === 0}>
              Clear
            </button>
          </div>
        </div>
  
        <div className="hr" />
  
        <div className="badges">
          {tags.map((t) => (
            <div
              key={t}
              className={`badge ${active.has(t) ? "active" : ""}`}
              onClick={() => onToggle(t)}
              role="button"
              tabIndex={0}
            >
              {t}
            </div>
          ))}
        </div>
      </div>
    );
  }
