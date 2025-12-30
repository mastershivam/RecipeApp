import { useRef } from "react";

type PendingPhoto = { id: string; file: File; previewUrl: string };

export default function PhotoUploader({
  onFiles,
  pendingPhotos,
  onRemovePending,
  title = "Photos",
  subtitle = "Stored locally in your browser",
  isUploading = false,
}: {
  onFiles: (files: FileList) => void;
  pendingPhotos?: PendingPhoto[];
  onRemovePending?: (id: string) => void;
  title?: string;
  subtitle?: string;
  isUploading?: boolean;
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
          <button
            className="btn"
            type="button"
            disabled={isUploading}
            onClick={() => inputRef.current?.click()}
          >
            {isUploading ? "Uploading…" : "Upload"}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*,.heic,.heif"
            multiple
            style={{ display: "none" }}
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) onFiles(e.target.files);
              e.currentTarget.value = "";
            }}
          />
        </div>
      </div>

      {isUploading && (
        <div className="upload-status">
          <div className="muted small">Uploading & converting… please keep this tab open.</div>
          <div className="progress-track">
            <div className="progress-bar" />
          </div>
        </div>
      )}

      {pendingPhotos && pendingPhotos.length > 0 && (
        <>
          <div className="hr" />
          <div className="gallery">
            {pendingPhotos.map((p) => (
              <div key={p.id} className="card gallery-item">
                <div className="gallery-media">
                  <img className="thumb" src={p.previewUrl} alt="" />
                </div>
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
