/** Cor do texto de uma nota 0–100: verde (bom) → normal → vermelho (mau). */
export function scoreClass(v: number | null) {
  if (v === null) return "text-secondary";
  if (v >= 60) return "text-success";
  if (v >= 40) return "text-body";
  return "text-danger";
}

export const STYLE_BADGE: Record<"Growth" | "Value" | "REIT", string> = {
  Growth: "text-bg-success",
  Value: "text-bg-primary",
  REIT: "text-bg-warning",
};
