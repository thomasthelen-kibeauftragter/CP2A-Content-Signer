import { useEffect, useRef, useState } from "react";

export default function Dropzone({ file, onFile }: { file: File | null; onFile: (f: File) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [preview, setPreview] = useState<string>();

  useEffect(() => {
    if (!file) return setPreview(undefined);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Upload an image: drop a file here or press Enter to browse"
      onClick={() => input.current?.click()}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files[0];
        if (f) onFile(f);
      }}
      className={`flex min-h-48 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-4 text-center focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
        over ? "border-indigo-500 bg-indigo-50" : "border-slate-300 bg-white"
      }`}
    >
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
      />
      {preview ? (
        <>
          <img src={preview} alt="Preview" className="max-h-56 rounded" />
          <p className="mt-2 text-sm text-slate-600">{file?.name}</p>
        </>
      ) : (
        <p className="text-slate-600">Drag &amp; drop a JPEG, PNG or WebP here, or click to browse</p>
      )}
    </div>
  );
}
