export type ApplicationMode = "route-planning" | "field-check";

export function parseApplicationMode(search: string): ApplicationMode {
  const parameters = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return parameters.get("mode") === "field-check" ? "field-check" : "route-planning";
}

