export type IconName = "none" | "basic" | "generated" | "modified";
export type Position = "top-left" | "top-center" | "top-right" | "bottom-left" | "bottom-center" | "bottom-right";

export interface LabelOptions {
  icon: IconName;
  position: Position;
  color: "black" | "white";
  opacity: "100" | "50";
  size: "small" | "medium" | "large";
}

export const DEFAULT_LABEL: LabelOptions = {
  icon: "generated",
  position: "bottom-right",
  color: "black",
  opacity: "100",
  size: "medium",
};

export const ICONS: { id: Exclude<IconName, "none">; title: string; hint: string; alt: string }[] = [
  { id: "basic", title: "Basis-Icon", hint: "KI war beteiligt", alt: "Symbol AI: Inhalt wurde mit KI erzeugt oder verändert" },
  { id: "generated", title: "Vollständig KI-generiert", hint: "Komplett von KI erzeugt", alt: "Kennzeichnung: AI generated" },
  { id: "modified", title: "Teilweise KI-verändert", hint: "Echtes Material per KI bearbeitet", alt: "Kennzeichnung: AI modified" },
];

export const POSITIONS: { id: Position; label: string }[] = [
  { id: "top-left", label: "Oben links" },
  { id: "top-center", label: "Oben mittig" },
  { id: "top-right", label: "Oben rechts" },
  { id: "bottom-left", label: "Unten links" },
  { id: "bottom-center", label: "Unten mittig" },
  { id: "bottom-right", label: "Unten rechts" },
];

// Must match core-rust/src/overlay.rs
export const BASE_WIDTH: Record<"basic" | "generated" | "modified", number> = { basic: 0.1, generated: 0.3, modified: 0.3 };
export const SIZE_FACTOR = { small: 0.7, medium: 1, large: 1.4 } as const;
export const MARGIN = 0.025;
