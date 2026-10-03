"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { AnalyzeResponse, AnalyzedSentence, Token } from "@/lib/types";
import { cn } from "@/lib/utils";

const SAMPLES = [
  {
    label: "定语从句 + 被动",
    text: "The book that she bought yesterday was written by a famous novelist.",
  },
  {
    label: "与过去相反",
    text: "If I had known you were coming, I would have baked a cake.",
  },
  {
    label: "完成进行时",
    text: "She has been working on this project since last Monday.",
  },
  {
    label: "there be",
    text: "There are three reasons why the experiment failed.",
  },
];

const CHIP: Record<string, string> = {
  主语: "bg-[#e7eef5] text-[#234e70]",
  谓语: "bg-[#f8e6df] text-[#9c3418]",
  宾语: "bg-[#e5f0e6] text-[#2f6b45]",
  直接宾语: "bg-[#e5f0e6] text-[#2f6b45]",
  间接宾语: "bg-[#e5f2ef] text-[#1f6b5a]",
  表语: "bg-[#f3ead7] text-[#6b4c2a]",
  状语: "bg-[#f3efe8] text-[#5c5148]",
  定语从句: "bg-[#f0e8f4] text-[#5b3a6e]",
  状语从句: "bg-[#f0e8f4] text-[#5b3a6e]",
  形式主语: "bg-[#e7eef5] text-[#234e70]",
  真正主语: "bg-[#e7eef5] text-[#234e70]",
  助动词: "bg-[#f8e6df] text-[#9c3418]",
  疑问词: "bg-[#f3ead7] text-[#6b4c2a]",
  不定式: "bg-[#e5f2ef] text-[#1f6b5a]",
  连词: "bg-[#f3efe8] text-[#5c5148]",
};

const WORD: Record<string, string> = {
  n: "decoration-[#234e70]",
  v: "decoration-[#9c3418]",
  a: "decoration-[#2f6b45]",
  d: "decoration-[#8a5a12]",
  p: "decoration-[#8a7564]",
  c: "decoration-[#5b3a6e]",
  r: "decoration-[#234e70]",
  t: "decoration-[#8a7564]",
  x: "decoration-[#9c3418]",
  w: "decoration-[#8a5a12]",
  m: "decoration-[#2f6b45]",
  i: "decoration-[#1f6b5a]",
  e: "decoration-[#234e70]",
  o: "decoration-[#8a7564]",
};

export function Studio() {
  const [text, setText] = useState(SAMPLES[0].text);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<{ sentence: number; token: number } | null>(null);

  async function analyze(source = text) {
    const value = source.trim();
    if (!value) {
      setError("先贴进一句英文。");
      setResult(null);
      return;
    }
    if (value.length > 2000) {
      setError("一次最多 2000 个字符。");
      return;
    }
    setLoading(true);
    setError(null);
    setSelected(null);
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: value }),
      });
      const data = (await response.json()) as AnalyzeResponse & { error?: string };
      if (!response.ok) {
        setResult(null);
        setError(data.error ?? "解析失败了。换一句试试。");
        return;
      }
      setResult(data);
    } catch {
      setResult(null);
      setError("解析失败了。请检查网络后再试。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12">
        <header className="border-b border-border pb-6">
          <p className="text-xs tracking-[0.22em] text-primary">GRAMMAR</p>
          <h1 className="font-sentence mt-2 text-5xl leading-none text-foreground">析句</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
            把英文拆开：先看谁做了什么，再看时态和从句，最后读中文。
          </p>
        </header>

        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void analyze();
          }}
        >
          <label htmlFor="english" className="text-sm font-medium">
            英文
          </label>
          <Textarea
            id="english"
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                void analyze();
              }
            }}
            rows={5}
            placeholder="The book that she bought yesterday was written by a famous novelist."
            className="font-sentence min-h-36 rounded-xl bg-card px-4 py-3 text-lg leading-relaxed md:text-lg"
          />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">{text.trim().length}/2000 · Ctrl 或 ⌘ + Enter</p>
            <Button type="submit" disabled={loading || text.trim().length > 2000} className="h-11 px-5 text-base sm:w-auto">
              {loading ? "正在解析…" : "解析"}
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {SAMPLES.map((sample) => (
              <Button
                key={sample.label}
                type="button"
                variant="outline"
                className="h-8 bg-card"
                onClick={() => {
                  setText(sample.text);
                  void analyze(sample.text);
                }}
              >
                {sample.label}
              </Button>
            ))}
          </div>
          {error ? (
            <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </form>

        {loading && !result ? <Loading /> : null}
        {result ? <Result result={result} selected={selected} onSelect={setSelected} /> : !loading ? <Empty /> : null}

        <footer className="border-t border-border pt-4 text-xs leading-5 text-muted-foreground">
          句子骨架是按规则估出来的，从句套从句时可能拆不完整。整句翻译来自 MyMemory，词义来自 ECDICT。
        </footer>
      </div>
    </div>
  );
}

