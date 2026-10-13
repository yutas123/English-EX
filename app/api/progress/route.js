import { NextResponse } from "next/server";
import { prisma } from "../../../lib/db.js";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await prisma.progress.findMany();
  const items = {};
  for (const r of rows) items[r.id] = r.data;
  return NextResponse.json({ items });
}

// body: { items: { "A-01": {...}, ... } } — 端末側の更新時刻(u)が新しいものだけ上書き
export async function POST(req) {
  const { items } = await req.json().catch(() => ({}));
  if (!items || typeof items !== "object") return NextResponse.json({ error: "bad request" }, { status: 400 });
  const entries = Object.entries(items).filter(([id, v]) => /^[A-Z]-\d{2}(-[a-z])?$/.test(id) && v && typeof v === "object").slice(0, 500);
  const existing = await prisma.progress.findMany({ where: { id: { in: entries.map(([id]) => id) } }, select: { id: true, u: true } });
  const have = new Map(existing.map((r) => [r.id, Number(r.u)]));
  const ops = entries
    .filter(([id, v]) => (Number(v.u) || 0) > (have.get(id) ?? -1))
    .map(([id, v]) => prisma.progress.upsert({ where: { id }, create: { id, data: v, u: BigInt(Number(v.u) || 0) }, update: { data: v, u: BigInt(Number(v.u) || 0) } }));
  await prisma.$transaction(ops);
  return NextResponse.json({ ok: true, saved: ops.length });
}

export async function DELETE() {
  await prisma.progress.deleteMany();
  return NextResponse.json({ ok: true });
}
