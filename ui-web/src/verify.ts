import type { Inspection } from "./api";

export type Level = "ok" | "warn" | "fail";

export interface Assessment {
  integrity: { level: Level; text: string; detail?: string };
  trust: { level: Level; text: string; detail?: string };
  aiGenerated: boolean;
  declared: { label: string; value: string }[];
  signer?: string;
}

const UNTRUSTED = "signingCredential.untrusted";

/** Splits c2pa-rs validation into integrity (hash + signature) and trust (is the CA on a trust list). */
export function assess(insp: Inspection): Assessment {
  const m = insp.manifest;
  const active = m.manifests?.[m.active_manifest ?? ""];
  const codes = (m.validation_status ?? []).map((v) => v.code);
  const broken = codes.filter((c) => c !== UNTRUSTED);
  const untrusted = codes.includes(UNTRUSTED);

  const assertions: any[] = active?.assertions ?? [];
  const byLabel = (prefix: string) => assertions.find((a) => a.label?.startsWith(prefix))?.data;
  const created = (byLabel("c2pa.actions")?.actions ?? []).find((a: any) => a.action === "c2pa.created");
  const work = byLabel("stds.schema-org.CreativeWork");
  const ai = byLabel("org.cp2a.ai_generation");

  const declared: Assessment["declared"] = [];
  const model = created?.softwareAgent?.name ?? (typeof created?.softwareAgent === "string" ? created.softwareAgent : ai?.model);
  if (model) declared.push({ label: "Modell / Tool", value: model });
  const creators = (work?.author ?? []).map((a: any) => a.name).filter(Boolean).join(", ");
  if (creators) declared.push({ label: "Ersteller", value: creators });
  if (work?.copyrightNotice) declared.push({ label: "Copyright", value: work.copyrightNotice });
  if (ai?.prompt) declared.push({ label: "Prompt", value: ai.prompt });

  return {
    integrity: broken.length
      ? { level: "fail", text: "Integrität verletzt", detail: `Das Bild wurde verändert oder die Signatur ist ungültig (${broken.join(", ")}).` }
      : { level: "ok", text: "Integrität in Ordnung", detail: "Das Bild ist unverändert und die Signatur ist mathematisch gültig." },
    trust: untrusted
      ? {
          level: "warn",
          text: broken.length ? "Entwickler-Zertifikat (Untrusted)" : "Signatur intakt (Entwickler-Zertifikat / Untrusted)",
          detail:
            "Das Signaturzertifikat steht auf keiner Vertrauensliste. Für offizielle Prüfer wie contentcredentials.org muss im Produktivbetrieb ein Zertifikat einer anerkannten C2PA-CA hinterlegt werden.",
        }
      : broken.length
        ? { level: "fail", text: "Vertrauen nicht bewertbar" }
        : { level: "ok", text: "Aussteller vertrauenswürdig" },
    aiGenerated: !!created?.digitalSourceType?.endsWith("trainedAlgorithmicMedia"),
    declared,
    signer: active?.signature_info?.issuer,
  };
}
