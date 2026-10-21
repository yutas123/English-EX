import { NextResponse } from "next/server";
import { prisma } from "../../../lib/db.js";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await prisma.dictationNote.findMany();
  const items = {};
  for (const r of rows) items[r.id] = r.data;
  return NextResponse.json({ items });
}

// body: { items: { "001-01": { bm, miss, u }, ... } } — 端末側の更新時刻(u)が新しいものだけ上書き
export async function POST(req) {
  const { items } = await req.json().catch(() => ({}));
  if (!items || typeof items !== "object") return NextResponse.json({ error: "bad request" }, { status: 400 });
  const entries = Object.entries(items).filter(([id, v]) => /^\d{3}-\d{2}$/.test(id) && v && typeof v === "object").slice(0, 500);
  const existing = await prisma.dictationNote.findMany({ where: { id: { in: entries.map(([id]) => id) } }, select: { id: true, u: true } });
  const have = new Map(existing.map((r) => [r.id, Number(r.u)]));
  const ops = entries
    .filter(([id, v]) => (Number(v.u) || 0) > (have.get(id) ?? -1))
    .map(([id, v]) => prisma.dictationNote.upsert({ where: { id }, create: { id, data: v, u: BigInt(Number(v.u) || 0) }, update: { data: v, u: BigInt(Number(v.u) || 0) } }));
  await prisma.$transaction(ops);
  return NextResponse.json({ ok: true, saved: ops.length });
}
