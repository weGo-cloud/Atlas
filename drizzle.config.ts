import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const rawUrl = process.env.DATABASE_URL ?? "file:./db/dev.db";
const dbPath = rawUrl.startsWith("file:") ? rawUrl.slice(5) : rawUrl;

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./src/lib/db/migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: dbPath,
  },
});
