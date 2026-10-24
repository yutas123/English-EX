import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Azure Speech の短命トークン（約10分）を返す。キー本体はブラウザに渡さない。認証は middleware で済んでいる
export async function GET() {
  const key = process.env.AZURE_SPEECH_KEY, region = process.env.AZURE_SPEECH_REGION;
  if (!key || !region || !/^[a-z0-9]+$/.test(region)) return NextResponse.json({ error: "not configured" }, { status: 503 });
  const r = await fetch(`https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`, {
    method: "POST", headers: { "Ocp-Apim-Subscription-Key": key, "content-length": "0" }, cache: "no-store",
  }).catch(() => null);
  if (!r?.ok) return NextResponse.json({ error: "token failed" }, { status: 502 });
  return NextResponse.json({ token: await r.text(), region });
}
