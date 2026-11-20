import "server-only";
import { z } from "zod";

/**
 * Server environment, validated lazily on first use so `next build` does not
 * require production secrets. A missing variable produces a precise error.
 */
const bool = z
  .string()
  .optional()
  .transform((v) => v === "true" || v === "1");

const serverSchema = z
  .object({
    APP_URL: z.string().url(),
    ORGANIZATION_ID: z.string().regex(/^[a-z0-9-]+$/).default("inhub"),
    USE_FIREBASE_EMULATORS: bool,
    FIREBASE_PROJECT_ID: z.string().min(1),
    FIREBASE_CLIENT_EMAIL: z.string().email().optional(),
    FIREBASE_PRIVATE_KEY: z.string().optional(),
    SESSION_MAX_AGE_DAYS: z.coerce.number().int().min(1).max(14).default(5),
    RESEND_API_KEY: z.string().startsWith("re_").optional().or(z.literal("").transform(() => undefined)),
    EMAIL_FROM: z.string().min(3).default("Startup Weekend Workspace <no-reply@startupweekend.sbs>"),
    EMAIL_REPLY_TO: z.string().email().optional().or(z.literal("").transform(() => undefined)),
    RESEND_WEBHOOK_SECRET: z.string().startsWith("whsec_").optional().or(z.literal("").transform(() => undefined)),
    DATA_ENCRYPTION_KEY: z
      .string()
      .refine((v) => Buffer.from(v, "base64").length === 32, "DATA_ENCRYPTION_KEY must be 32 bytes, base64-encoded"),
    CRON_SECRET: z.string().min(24, "CRON_SECRET must be at least 24 characters"),
    INVITATION_TTL_HOURS: z.coerce.number().int().min(1).max(24 * 30).default(168),
  })
  .superRefine((env, ctx) => {
    if (!env.USE_FIREBASE_EMULATORS) {
      if (!env.FIREBASE_CLIENT_EMAIL) ctx.addIssue({ code: "custom", path: ["FIREBASE_CLIENT_EMAIL"], message: "Required outside the emulator" });
      if (!env.FIREBASE_PRIVATE_KEY) ctx.addIssue({ code: "custom", path: ["FIREBASE_PRIVATE_KEY"], message: "Required outside the emulator" });
    }
  });

export type ServerEnv = z.infer<typeof serverSchema>;

export class ConfigurationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Server configuration is incomplete: ${issues.join("; ")}`);
    this.name = "ConfigurationError";
  }
}

let cached: ServerEnv | null = null;

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = serverSchema.safeParse(source);
  if (!result.success) {
    throw new ConfigurationError(result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
  }
  return result.data;
}

export function serverEnv(): ServerEnv {
  if (!cached) cached = parseServerEnv(process.env);
  return cached;
}

export function emailConfigured(env: ServerEnv = serverEnv()): boolean {
  return !!env.RESEND_API_KEY;
}

export function appUrl(path = "/"): string {
  return new URL(path, serverEnv().APP_URL).toString();
}
