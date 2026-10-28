import type { Inspection } from "./api";
import { Level, assess } from "./verify";

const STYLE: Record<Level, { box: string; icon: string }> = {
  ok: { box: "border-green-300 bg-green-50 text-green-900", icon: "✓" },
  warn: { box: "border-amber-300 bg-amber-50 text-amber-900", icon: "⚠" },
  fail: { box: "border-red-300 bg-red-50 text-red-900", icon: "✕" },
};

function Row({ level, title, detail }: { level: Level; title: string; detail?: string }) {
  const s = STYLE[level];
  return (
    <div role={level === "fail" ? "alert" : undefined} className={`flex gap-3 rounded-lg border p-3 ${s.box}`}>
      <span aria-hidden className="text-lg leading-6">
        {s.icon}
      </span>
      <div>
        <p className="font-medium">{title}</p>
        {detail && <p className="mt-1 text-sm">{detail}</p>}
      </div>
    </div>
  );
}

export default function VerifyPanel({ result }: { result: Inspection }) {
  const a = assess(result);
  return (
    <div className="space-y-3 text-sm">
      <Row level={a.integrity.level} title={a.integrity.text} detail={a.integrity.detail} />
      <Row level={a.trust.level} title={a.trust.text} detail={a.trust.detail} />

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-1 flex items-center gap-2 font-semibold">
          Herkunftsangaben
          {a.aiGenerated && (
            <span className="rounded bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-800">KI-generiert</span>
          )}
        </h2>
        <p className="mb-3 text-slate-500">
          Selbstauskunft des Signierenden. Die Signatur belegt nicht, dass diese Angaben der Wahrheit entsprechen.
        </p>
        <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1">
          {a.declared.map((d) => (
            <div key={d.label} className="contents">
              <dt className="text-slate-500">{d.label}</dt>
              <dd className="break-words">{d.value}</dd>
            </div>
          ))}
          <dt className="text-slate-500">Zertifikat von</dt>
          <dd>{a.signer ?? "unbekannt"}</dd>
        </dl>
      </section>

      <details>
        <summary className="cursor-pointer text-slate-600">Rohes Manifest</summary>
        <pre className="mt-2 max-h-96 overflow-auto rounded bg-slate-900 p-3 text-xs text-slate-100">
          {JSON.stringify(result.manifest, null, 2)}
        </pre>
      </details>
    </div>
  );
}