function Empty() {
  return (
    <section className="rounded-2xl border border-dashed border-border bg-card/60 px-5 py-8 text-sm leading-6 text-muted-foreground">
      解析结果会显示在这里。可以直接点上面的例子，或贴上你自己的句子。
    </section>
  );
}

function Loading() {
  return (
    <div className="space-y-3" aria-hidden>
      <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
      <div className="h-24 animate-pulse rounded-2xl bg-muted" />
    </div>
  );
}

function Result({
  result,
  selected,
  onSelect,
}: {
  result: AnalyzeResponse;
  selected: { sentence: number; token: number } | null;
  onSelect: (value: { sentence: number; token: number } | null) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      {result.translationError ? <p className="text-sm text-muted-foreground">{result.translationError}</p> : null}
      {result.truncated ? <p className="text-sm text-muted-foreground">句子较多，这里先解析前 12 句。</p> : null}
      {result.sentences.length > 1 && result.translation ? (
        <section className="rounded-2xl border border-border bg-card px-5 py-4">
          <p className="text-xs tracking-wide text-muted-foreground">整段译文</p>
          <p className="mt-2 text-base leading-7">{result.translation}</p>
        </section>
      ) : null}
      {result.sentences.map((sentence, index) => (
        <SentenceCard
          key={`${sentence.text}-${index}`}
          sentence={sentence}
          index={index}
          total={result.sentences.length}
          selected={selected?.sentence === index ? selected.token : null}
          onSelect={(token) => onSelect(token === null ? null : { sentence: index, token })}
        />
      ))}
    </div>
  );
}

function SentenceCard({
  sentence,
  index,
  total,
  selected,
  onSelect,
}: {
  sentence: AnalyzedSentence;
  index: number;
  total: number;
  selected: number | null;
  onSelect: (token: number | null) => void;
}) {
  const token = selected !== null ? sentence.tokens[selected] : null;
  return (
    <article className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="grid lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)]">
        <div className="border-b border-border px-5 py-5 lg:border-r lg:border-b-0">
          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>{total > 1 ? `第 ${index + 1} 句` : "原句"}</span>
            <span className="rounded-full bg-secondary px-2 py-0.5 text-secondary-foreground">{sentence.moodLabel}</span>
          </div>
          <p className="font-sentence mt-3 text-2xl leading-snug text-pretty">
            {sentence.tokens.map((item, tokenIndex) => (
              <span key={`${item.text}-${tokenIndex}`}>
                <button
                  type="button"
                  aria-pressed={selected === tokenIndex}
                  onClick={() => onSelect(selected === tokenIndex ? null : tokenIndex)}
                  className={cn(
                    "rounded-sm underline decoration-2 underline-offset-[7px] hover:bg-accent",
                    WORD[item.pos] ?? WORD.o,
                    selected === tokenIndex && "bg-accent",
                  )}
                >
                  {item.text}
                </button>
                {item.after}
              </span>
            ))}
          </p>
          <div className="mt-4">
            <p className="text-xs tracking-wide text-muted-foreground">译文</p>
            {sentence.translation ? (
              <p className="mt-1 text-base leading-7">{sentence.translation}</p>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">这句没有取到译文。</p>
            )}
          </div>
          {sentence.chunks.length ? (
            <div className="mt-4">
              <p className="text-xs tracking-wide text-muted-foreground">句子骨架</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {sentence.chunks.map((chunk, chunkIndex) => (
                  <span key={`${chunk.label}-${chunkIndex}`} className={cn("rounded-lg px-2.5 py-1.5 text-sm leading-5", CHIP[chunk.label] ?? "bg-muted text-foreground")}>
                    <span className="mr-1.5 text-[10px] tracking-wide opacity-70">{chunk.label}</span>
                    {chunk.text}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          {token ? <WordDetail token={token} /> : <p className="mt-4 text-xs text-muted-foreground">点一个词，看词性、原形和词义。</p>}
        </div>
        <div className="px-5 py-5">
          <p className="text-xs tracking-wide text-muted-foreground">语法</p>
          <ul className="mt-2">
            {sentence.points.map((point) => (
              <li key={point.id} className="border-t border-border py-3 first:border-t-0 first:pt-2">
                <p className="text-sm font-medium text-primary">{point.title}</p>
                <p className="mt-1 text-sm leading-6">{point.detail}</p>
              </li>
            ))}
          </ul>
          {sentence.note ? <p className="mt-2 text-sm text-muted-foreground">{sentence.note}</p> : null}
        </div>
      </div>
    </article>
  );
}

function WordDetail({ token }: { token: Token }) {
  const rows = [
    ["词性", token.posLabel],
    token.lemma.toLowerCase() !== token.text.toLowerCase() ? ["原形", token.lemma] : null,
    token.formLabel ? ["词形", token.formLabel] : null,
    ["释义", token.gloss ?? "词典未收录"],
    token.roleLabel ? ["成分", token.roleLabel] : null,
    token.phonetic ? ["读音", token.phonetic] : null,
  ].filter((row): row is [string, string] => Boolean(row));

  return (
    <dl className="mt-4 grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-xl bg-muted/80 px-3 py-3 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
