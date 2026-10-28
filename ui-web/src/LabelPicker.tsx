import { ICONS, LabelOptions, POSITIONS } from "./label";

const seg = (active: boolean) =>
  `rounded border px-3 py-1.5 text-sm ${active ? "border-indigo-600 bg-indigo-50 font-medium" : "border-slate-300 bg-white"}`;

export default function LabelPicker({ value, onChange }: { value: LabelOptions; onChange: (v: LabelOptions) => void }) {
  const set = (p: Partial<LabelOptions>) => onChange({ ...value, ...p });
  return (
    <fieldset className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
      <legend className="px-1 text-sm font-semibold">Sichtbare EU-Kennzeichnung (im Bild)</legend>

      <div role="radiogroup" aria-label="Icon" className="grid gap-2 sm:grid-cols-2">
        {ICONS.map((i) => (
          <button
            type="button"
            role="radio"
            aria-checked={value.icon === i.id}
            key={i.id}
            onClick={() => set({ icon: i.id })}
            className={`flex items-center gap-3 rounded border p-2 text-left ${
              value.icon === i.id ? "border-indigo-600 bg-indigo-50" : "border-slate-300"
            }`}
          >
            <span className="flex h-12 w-28 shrink-0 items-center justify-center rounded bg-slate-100">
              <img src={`/icons/${i.id}.png`} alt={i.alt} className="max-h-10 max-w-24" />
            </span>
            <span className="text-sm">
              <span className="block font-medium">{i.title}</span>
              <span className="text-slate-500">{i.hint}</span>
            </span>
          </button>
        ))}
        <button
          type="button"
          role="radio"
          aria-checked={value.icon === "none"}
          onClick={() => set({ icon: "none" })}
          className={`rounded border p-2 text-left text-sm ${value.icon === "none" ? "border-indigo-600 bg-indigo-50" : "border-slate-300"}`}
        >
          <span className="block font-medium">Kein sichtbares Icon</span>
          <span className="text-slate-500">Nur die maschinenlesbaren Content Credentials</span>
        </button>
      </div>

      {value.icon !== "none" && (
        <>
          <div>
            <p className="mb-1 text-sm">Position</p>
            <div role="radiogroup" aria-label="Position" className="grid max-w-sm grid-cols-3 gap-2">
              {POSITIONS.map((p) => (
                <button
                  type="button"
                  role="radio"
                  aria-checked={value.position === p.id}
                  key={p.id}
                  onClick={() => set({ position: p.id })}
                  className={seg(value.position === p.id)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm">
            <label>
              Größe
              <select className="ml-2 rounded border border-slate-300 bg-white px-2 py-1" value={value.size}
                onChange={(e) => set({ size: e.target.value as LabelOptions["size"] })}>
                <option value="small">Klein</option>
                <option value="medium">Mittel</option>
                <option value="large">Groß</option>
              </select>
            </label>
            <label>
              Farbe
              <select className="ml-2 rounded border border-slate-300 bg-white px-2 py-1" value={value.color}
                onChange={(e) => set({ color: e.target.value as LabelOptions["color"] })}>
                <option value="black">Schwarz</option>
                <option value="white">Weiß</option>
              </select>
            </label>
            <label>
              Deckkraft
              <select className="ml-2 rounded border border-slate-300 bg-white px-2 py-1" value={value.opacity}
                onChange={(e) => set({ opacity: e.target.value as LabelOptions["opacity"] })}>
                <option value="100">100 %</option>
                <option value="50">50 %</option>
              </select>
            </label>
          </div>
        </>
      )}
      <p className="text-xs text-slate-500">
        Offizielle EU-Icons zur Kennzeichnung von KI-Inhalten (frei nutzbar). Ihre Verwendung ist freiwillig und belegt
        für sich keine Rechtskonformität nach Art. 50 AI Act. Das Icon wird fest ins Bild eingebrannt und mitsigniert.
      </p>
    </fieldset>
  );
}
