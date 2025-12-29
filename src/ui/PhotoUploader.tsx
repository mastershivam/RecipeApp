import { useRef } from "react";

type PendingPhoto = { id: string; file: File; previewUrl: string };

export default function PhotoUploader({
  onFiles,
  pendingPhotos,
  onRemovePending,
  title = "Photos",
  subtitle = "Stored locally in your browser",
}: {
  onFiles: (files: FileList) => void;
  pendingPhotos?: PendingPhoto[];
  onRemovePending?: (id: string) => void;
  title?: string;
  subtitle?: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="card stack">
      <div className="row">
        <div>
          <div className="h2">{title}</div>
          <div className="muted small">{subtitle}</div>
        </div>
        <div style={{ flex: 0 }}>
          <button className="btn" type="button" onClick={() => inputRef.current?.click()}>
            Upload
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: "none" }}
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) onFiles(e.target.files);
              e.currentTarget.value = "";
            }}
          />
        </div>
      </div>

      {pendingPhotos && pendingPhotos.length > 0 && (
        <>
          <div className="hr" />
          <div className="gallery">
            {pendingPhotos.map((p) => (
              <div key={p.id} className="card" style={{ padding: 10 }}>
                <img className="thumb" src={p.previewUrl} alt="" />
                {onRemovePending && (
                  <button
                    className="btn"
                    type="button"
                    style={{ marginTop: 8, width: "100%" }}
                    onClick={() => onRemovePending(p.id)}
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}