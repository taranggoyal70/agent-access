import { query } from "@/lib/db";
import { verifyReceipt } from "@/lib/receipts";

export async function GET(_: Request, { params }: { params: Promise<{ receiptId: string }> }) {
  const { receiptId } = await params;
  const rows = await query<{ payload: Record<string, unknown>; signature: string; signature_hash: string }>("SELECT payload, signature, signature_hash FROM receipts WHERE payload->>'receipt_id' = $1", [receiptId]);
  if (!rows[0]) return Response.json({ error: "Receipt not found" }, { status: 404 });
  return Response.json({ ...rows[0], valid: verifyReceipt(rows[0].payload, rows[0].signature) }, { headers: { "Cache-Control": "public, max-age=60" } });
}
