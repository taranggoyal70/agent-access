import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

let client: NeonQueryFunction<false, false> | null = null;

export function getDb() {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not configured");
    client = neon(url);
  }
  return client;
}

export async function query<T extends Record<string, unknown>>(text: string, params: unknown[] = []) {
  return getDb().query(text, params) as Promise<T[]>;
}
