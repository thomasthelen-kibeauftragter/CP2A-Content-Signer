export interface SignParams {
  file: File;
  model: string;
  creator: string;
  copyright?: string;
  prompt?: string;
}

async function fail(res: Response): Promise<never> {
  let msg = `${res.status} ${res.statusText}`;
  try {
    msg = (await res.json()).error ?? msg;
  } catch {
    /* keep status text */
  }
  throw new Error(msg);
}

export async function signImage(p: SignParams): Promise<Blob> {
  const fd = new FormData();
  fd.append("image", p.file);
  fd.append("model_name", p.model);
  fd.append("creator", p.creator);
  if (p.copyright) fd.append("copyright", p.copyright);
  if (p.prompt) fd.append("prompt_optional", p.prompt);
  const res = await fetch("/api/v1/sign", { method: "POST", body: fd });
  return res.ok ? res.blob() : fail(res);
}

export interface Inspection {
  manifest: {
    validation_state?: string;
    active_manifest?: string;
    manifests?: Record<string, any>;
    validation_status?: { code: string; explanation?: string }[];
  };
}

export async function inspectImage(file: File): Promise<Inspection> {
  const fd = new FormData();
  fd.append("image", file);
  const res = await fetch("/api/v1/inspect", { method: "POST", body: fd });
  return res.ok ? res.json() : fail(res);
}
