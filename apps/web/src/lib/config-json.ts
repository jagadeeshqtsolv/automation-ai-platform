/** Normalize legacy/Android field names before persisting environment config. */
function normalizeEnvironmentConfigKeys(obj: Record<string, unknown>): Record<string, unknown> {
  const out = { ...obj };
  const bundleId = out.bundleId;
  const appPackage = out.appPackage;
  if (
    (bundleId === undefined ||
      (typeof bundleId === "string" && bundleId.trim().length === 0)) &&
    typeof appPackage === "string" &&
    appPackage.trim().length > 0
  ) {
    out.bundleId = appPackage.trim();
  }
  return out;
}

export function normalizeConfigJsonString(raw: string | undefined): { ok: true; value: string } | { ok: false; error: string } {
  if (raw === undefined || raw.trim().length === 0) {
    return { ok: true, value: "{}" };
  }
  try {
    const parsed: unknown = JSON.parse(raw.trim().replace(/^\uFEFF/, "")) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, error: "configJson must be a JSON object" };
    }
    const normalized = normalizeEnvironmentConfigKeys(parsed as Record<string, unknown>);
    return { ok: true, value: JSON.stringify(normalized) };
  } catch {
    return { ok: false, error: "configJson must be valid JSON" };
  }
}
