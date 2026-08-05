import { z } from 'zod';

/**
 * Thrown when the environment configuration fails validation.
 * The message lists every field that failed, so failures are actionable.
 */
export class ConfigValidationError extends Error {
  readonly issues: z.core.$ZodIssue[];

  constructor(issues: z.core.$ZodIssue[]) {
    const lines = issues.map((issue) => {
      const path = issue.path.join('.') || '(root)';
      return `  - ${path}: ${issue.message}`;
    });
    super(`Invalid environment configuration:\n${lines.join('\n')}`);
    this.name = 'ConfigValidationError';
    this.issues = issues;
  }
}

/**
 * Validate `source` (defaults to `process.env`) against a zod schema and
 * return the typed, coerced result. Fails fast at startup so a misconfigured
 * service never starts serving traffic.
 */
export function loadConfig<S extends z.ZodTypeAny>(
  schema: S,
  source: Record<string, unknown> = process.env,
): z.infer<S> {
  const result = schema.safeParse(source);
  if (!result.success) {
    throw new ConfigValidationError(result.error.issues);
  }
  return result.data;
}
