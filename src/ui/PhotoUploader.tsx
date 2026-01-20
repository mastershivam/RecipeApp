import { useRef, useState } from "react";

function isAcceptedImage(file: File): boolean {
  if (file.type && /^image\//.test(file.type)) return true;
  return /\.(heic|heif)$/i.test(file.name);
}

type PendingPhoto = {
  id: string;
  file: File;
  previewUrl: string;
  progress?: number;
  status?: "pending" | "uploading" | "done" | "error";
  error?: string | null;
};

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
  const [isDragging, setIsDragging] = useState(false);

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes("Files")) setIsDragging(true);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes("Files")) e.dataTransfer.dropEffect = "copy";
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (!files?.length) return;
    const accepted = Array.from(files).filter(isAcceptedImage);
    if (accepted.length === 0) return;
    const dt = new DataTransfer();
    for (const f of accepted) dt.items.add(f);
    onFiles(dt.files);
  }

  return (
    <div
      className={`card stack photo-uploader ${isDragging ? "is-dragging" : ""}`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="photo-uploader-drop-hint" aria-hidden>
          Drop photos here
        </div>
      )}
      <div className="row">
        <div>
          <div className="h2">{title}</div>
          <div className="muted small">{subtitle}</div>
          <div className="muted small">Drag and drop supported.</div>
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
                {typeof p.progress === "number" && (
                  <div className="progress-track" style={{ marginTop: 8 }}>
                    <div
                      className="progress-bar static"
                      style={{ width: `${Math.min(100, Math.max(0, p.progress))}%` }}
                    />
                  </div>
                )}
                {p.status && (
                  <div className="muted small" style={{ marginTop: 6 }}>
                    {p.status === "uploading" && "Uploading…"}
                    {p.status === "done" && "Uploaded"}
                    {p.status === "error" && (p.error || "Upload failed")}
                    {p.status === "pending" && "Ready to upload"}
                  </div>
                )}
                {onRemovePending && p.status !== "uploading" && (
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
