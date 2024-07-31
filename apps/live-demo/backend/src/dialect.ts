import { config as loadEnv } from "dotenv";
import { PostgresDialect } from "kysely";
import { Pool } from "pg";
import { z } from "zod";

// Schema for environment variables
const connectionSchema = z.union([
  z
    .object({
      DB_HOST: z.string(),
      DB_PORT: z.number(),
      DB_USER: z.string(),
      DB_PASSWORD: z.string(),
      DB_NAME: z.string(),
    })
    .transform((obj) => ({
      host: obj.DB_HOST,
      port: obj.DB_PORT,
      user: obj.DB_USER,
      password: obj.DB_PASSWORD,
      database: obj.DB_NAME,
    })),
  z
    .object({
      DATABASE_URL: z.string(),
    })
    .transform((obj) => ({
      connectionString: obj.DATABASE_URL,
    })),
]);

export const createDialect = () => {
  // Load the environment from .env
  loadEnv();

  const envSchema = connectionSchema;
  const env = envSchema.parse(process.env);

  return new PostgresDialect({
    pool: new Pool({
      ...env,
      max: 10,
    }),
  });
};
