import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { neon } from "@neondatabase/serverless";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  const sql = neon(databaseUrl);
  await sql.query("CREATE TABLE IF NOT EXISTS migration_history (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");

  const directory = join(process.cwd(), "migrations");
  const files = (await readdir(directory)).filter((file) => file.endsWith(".sql")).sort();

  for (const file of files) {
    const existing = await sql.query("SELECT 1 FROM migration_history WHERE name = $1", [file]);
    if (existing.length) continue;
    const migration = await readFile(join(directory, file), "utf8");
    const statements = migration.split(";").map((statement) => statement.trim()).filter(Boolean);
    for (const statement of statements) await sql.query(statement);
    await sql.query("INSERT INTO migration_history (name) VALUES ($1)", [file]);
    process.stdout.write(`Applied ${file}\n`);
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
