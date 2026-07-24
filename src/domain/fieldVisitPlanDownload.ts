import { fieldVisitPlan, fieldVisitPlanMetadata } from "../data/fieldVisitPlan";
import {
  FIELD_VISIT_PLAN_FILENAME,
  fieldVisitPlanCsv,
} from "./fieldVisitPlan.mjs";

export function buildGeneratedFieldVisitPlanCsv(): string {
  return fieldVisitPlanCsv({
    configuration: fieldVisitPlanMetadata.configuration,
    entries: fieldVisitPlan,
  });
}

export function downloadFieldVisitPlan(): void {
  if (typeof document === "undefined") return;
  const csv = buildGeneratedFieldVisitPlanCsv();
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = FIELD_VISIT_PLAN_FILENAME;
  link.hidden = true;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
