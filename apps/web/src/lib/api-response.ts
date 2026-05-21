/** Read `{ error?: string }` from a failed API response. */
export async function readApiError(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  const message = body?.error?.trim();
  return message !== undefined && message.length > 0 ? message : fallback;
}
