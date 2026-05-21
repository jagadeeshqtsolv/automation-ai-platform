export const SELECTED_ORG_STORAGE_KEY = "automationai_selected_org_id";

export function readSelectedOrganizationId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  const value = window.localStorage.getItem(SELECTED_ORG_STORAGE_KEY);
  return value !== null && value.length > 0 ? value : null;
}

export function writeSelectedOrganizationId(organizationId: string): void {
  window.localStorage.setItem(SELECTED_ORG_STORAGE_KEY, organizationId);
}
