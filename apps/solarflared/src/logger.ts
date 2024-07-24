import winston from "winston";
import z from "zod";

const {
  format: { colorize, combine, timestamp, printf },
} = winston;

const format = printf(({ level, message, timestamp }) => {
  return `${timestamp} ${level}: ${message}`;
});

const envSchema = z.object({
  LOG_LEVEL: z.string().default("info"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(parsed.error, "Invalid environment variables.");
  process.exit(1);
}

const env = parsed.data;

export const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  transports: [new winston.transports.Console()],
  format: combine(timestamp(), colorize(), format),
});
