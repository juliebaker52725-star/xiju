import { readFileSync } from "node:fs";
import path from "node:path";

type Senses = [string, string][];
type LexiconEntry = [string, Senses];

const FORM_LABEL: Record<string, string> = {
  p: "过去式",
  d: "过去分词",
  i: "现在分词",
  "3": "第三人称单数",
  s: "复数",
  r: "比较级",
  t: "最高级",
  pd: "过去式或过去分词",
};

const OVERRIDES: Record<string, Senses> = {
  the: [["t", "定冠词，特指"]],
  a: [["t", "一个，不定冠词"]],
  an: [["t", "一个，用在元音前"]],
  of: [["p", "……的，属于"]],
  to: [["p", "到，向"], ["i", "不定式记号"]],
  in: [["p", "在……里"]],
  on: [["p", "在……上"]],
  at: [["p", "在"]],
  for: [["p", "为了，持续"]],
  with: [["p", "和，带着"]],
  by: [["p", "被，由"]],
  from: [["p", "从"]],
  about: [["p", "关于"]],
  as: [["p", "作为"], ["c", "当，随着"]],
  into: [["p", "进入"]],
  over: [["p", "在……上方"]],
  after: [["p", "在……之后"], ["c", "在……之后"]],
  before: [["p", "在……之前"], ["c", "在……之前"]],
  since: [["p", "自从"], ["c", "自从，既然"]],
  without: [["p", "没有"]],
  between: [["p", "在……之间"]],
  through: [["p", "穿过"]],
  during: [["p", "在……期间"]],
  until: [["p", "直到"]],
  against: [["p", "反对，靠着"]],
  and: [["c", "和，并且"]],
  but: [["c", "但是"]],
  or: [["c", "或者"]],
  if: [["c", "如果，是否"]],
  because: [["c", "因为"]],
  although: [["c", "虽然"]],
  though: [["c", "虽然"]],
  unless: [["c", "除非"]],
  while: [["c", "当……时"]],
  when: [["c", "当……时"], ["w", "什么时候"]],
  where: [["w", "哪里"]],
  why: [["w", "为什么"]],
  how: [["w", "怎样"]],
  who: [["w", "谁"]],
  whom: [["w", "谁（宾格）"]],
  whose: [["w", "谁的"]],
  what: [["w", "什么"]],
  which: [["w", "哪个"]],
  that: [["t", "那个"], ["c", "引导从句"]],
  this: [["t", "这个"]],
  these: [["t", "这些"]],
  those: [["t", "那些"]],
  there: [["e", "存在句引导词"], ["d", "在那里"]],
  not: [["d", "不"]],
  no: [["t", "没有"]],
  nor: [["c", "也不"]],
  so: [["d", "如此"], ["c", "所以"]],
  than: [["c", "比"]],
  too: [["d", "也，太"]],
  very: [["d", "很"]],
  just: [["d", "刚刚，只是"]],
  already: [["d", "已经"]],
  still: [["d", "仍然"]],
  also: [["d", "也"]],
  only: [["d", "只，仅仅"]],
  even: [["d", "甚至"]],
  never: [["d", "从不"]],
  always: [["d", "总是"]],
  often: [["d", "经常"]],
  here: [["d", "这里"]],
  now: [["d", "现在"]],
  then: [["d", "然后"]],
  yesterday: [["d", "昨天"]],
  today: [["d", "今天"]],
  tomorrow: [["d", "明天"]],
  again: [["d", "再"]],
  please: [["d", "请"]],
  i: [["r", "我"]],
  you: [["r", "你，你们"]],
  he: [["r", "他"]],
  she: [["r", "她"]],
  it: [["r", "它"]],
  we: [["r", "我们"]],
  they: [["r", "他们"]],
  me: [["r", "我（宾格）"]],
  him: [["r", "他（宾格）"]],
  her: [["r", "她"], ["t", "她的"]],
  us: [["r", "我们（宾格）"]],
  them: [["r", "他们（宾格）"]],
  my: [["t", "我的"]],
  your: [["t", "你的"]],
  his: [["t", "他的"]],
  its: [["t", "它的"]],
  our: [["t", "我们的"]],
  their: [["t", "他们的"]],
  be: [["v", "是"]],
  am: [["x", "是"]],
  is: [["x", "是"]],
  are: [["x", "是"]],
  was: [["x", "是"]],
  were: [["x", "是"]],
  been: [["x", "是"]],
  being: [["x", "是"]],
  do: [["v", "做"], ["x", "助动词"]],
  does: [["x", "do 的第三人称单数"]],
  did: [["x", "do 的过去式"]],
  "don't": [["x", "不要"]],
  "doesn't": [["x", "不"]],
  "didn't": [["x", "没有"]],
  have: [["v", "有"], ["x", "已经"]],
  has: [["x", "已经"]],
  had: [["x", "有；已经"]],
  will: [["x", "将，愿意"]],
  would: [["x", "将，愿意，虚拟"]],
  can: [["x", "能，可以"]],
  could: [["x", "能，可以"]],
  may: [["x", "可以，可能"]],
  might: [["x", "可能"]],
  must: [["x", "必须"]],
  shall: [["x", "将"]],
  should: [["x", "应该"]],
  cannot: [["x", "不能"]],
};

