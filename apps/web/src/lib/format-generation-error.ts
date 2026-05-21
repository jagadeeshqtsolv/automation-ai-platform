import { ZodError } from "zod";

export function formatGenerationError(err: unknown): string {
  if (err instanceof ZodError) {
    const details = err.issues
      .slice(0, 5)
      .map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join(".") : "root";
        return `${path}: ${issue.message}`;
      })
      .join("; ");
    return `Generated test plan did not match the expected schema. ${details}`;
  }
  if (err instanceof Error && err.message.trim().length > 0) {
    return err.message;
  }
  return "Generation failed";
}
