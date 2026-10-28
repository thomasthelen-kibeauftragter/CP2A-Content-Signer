import { useState } from "react";
import Dropzone from "./Dropzone";
import LabelPicker from "./LabelPicker";
import { DEFAULT_LABEL, LabelOptions } from "./label";
import VerifyPanel from "./VerifyPanel";
import { Inspection, getApiKey, inspectImage, setApiKey, signImage } from "./api";

const MODELS = ["FLUX.1", "SDXL", "Midjourney", "ComfyUI", "Custom"];

type Status = { kind: "idle" } | { kind: "busy" } | { kind: "error"; msg: string } | { kind: "ok"; msg: string };

function StatusBadge({ s }: { s: Status }) {
  if (s.kind === "idle") return null;
  const style =
    s.kind === "busy" ? "bg-slate-200 text-slate-700" : s.kind === "error" ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800";
  return (
    <p role={s.kind === "error" ? "alert" : "status"} className={`mt-4 rounded px-3 py-2 text-sm ${style}`}>
      {s.kind === "busy" ? "Wird verarbeitet…" : s.msg}
    </p>
  );
}

const field = "mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2";

function SignTab() {
  const [file, setFile] = useState<File | null>(null);
  const [euPreset, setEuPreset] = useState(true);
  const [preset, setPreset] = useState(MODELS[0]);
  const [custom, setCustom] = useState("");
  const [creator, setCreator] = useState("");
  const [copyright, setCopyright] = useState("");
  const [prompt, setPrompt] = useState("");
  const [label, setLabel] = useState<LabelOptions>(DEFAULT_LABEL);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const model = preset === "Custom" ? custom.trim() : preset;
  const ready = !!file && !!model && !!creator.trim() && status.kind !== "busy";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setStatus({ kind: "busy" });
    try {
      const blob = await signImage({ file, model, creator: creator.trim(), copyright: copyright.trim(), prompt: prompt.trim(), label });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = file.name.replace(/(\.[^.]+)?$/, "-signed$1");
      a.click();
      URL.revokeObjectURL(a.href);
      setStatus({ kind: "ok", msg: "Signiert. Der Download wurde gestartet." });
    } catch (err) {
      setStatus({ kind: "error", msg: (err as Error).message });
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Dropzone file={file} onFile={setFile} label={label} />
      <LabelPicker value={label} onChange={setLabel} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={euPreset} onChange={(e) => setEuPreset(e.target.checked)} />
        EU AI Act Art. 50 (kennzeichnet das Bild als KI-generiert: trainedAlgorithmicMedia)
      </label>
      {!euPreset && (
        <p className="text-sm text-amber-700">
          Beim Signieren wird die KI-Kennzeichnung immer eingebettet; dieser Schalter ist nur informativ.
        </p>
      )}
      <label className="block text-sm">
        Verwendetes Modell
        <select className={field} value={preset} onChange={(e) => setPreset(e.target.value)}>
          {MODELS.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
      </label>
      {preset === "Custom" && (
        <label className="block text-sm">
          Eigener Modellname
          <input className={field} value={custom} onChange={(e) => setCustom(e.target.value)} />
        </label>
      )}
      <label className="block text-sm">
        Ersteller
        <input className={field} value={creator} onChange={(e) => setCreator(e.target.value)} required />
      </label>
      <label className="block text-sm">
        Copyright-Angabe (optional)
        <input className={field} value={copyright} onChange={(e) => setCopyright(e.target.value)} />
      </label>
      <label className="block text-sm">
        Prompt (optional, wird in die Datei eingebettet)
        <textarea className={field} rows={2} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      </label>
      <button
        disabled={!ready}
        className="rounded bg-indigo-600 px-4 py-2 font-medium text-white disabled:opacity-50"
      >
        Signieren &amp; herunterladen
      </button>
      <StatusBadge s={status} />
    </form>
  );
}

function VerifyTab() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<Inspection | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function pick(f: File) {
    setFile(f);
    setResult(null);
    setStatus({ kind: "busy" });
    try {
      setResult(await inspectImage(f));
      setStatus({ kind: "idle" });
    } catch (err) {
      setStatus({ kind: "error", msg: (err as Error).message });
    }
  }

  return (
    <div className="space-y-4">
      <Dropzone file={file} onFile={pick} />
      <StatusBadge s={status} />
      {result && <VerifyPanel result={result} />}
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState<"sign" | "verify">("sign");
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold">C2PA AI Media Signer</h1>
      <p className="mb-6 text-slate-600">Content Credentials in KI-generierte Bilder einbetten (EU AI Act Art. 50).</p>
      <div role="tablist" className="mb-6 flex gap-2 border-b border-slate-200">
        {(["sign", "verify"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 capitalize ${tab === t ? "border-b-2 border-indigo-600 font-medium" : "text-slate-500"}`}
          >
            {t === "sign" ? "Signieren" : "Prüfen"}
          </button>
        ))}
      </div>
      <label className="mb-4 block text-sm text-slate-600">
        API-Key (nur falls der Server einen verlangt)
        <input
          type="password"
          autoComplete="off"
          defaultValue={getApiKey()}
          onChange={(e) => setApiKey(e.target.value)}
          className={field}
        />
      </label>
      {tab === "sign" ? <SignTab /> : <VerifyTab />}
    </main>
  );
}
