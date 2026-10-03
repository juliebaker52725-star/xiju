import { analyzeText } from "@/lib/analyze";
import { translateSentences } from "@/lib/translate";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let payload: { text?: unknown };
  try {
    payload = (await request.json()) as { text?: unknown };
  } catch {
    return NextResponse.json({ error: "请求格式不对。" }, { status: 400 });
  }

  const text = typeof payload.text === "string" ? payload.text.trim() : "";
  if (!text) return NextResponse.json({ error: "先贴进一句英文。" }, { status: 400 });
  if (text.length > 2000) return NextResponse.json({ error: "一次最多 2000 个字符。" }, { status: 400 });
  if (!/[A-Za-z]/.test(text)) return NextResponse.json({ error: "没有检测到英文。" }, { status: 400 });

  const analysis = analyzeText(text);
  let translations: (string | null)[] = analysis.sentences.map(() => null);
  let translationError: string | null = null;
  try {
    translations = await translateSentences(analysis.sentences.map((sentence) => sentence.text));
    if (translations.every((item) => !item)) translationError = "整句翻译这次没有取到，语法解析不受影响。";
  } catch {
    translationError = "整句翻译这次没有取到，语法解析不受影响。";
  }

  const sentences = analysis.sentences.map((sentence, index) => ({
    ...sentence,
    translation: translations[index] ?? null,
  }));
  const joined = sentences
    .map((sentence) => sentence.translation)
    .filter((item): item is string => Boolean(item))
    .join("");

  return NextResponse.json({
    translation: joined || null,
    translationError,
    truncated: analysis.truncated,
    sentences,
  });
}
