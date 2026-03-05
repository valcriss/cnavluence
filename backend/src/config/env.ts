import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

const envCandidates = [path.resolve(process.cwd(), '.env'), path.resolve(process.cwd(), '..', '.env')];
for (const envPath of envCandidates) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    break;
  }
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1),
  APP_URL: z.string().default('http://localhost:5173'),
  API_URL: z.string().default('http://localhost:3000'),
  JWT_ACCESS_SECRET: z.string().min(8),
  JWT_REFRESH_SECRET: z.string().min(8),
  ACCESS_TOKEN_TTL_MIN: z.coerce.number().default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(14),
  REFRESH_COOKIE_NAME: z.string().default('cnav_refresh'),
  REFRESH_COOKIE_PATH: z.string().default('/'),
  REFRESH_COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  REFRESH_COOKIE_SECURE: z.coerce.boolean().default(false),
  OIDC_ENABLED: z.coerce.boolean().default(false),
  OIDC_ISSUER: z.string().optional(),
  OIDC_CLIENT_ID: z.string().optional(),
  OIDC_CLIENT_SECRET: z.string().optional(),
  OIDC_REDIRECT_URI: z.string().optional(),
  OIDC_SCOPE: z.string().default('openid profile email'),
  OIDC_AUTHORIZATION_ENDPOINT: z.string().optional(),
  OIDC_TOKEN_ENDPOINT: z.string().optional(),
  OIDC_USERINFO_ENDPOINT: z.string().optional(),
  OIDC_REQUIRE_EMAIL_VERIFIED: z.coerce.boolean().default(true),
  UPLOAD_STORAGE: z.enum(['local', 's3']).default('local'),
  UPLOAD_LOCAL_PATH: z.string().default('./uploads'),
  SEARCH_PAGE_SIZE: z.coerce.number().default(20),
  VERSION_TIMER_MINUTES: z.coerce.number().default(10),
  VERSION_RETENTION_ALL_DAYS: z.coerce.number().default(30),
  VERSION_RETENTION_DAILY_DAYS: z.coerce.number().default(90),
  VERSION_RETENTION_MAX_DAYS: z.coerce.number().default(3650),
});

export type Env = z.infer<typeof envSchema>;
export const env = envSchema.parse(process.env);
