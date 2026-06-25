/**
 * Extract the primary subtag from a BCP-47-ish value, lowercased.
 *
 * `"en-US,en;q=0.9"` → `"en"`, `"uk_UA"` → `"uk"`, empty/nullish → `null`.
 * Genericized: returns whatever primary subtag is present rather than
 * collapsing to a fixed language set — the roster decides relevance downstream.
 */
export function primarySubtag(value: string | undefined | null): string | null {
  if (value === undefined || value === null) return null;
  const first = value.split(",")[0]?.trim().toLowerCase().replace("_", "-");
  if (first === undefined || first.length === 0) return null;
  const subtag = first.split("-")[0];
  return subtag !== undefined && subtag.length > 0 ? subtag : null;
}