let lexicon: Record<string, LexiconEntry> | null = null;
let morph: Record<string, [string, string]> | null = null;

function load(): void {
  if (lexicon && morph) return;
  const dir = path.join(process.cwd(), "data");
  lexicon = JSON.parse(readFileSync(path.join(dir, "lexicon.json"), "utf8"));
  morph = JSON.parse(readFileSync(path.join(dir, "morph.json"), "utf8"));
}

const PREFER: Record<string, string[]> = {
  n: ["n", "o"],
  v: ["v", "x", "o"],
  a: ["a", "o"],
  d: ["d", "o"],
  p: ["p", "o"],
  c: ["c", "o"],
  r: ["r", "w", "o"],
  t: ["t", "o"],
  x: ["x", "v", "o"],
  w: ["w", "r", "d", "c", "o"],
  m: ["m", "o"],
  i: ["i", "p", "o"],
  e: ["e", "d", "o"],
  o: ["o", "n", "v"],
};

function pick(senses: Senses | undefined, prefer: string[]): string | null {
  if (!senses?.length) return null;
  for (const pos of prefer) {
    const hit = senses.find((sense) => sense[0] === pos);
    if (hit) return hit[1];
  }
  return senses[0][1];
}

export function morphology(word: string): { lemma: string; form: string | null } {
  load();
  const key = word.toLowerCase();
  const entry = morph?.[key];
  if (!entry || entry[0] === key) return { lemma: key, form: entry?.[1] ?? null };
  return { lemma: entry[0], form: entry[1] ?? null };
}

export function hasSense(word: string, pos: string): boolean {
  load();
  const key = word.toLowerCase();
  const senses = OVERRIDES[key] ?? lexicon?.[key]?.[1];
  return Boolean(senses?.some((sense) => sense[0] === pos));
}

export function describeWord(word: string, pos: string): {
  lemma: string;
  formLabel: string | null;
  gloss: string | null;
  phonetic: string | null;
} {
  load();
  const key = word.toLowerCase();
  const entry = morph?.[key];
  const lemma = entry?.[0] && entry[0] !== key ? entry[0] : key;
  const form = entry?.[1] ?? null;
  const prefer = PREFER[pos] ?? PREFER.o;
  const override = OVERRIDES[key];
  const surface = override ?? lexicon?.[key]?.[1];
  const lemmaSenses = OVERRIDES[lemma] ?? lexicon?.[lemma]?.[1];
  const verbLike =
    pos === "v" || pos === "x" || form === "p" || form === "d" || form === "i" || form === "pd" || form === "3";
  const gloss = override
    ? pick(override, prefer)
    : pos === "a"
      ? pick(surface, prefer) ?? pick(lemmaSenses, ["a", "v", "n", "o"])
      : verbLike && form && lemma !== key
        ? pick(lemmaSenses, prefer) ?? pick(surface, prefer)
        : pick(surface, prefer) ?? pick(lemmaSenses, prefer);
  const phonetic = lexicon?.[key]?.[0] || lexicon?.[lemma]?.[0] || null;
  return {
    lemma,
    formLabel: form ? FORM_LABEL[form] ?? null : null,
    gloss,
    phonetic: phonetic || null,
  };
}
