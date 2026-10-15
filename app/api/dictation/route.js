import { NextResponse } from "next/server";
import { prisma } from "../../../lib/db.js";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await prisma.dictationDone.findMany({ select: { id: true } });
  return NextResponse.json({ ids: rows.map((r) => r.id) });
}

// body: { ids: ["001-01", ...] } — 正解済みは増えるだけなので和集合で保存
export async function POST(req) {
  const { ids } = await req.json().catch(() => ({}));
  if (!Array.isArray(ids)) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const valid = ids.filter((id) => typeof id === "string" && /^\d{3}-\d{2}$/.test(id)).slice(0, 2000);
  await prisma.dictationDone.createMany({ data: valid.map((id) => ({ id })), skipDuplicates: true });
  return NextResponse.json({ ok: true, saved: valid.length });
}
