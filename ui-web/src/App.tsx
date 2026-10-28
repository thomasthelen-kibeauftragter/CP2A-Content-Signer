import { useState } from "react";
import Dropzone from "./Dropzone";
import { Inspection, getApiKey, inspectImage, setApiKey, signImage } from "./api";

const MODELS = ["FLUX.1", "SDXL", "Midjourney", "ComfyUI", "Custom"];

type Status = { kind: "idle" } | { kind: "busy" } | { kind: "error"; msg: string } | { kind: "ok"; msg: string };

function StatusBadge({ s }: { s: Status }) {
  if (s.kind === "idle") return null;
  const style =
    s.kind === "busy" ? "bg-slate-200 text-slate-700" : s.kind === "error" ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800";
  return (
    <p role={s.kind === "error" ? "alert" : "status"} className={`mt-4 rounded px-3 py-2 text-sm ${style}`}>
      {s.kind === "busy" ? "Working…" : s.msg}
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
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const model = preset === "Custom" ? custom.trim() : preset;
  const ready = !!file && !!model && !!creator.trim() && status.kind !== "busy";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setStatus({ kind: "busy" });
    try {
      const blob = await signImage({ file, model, creator: creator.trim(), copyright: copyright.trim(), prompt: prompt.trim() });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = file.name.replace(/(\.[^.]+)?$/, "-signed$1");
      a.click();
      URL.revokeObjectURL(a.href);
      setStatus({ kind: "ok", msg: "Signed. Your download has started." });
    } catch (err) {
      setStatus({ kind: "error", msg: (err as Error).message });
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Dropzone file={file} onFile={setFile} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={euPreset} onChange={(e) => setEuPreset(e.target.checked)} />
        EU AI Act Art. 50 compliant (marks the image as AI-generated: trainedAlgorithmicMedia)
      </label>
      {!euPreset && (
        <p className="text-sm text-amber-700">
          Signing always embeds the AI-generated marker; this toggle is informational.
        </p>
      )}
      <label className="block text-sm">
        Model used
        <select className={field} value={preset} onChange={(e) => setPreset(e.target.value)}>
          {MODELS.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
      </label>
      {preset === "Custom" && (
        <label className="block text-sm">
          Custom model name
          <input className={field} value={custom} onChange={(e) => setCustom(e.target.value)} />
        </label>
      )}
      <label className="block text-sm">
        Creator
        <input className={field} value={creator} onChange={(e) => setCreator(e.target.value)} required />
      </label>
      <label className="block text-sm">
        Copyright statement (optional)
        <input className={field} value={copyright} onChange={(e) => setCopyright(e.target.value)} />
      </label>
      <label className="block text-sm">
        Prompt (optional, will be embedded in the file)
        <textarea className={field} rows={2} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      </label>
      <button
        disabled={!ready}
        className="rounded bg-indigo-600 px-4 py-2 font-medium text-white disabled:opacity-50"
      >
        Sign &amp; download
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

  const m = result?.manifest;
  const active = m?.manifests?.[m?.active_manifest ?? ""];
  const actions = active?.assertions?.find((a: any) => a.label?.startsWith("c2pa.actions"))?.data?.actions ?? [];
  const created = actions.find((a: any) => a.action === "c2pa.created");
  const aiGenerated = created?.digitalSourceType?.endsWith("trainedAlgorithmicMedia");

  return (
    <div className="space-y-4">
      <Dropzone file={file} onFile={pick} />
      <StatusBadge s={status} />
      {m && (
        <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-4 text-sm">
          <p>
            {aiGenerated ? (
              <span className="rounded bg-indigo-100 px-2 py-1 font-medium text-indigo-800">Generated with AI</span>
            ) : (
              <span className="rounded bg-slate-100 px-2 py-1">No AI-generation marker</span>
            )}{" "}
            <span className="ml-2">Validation: {m.validation_state}</span>
          </p>
          {m.validation_status?.map((v, i) => (
            <p key={i} className="text-amber-700">
              {v.code}
              {v.explanation ? `: ${v.explanation}` : ""}
            </p>
          ))}
          <p>Signer: {active?.signature_info?.issuer ?? "unknown"}</p>
          <p>Claim generator: {active?.claim_generator_info?.map((c: any) => c.name).join(", ")}</p>
          <p>Software agent: {created?.softwareAgent?.name ?? created?.softwareAgent ?? "n/a"}</p>
          <details>
            <summary className="cursor-pointer">Raw manifest</summary>
            <pre className="mt-2 max-h-96 overflow-auto rounded bg-slate-900 p-3 text-xs text-slate-100">
              {JSON.stringify(m, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState<"sign" | "verify">("sign");
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold">C2PA AI Media Signer</h1>
      <p className="mb-6 text-slate-600">Embed Content Credentials in AI-generated images (EU AI Act Art. 50).</p>
      <div role="tablist" className="mb-6 flex gap-2 border-b border-slate-200">
        {(["sign", "verify"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 capitalize ${tab === t ? "border-b-2 border-indigo-600 font-medium" : "text-slate-500"}`}
          >
            {t}
          </button>
        ))}
      </div>
      <label className="mb-4 block text-sm text-slate-600">
        API key (only if the server requires one)
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
