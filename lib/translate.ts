const cache = new Map<string, string>();

function decode(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function hasChinese(text: string): boolean {
  return /[\u3400-\u9fff]/.test(text);
}

export async function translateEnglish(text: string): Promise<string | null> {
  const query = text.trim();
  if (!query) return null;
  const cached = cache.get(query);
  if (cached) return cached;
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(query)}&langpair=en|zh-CN`;
  const response = await fetch(url, { signal: AbortSignal.timeout(8000), cache: "no-store" });
  if (!response.ok) return null;
  const data = (await response.json()) as { responseData?: { translatedText?: string } };
  const translated = data.responseData?.translatedText;
  if (!translated || translated.includes("MYMEMORY WARNING") || translated.includes("INVALID LANGUAGE PAIR")) return null;
  const clean = decode(translated).trim();
  if (!hasChinese(clean)) return null;
  cache.set(query, clean);
  return clean;
}

export async function translateSentences(sentences: string[]): Promise<(string | null)[]> {
  const results: (string | null)[] = new Array(sentences.length).fill(null);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(4, sentences.length) }, async () => {
    while (cursor < sentences.length) {
      const index = cursor;
      cursor += 1;
      try {
        results[index] = await translateEnglish(sentences[index]);
      } catch {
        results[index] = null;
      }
    }
  });
  await Promise.all(workers);
  return results;
}
