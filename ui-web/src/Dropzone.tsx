import { useEffect, useRef, useState } from "react";
import { BASE_WIDTH, LabelOptions, MARGIN, SIZE_FACTOR } from "./label";

export default function Dropzone({ file, onFile, label }: { file: File | null; onFile: (f: File) => void; label?: LabelOptions }) {
  const [ratio, setRatio] = useState(0.6); // height / width of the previewed image
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
      aria-label="Bild hochladen: Datei hier ablegen oder Enter drücken"
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
          <div className="relative inline-block">
            <img
              src={preview}
              alt="Vorschau"
              className="block max-h-56 rounded"
              onLoad={(e) => setRatio(e.currentTarget.naturalHeight / e.currentTarget.naturalWidth)}
            />
            {label && label.icon !== "none" && <LabelPreview label={label} ratio={ratio} />}
          </div>
          <p className="mt-2 text-sm text-slate-600">{file?.name}</p>
        </>
      ) : (
        <p className="text-slate-600">JPEG, PNG oder WebP hierher ziehen oder klicken</p>
      )}
    </div>
  );
}

function LabelPreview({ label, ratio }: { label: LabelOptions; ratio: number }) {
  const width = BASE_WIDTH[label.icon as keyof typeof BASE_WIDTH] * SIZE_FACTOR[label.size] * 100;
  const m = MARGIN * 100;
  const style: React.CSSProperties = { width: `${width}%`, opacity: Number(label.opacity) / 100, position: "absolute" };
  if (label.position.startsWith("top")) style.top = `${m * ratio}%`;
  else style.bottom = `${m * ratio}%`;
  if (label.position.endsWith("left")) style.left = `${m}%`;
  else if (label.position.endsWith("right")) style.right = `${m}%`;
  else (style.left = "50%"), (style.transform = "translateX(-50%)");
  return (
    <img
      src={`/icons/${label.icon}.png`}
      alt=""
      aria-hidden
      style={{ ...style, filter: label.color === "white" ? "invert(1)" : undefined }}
      className="pointer-events-none"
    />
  );
}
