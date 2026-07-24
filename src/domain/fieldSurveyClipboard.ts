export type FieldSurveyClipboard = {
  writeText(value: string): Promise<void>;
};

export type FieldSurveyCopyResult =
  | { ok: true }
  | { ok: false; reason: "empty" | "unavailable" | "failed" };

export async function copyFieldSurveyValue(
  value: string,
  clipboard: FieldSurveyClipboard | null | undefined,
): Promise<FieldSurveyCopyResult> {
  if (value.length === 0) return { ok: false, reason: "empty" };
  if (!clipboard?.writeText) return { ok: false, reason: "unavailable" };

  try {
    await clipboard.writeText(value);
    return { ok: true };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

export function abbreviateFieldSurveyIdentifier(value: string, visibleLength = 28): string {
  if (value.length <= visibleLength) return value;
  const leadingLength = Math.max(8, Math.ceil((visibleLength - 1) / 2));
  const trailingLength = Math.max(6, visibleLength - leadingLength - 1);
  return `${value.slice(0, leadingLength)}…${value.slice(-trailingLength)}`;
}
