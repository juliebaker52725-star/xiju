import nlp from "compromise";
import { describeWord, hasSense, morphology } from "./lexicon";
import type { Analysis, Chunk, GrammarPoint, Mood, SentenceAnalysis, Token } from "./types";

type Internal = {
  text: string;
  before: string;
  after: string;
  normal: string;
  tags: string[];
  pos: string;
  posLabel: string;
  lemma: string;
  formLabel: string | null;
  gloss: string | null;
  phonetic: string | null;
  morphForm: string | null;
  aux: "do" | "be" | "have" | "modal" | null;
  auxWord: string | null;
  tenseHint: "present" | "past" | null;
  negated: boolean;
};

type Pattern = {
  modal: string | null;
  perfect: boolean;
  progressive: boolean;
  passive: boolean;
  copula: boolean;
  doSupport: boolean;
  imperative: boolean;
  inverted: boolean;
  negated: boolean;
  tense: "present" | "past" | "future" | "modal" | "bare";
  lexical: Internal | null;
  surface: string;
};

type Group = {
  start: number;
  end: number;
  consumeEnd: number;
  indices: number[];
  inverted: boolean;
  subjectStart: number;
  subjectEnd: number;
  pattern: Pattern;
};

type Span = {
  type: "relative" | "adverbial" | "nominal";
  start: number;
  end: number;
  word: string;
};

const MODALS = new Set(["can", "could", "may", "might", "must", "shall", "should", "will", "would", "need", "dare"]);
const BE = new Set(["be", "am", "is", "are", "was", "were", "been", "being"]);
const HAVE = new Set(["have", "has", "had", "having"]);
const DO = new Set(["do", "does", "did", "doing"]);
const WH = new Set(["who", "whom", "whose", "what", "which", "when", "where", "why", "how"]);
const SUBORDINATORS = new Set(["if", "although", "though", "because", "unless", "while", "whereas", "when", "before", "after", "since", "once"]);
const NOMINAL_IF = new Set(["wonder", "ask", "know", "doubt", "decide", "check", "mind", "see", "unsure"]);
const MOTION = new Set(["go", "come", "walk", "run", "drive", "fly", "head", "hurry", "rush", "travel", "return"]);
const PARTICIPLE_ADJECTIVES = new Set([
  "interested", "excited", "bored", "tired", "worried", "surprised", "pleased", "satisfied",
  "disappointed", "embarrassed", "confused", "amazed", "frightened", "scared", "relaxed",
  "annoyed", "thrilled", "delighted", "concerned", "married", "prepared", "supposed",
  "accustomed", "convinced", "determined", "exhausted", "fascinated", "terrified", "puzzled",
  "shocked", "ashamed", "crowded", "used",
]);
const PREDICATE_ADJECTIVES = new Set(["fine", "okay", "ok", "sure", "ready", "glad", "sorry", "afraid", "asleep", "awake", "alive", "alone", "worth", "ill", "well", "content"]);
const DEGREE = new Set(["very", "really", "so", "too", "quite", "rather", "extremely", "fairly"]);

const POS_LABEL: Record<string, string> = {
  n: "名词",
  v: "动词",
  a: "形容词",
  d: "副词",
  p: "介词",
  c: "连词",
  r: "代词",
  t: "限定词",
  x: "助动词",
  m: "数词",
  w: "疑问词",
  i: "不定式记号",
  e: "引导词",
  o: "其他",
};

const CONTRACTIONS: Record<string, { aux: "do" | "be" | "have" | "modal"; word: string; tense: "present" | "past"; label: string }> = {
  "don't": { aux: "do", word: "do", tense: "present", label: "do not" },
  doesnt: { aux: "do", word: "do", tense: "present", label: "does not" },
  "doesn't": { aux: "do", word: "do", tense: "present", label: "does not" },
  "didn't": { aux: "do", word: "do", tense: "past", label: "did not" },
  "can't": { aux: "modal", word: "can", tense: "present", label: "can not" },
  cannot: { aux: "modal", word: "can", tense: "present", label: "can not" },
  "couldn't": { aux: "modal", word: "could", tense: "past", label: "could not" },
  "won't": { aux: "modal", word: "will", tense: "present", label: "will not" },
  "wouldn't": { aux: "modal", word: "would", tense: "past", label: "would not" },
  "shouldn't": { aux: "modal", word: "should", tense: "present", label: "should not" },
  "mustn't": { aux: "modal", word: "must", tense: "present", label: "must not" },
  "isn't": { aux: "be", word: "be", tense: "present", label: "is not" },
  "aren't": { aux: "be", word: "be", tense: "present", label: "are not" },
  "wasn't": { aux: "be", word: "be", tense: "past", label: "was not" },
  "weren't": { aux: "be", word: "be", tense: "past", label: "were not" },
  "hasn't": { aux: "have", word: "have", tense: "present", label: "has not" },
  "haven't": { aux: "have", word: "have", tense: "present", label: "have not" },
  "hadn't": { aux: "have", word: "have", tense: "past", label: "had not" },
};

const MODAL_NOTE: Record<string, string> = {
  can: "can 常表示能力或许可。",
  could: "could 可以表示过去的能力，也可以把语气说得更委婉。",
  may: "may 常表示许可或可能。",
  might: "might 比 may 更不确定，表示可能。",
  must: "must 可以表示必须，也可以表示很有把握的推测。",
  shall: "shall 可以表示将来，语气比较正式。",
  should: "should 常表示应该，或按理说会发生。",
  will: "will 可以表示将来，也可以表示意愿。",
  would: "would 可以表示意愿、过去的习惯，也常用于虚拟。",
};

function quote(text: string): string {
  return `「${text.trim()}」`;
}

const FORM_NAME: Record<string, string> = {
  p: "过去式",
  d: "过去分词",
  i: "现在分词",
  "3": "第三人称单数",
  s: "复数",
  r: "比较级",
  t: "最高级",
  pd: "过去式或过去分词",
};

const CLOSED_FORM: Record<string, string> = {
  am: "现在式",
  is: "现在式",
  are: "现在式",
  was: "过去式",
  were: "过去式",
  been: "过去分词",
  being: "现在分词",
  has: "第三人称单数",
  had: "过去式",
  does: "第三人称单数",
  did: "过去式",
};

function formName(form: string | null, normal: string): string | null {
  return CLOSED_FORM[normal] ?? (form ? FORM_NAME[form] ?? null : null);
}

function posFromTags(tags: string[]): string {
  if (tags.includes("QuestionWord")) return "w";
  if (tags.includes("Preposition")) return "p";
  if (tags.includes("Conjunction")) return "c";
  if (tags.includes("Determiner")) return "t";
  if (tags.includes("Pronoun")) return "r";
  if (tags.includes("Modal")) return "x";
  if (tags.includes("Adjective")) return "a";
  if (tags.includes("Adverb")) return "d";
  if (tags.includes("Verb") || tags.includes("Auxiliary")) return "v";
  if (tags.includes("Value") || tags.includes("Cardinal") || tags.includes("Ordinal")) return "m";
  if (tags.includes("Noun")) return "n";
  if (tags.includes("Date")) return "n";
  if (tags.includes("Expression")) return "o";
  return "o";
}

function tokenize(sentence: string): Internal[] {
  const doc = nlp(sentence);
  const tokens: Internal[] = [];
  for (const sent of doc.json() as { terms?: { text?: string; normal?: string; tags?: string[]; pre?: string; post?: string }[] }[]) {
    for (const term of sent.terms ?? []) {
      if (!term.text) {
        if (tokens.length) {
          tokens[tokens.length - 1].negated = true;
          if (!tokens[tokens.length - 1].after) tokens[tokens.length - 1].after = term.post || " ";
        }
        continue;
      }
      const normal = (term.normal || term.text).toLowerCase();
      const contraction = CONTRACTIONS[normal];
      const morph = morphology(contraction?.word ?? normal);
      const tags = term.tags ?? [];
      tokens.push({
        text: term.text,
        before: term.pre ?? "",
        after: term.post ?? "",
        normal,
        tags,
        pos: posFromTags(tags),
        posLabel: "",
        lemma: contraction?.word ?? morph.lemma,
        gloss: null,
        phonetic: null,
        morphForm: contraction ? null : morph.form,
        formLabel: formName(contraction ? null : morph.form, normal),
        aux: contraction?.aux ?? null,
        auxWord: contraction?.word ?? null,
        tenseHint: contraction?.tense ?? null,
        negated: Boolean(contraction) || tags.includes("Negative"),
      });
    }
  }
  assignPos(tokens);
  for (const token of tokens) token.posLabel = POS_LABEL[token.pos] ?? "其他";
  return tokens;
}

function assignPos(tokens: Internal[]): void {
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const next = tokens[index + 1];
    const previous = tokens[index - 1];
    const word = token.auxWord ?? token.normal;

    if (token.aux === "modal" || MODALS.has(word)) token.pos = "x";
    else if (token.aux === "do" || DO.has(word)) token.pos = "x";
    else if (token.aux === "have" || HAVE.has(word)) token.pos = "x";
    else if (token.aux === "be" || BE.has(word)) token.pos = "x";

    if (token.normal === "not" || token.normal === "n't" || token.normal === "never") token.pos = "d";
    if (["yesterday", "today", "tomorrow", "ago", "here", "now", "then", "already", "still", "just", "also", "only", "even", "always", "often", "never", "please"].includes(token.normal)) {
      token.pos = "d";
    }
    if (token.normal === "more" || token.normal === "less" || token.normal === "most") {
      token.pos = next && (next.pos === "n" || next.tags.includes("Noun")) ? "t" : "d";
    }
    if (WH.has(token.normal)) {
      const nextIsNoun = next && (next.pos === "n" || next.pos === "a" || next.tags.includes("Noun"));
      token.pos = token.normal === "which" && nextIsNoun ? "t" : "w";
    }
    if (token.normal === "that") {
      const ahead = tokens.slice(index + 1, index + 4);
      const nounSoon = ahead.some((item) => item.pos === "n" || item.tags.includes("Noun")) && ahead[0] && ahead[0].pos !== "r" && ahead[0].pos !== "v" && ahead[0].pos !== "x";
      const nextWord = next?.pos;
      token.pos = nextWord === "n" || nextWord === "a" || (nounSoon && next?.pos !== "r" && next?.tags.includes("Noun")) ? "t" : "c";
    }
    if (token.normal === "there") token.pos = next && BE.has(next.normal) ? "e" : "d";
    if (token.normal === "to") token.pos = next && (next.tags.includes("Infinitive") || next.tags.includes("Verb") || next.pos === "v") ? "i" : "p";
    if (token.normal === "her") token.pos = next && (next.pos === "n" || next.tags.includes("Noun")) ? "t" : "r";
    if ((token.normal === "home" || token.normal === "back") && previous && MOTION.has(previous.lemma)) token.pos = "d";
    if (PARTICIPLE_ADJECTIVES.has(token.normal) && previous && BE.has(previous.normal)) token.pos = "a";
    if (SUBORDINATORS.has(token.normal) && token.pos !== "w") {
      if (["if", "although", "though", "because", "unless", "while", "whereas", "once"].includes(token.normal)) token.pos = "c";
    }
  }
}

function isInnerAdverb(token: Internal | undefined): boolean {
  if (!token) return false;
  return token.pos === "d" || token.normal === "not" || token.normal === "never";
}

function isVerbToken(token: Internal | undefined): boolean {
  if (!token) return false;
  if (["a", "n", "t", "p", "c", "r", "d", "w", "m", "i", "e", "o"].includes(token.pos)) return false;
  return token.pos === "v" || token.pos === "x" || Boolean(token.aux) || token.tags.includes("Verb");
}

function isModalToken(token: Internal): boolean {
  return token.aux === "modal" || MODALS.has(token.normal) || MODALS.has(token.auxWord ?? "");
}

function isDoToken(token: Internal): boolean {
  return token.aux === "do" || token.normal === "do" || token.normal === "does" || token.normal === "did";
}

function isHaveToken(token: Internal): boolean {
  return token.aux === "have" || token.normal === "have" || token.normal === "has" || token.normal === "had";
}

function isBeToken(token: Internal): boolean {
  return token.aux === "be" || BE.has(token.normal);
}

function isIng(token: Internal): boolean {
  return token.morphForm === "i" || token.tags.includes("Gerund") || /ing$/.test(token.normal);
}

function isParticipleForm(token: Internal): boolean {
  if (token.normal === "been") return false;
  if (token.morphForm === "d" || token.morphForm === "pd") return true;
  if (token.tags.includes("Participle") || token.tags.includes("Passive")) return true;
  return /ed$/.test(token.normal) && token.tags.includes("PastTense");
}

function isPastFinite(token: Internal): boolean {
  if (token.morphForm === "p" || token.morphForm === "pd") return true;
  if (token.tenseHint === "past") return true;
  return token.tags.includes("PastTense") && token.morphForm !== "d" && token.morphForm !== "i";
}

function isBaseLike(token: Internal): boolean {
  if (isIng(token) || isParticipleForm(token) || isPastFinite(token)) return false;
  return token.pos === "v" || token.pos === "x" || token.tags.includes("Infinitive") || token.tags.includes("Verb");
}

function nextContent(tokens: Internal[], from: number, limit: number): Internal | null {
  for (let index = from; index < Math.min(limit, from + 5); index += 1) {
    if (isInnerAdverb(tokens[index])) continue;
    return tokens[index];
  }
  return null;
}

function verbAhead(tokens: Internal[], from: number, limit: number): boolean {
  const next = nextContent(tokens, from, limit);
  return Boolean(next && isVerbToken(next));
}

type ChainMode = "modal" | "do" | "have" | "be" | "been" | "done";

function initialMode(tokens: Internal[], first: Internal, lookFrom: number, limit: number): ChainMode {
  const next = nextContent(tokens, lookFrom, limit);
  if (isModalToken(first)) return "modal";
  if (isDoToken(first) && next && isBaseLike(next)) return "do";
  if (isHaveToken(first) && next && (next.normal === "been" || isParticipleForm(next))) return "have";
  if (isBeToken(first) && next && isVerbToken(next) && (isIng(next) || (isParticipleForm(next) && !PARTICIPLE_ADJECTIVES.has(next.normal)))) return "be";
  return "done";
}

function readChain(tokens: Internal[], start: number, limit: number, resumeAt?: number): { indices: number[]; verbs: Internal[]; end: number; negated: boolean } | null {
  if (!isVerbToken(tokens[start])) return null;
  const indices: number[] = [];
  const verbs: Internal[] = [];
  let cursor = start;
  let negated = tokens[start].negated;

  const take = () => {
    indices.push(cursor);
    verbs.push(tokens[cursor]);
    if (tokens[cursor].negated) negated = true;
    cursor += 1;
  };
  const skipAdverbs = () => {
    while (cursor < limit && isInnerAdverb(tokens[cursor]) && verbAhead(tokens, cursor + 1, limit)) {
      if (tokens[cursor].normal === "not" || tokens[cursor].normal === "never" || tokens[cursor].negated) negated = true;
      indices.push(cursor);
      cursor += 1;
    }
  };

  take();
  let mode = initialMode(tokens, verbs[0], resumeAt ?? cursor, limit);
  if (resumeAt !== undefined) cursor = resumeAt;

  let guard = 0;
  while (mode !== "done" && cursor < limit && guard < 6) {
    guard += 1;
    skipAdverbs();
    if (cursor >= limit || !isVerbToken(tokens[cursor])) break;
    const token = tokens[cursor];
    if (mode === "modal") {
      if (isHaveToken(token) && nextContent(tokens, cursor + 1, limit) && (nextContent(tokens, cursor + 1, limit)?.normal === "been" || isParticipleForm(nextContent(tokens, cursor + 1, limit)!))) {
        take();
        mode = "have";
        continue;
      }
      if (isBeToken(token)) {
        take();
        mode = "be";
        continue;
      }
      if (isBaseLike(token)) {
        take();
        mode = "done";
        continue;
      }
      break;
    }
    if (mode === "do") {
      if (isBaseLike(token)) {
        take();
        mode = "done";
        continue;
      }
      break;
    }
    if (mode === "have") {
      if (token.normal === "been") {
        take();
        mode = "been";
        continue;
      }
      if (isParticipleForm(token)) {
        take();
        mode = "done";
        continue;
      }
      break;
    }
    if (mode === "be" || mode === "been") {
      if (isIng(token)) {
        take();
        mode = "done";
        continue;
      }
      if (isParticipleForm(token) && !PARTICIPLE_ADJECTIVES.has(token.normal)) {
        take();
        mode = "done";
        continue;
      }
      break;
    }
  }

  return { indices, verbs, end: indices[indices.length - 1] + 1, negated };
}

function chainText(tokens: Internal[], indices: number[]): string {
  if (!indices.length) return "";
  let text = tokens[indices[0]].text;
  for (let index = 1; index < indices.length; index += 1) {
    const previous = indices[index - 1];
    const current = indices[index];
    text += current === previous + 1 ? `${tokens[previous].after}${tokens[current].text}` : ` … ${tokens[current].text}`;
  }
  return text.replace(/\s+/g, " ").trim();
}

function beTense(token: Internal): "present" | "past" | "bare" {
  if (["was", "were"].includes(token.normal) || token.tenseHint === "past") return "past";
  if (token.normal === "be") return "bare";
  return "present";
}

function classify(verbs: Internal[], flags: { inverted: boolean; imperative: boolean; negated: boolean; surface: string }): Pattern {
  const pattern: Pattern = {
    modal: null,
    perfect: false,
    progressive: false,
    passive: false,
    copula: false,
    doSupport: false,
    imperative: flags.imperative,
    inverted: flags.inverted,
    negated: flags.negated || verbs.some((verb) => verb.negated),
    tense: "present",
    lexical: null,
    surface: flags.surface,
  };
  let index = 0;
  if (verbs[index] && isModalToken(verbs[index])) {
    pattern.modal = verbs[index].auxWord ?? verbs[index].normal;
    pattern.tense = pattern.modal === "will" || pattern.modal === "shall" ? "future" : "modal";
    index += 1;
  } else if (verbs[index] && isDoToken(verbs[index]) && verbs.slice(index + 1).some(isBaseLike)) {
    pattern.doSupport = true;
    pattern.tense = verbs[index].normal === "did" || verbs[index].tenseHint === "past" ? "past" : "present";
    index += 1;
  }

  if (verbs[index] && isHaveToken(verbs[index]) && verbs.slice(index + 1).some((verb) => verb.normal === "been" || isParticipleForm(verb))) {
    pattern.perfect = true;
    if (!pattern.modal) pattern.tense = verbs[index].normal === "had" || verbs[index].tenseHint === "past" ? "past" : "present";
    if (pattern.modal === "will" || pattern.modal === "shall") pattern.tense = "future";
    index += 1;
  }
  if (verbs[index]?.normal === "been") index += 1;

  if (verbs[index] && isBeToken(verbs[index])) {
    const next = verbs[index + 1];
    if (next && isIng(next)) {
      pattern.progressive = true;
      pattern.lexical = next;
      if (!pattern.modal && !pattern.perfect) pattern.tense = beTense(verbs[index]) === "past" ? "past" : "present";
      index += 2;
    } else if (next && isParticipleForm(next) && !PARTICIPLE_ADJECTIVES.has(next.normal)) {
      pattern.passive = true;
      pattern.lexical = next;
      if (!pattern.modal && !pattern.perfect) pattern.tense = beTense(verbs[index]) === "past" ? "past" : "present";
      index += 2;
    } else {
      pattern.copula = true;
      pattern.lexical = verbs[index];
      if (!pattern.modal && !pattern.perfect) {
        const tense = beTense(verbs[index]);
        pattern.tense = tense === "past" ? "past" : tense === "bare" ? "modal" : "present";
      }
      index += 1;
    }
  }

  if (verbs[index] && isIng(verbs[index]) && pattern.perfect) {
    pattern.progressive = true;
    pattern.lexical = verbs[index];
  } else if (verbs[index] && isParticipleForm(verbs[index]) && pattern.perfect) {
    pattern.lexical = verbs[index];
    if (verbs.some((verb) => verb.normal === "been")) pattern.passive = true;
  } else if (verbs[index] && !pattern.copula && !pattern.passive && !pattern.progressive) {
    pattern.lexical = verbs[index];
    if (!pattern.modal && !pattern.doSupport && !pattern.perfect) pattern.tense = isPastFinite(verbs[index]) ? "past" : "present";
  }

  if (flags.imperative) pattern.tense = "bare";
  return pattern;
}

function isNPStart(tokens: Internal[], index: number, limit: number): boolean {
  const token = tokens[index];
  if (!token) return false;
  if (token.pos === "t" || token.pos === "r" || token.pos === "n" || token.pos === "m") return true;
  if (token.pos === "a") {
    for (let cursor = index + 1; cursor < Math.min(limit, index + 4); cursor += 1) {
      if (tokens[cursor].pos === "n") return true;
      if (tokens[cursor].pos !== "a" && tokens[cursor].pos !== "d") return false;
    }
  }
  return false;
}

function endOfNP(tokens: Internal[], index: number, limit: number): number {
  const first = tokens[index];
  if (!first) return index;
  if (first.pos === "r") return Math.min(limit, index + 1);
  let cursor = index;
  if (first.pos === "t" || first.pos === "m") cursor += 1;
  while (cursor < limit && (tokens[cursor].pos === "a" || (tokens[cursor].pos === "d" && DEGREE.has(tokens[cursor].normal)))) cursor += 1;
  if (first.pos === "n" && cursor === index) {
    while (cursor < limit && tokens[cursor].pos === "n") cursor += 1;
    return cursor;
  }
  if (tokens[cursor]?.pos === "n") {
    while (cursor < limit && tokens[cursor].pos === "n") cursor += 1;
    return cursor;
  }
  if (first.pos === "m" || first.pos === "n") return Math.min(limit, index + 1);
  return index;
}

function endOfPP(tokens: Internal[], index: number, limit: number): number {
  let cursor = index + 1;
  if (tokens[cursor]?.pos === "p") cursor += 1;
  if (cursor < limit && isNPStart(tokens, cursor, limit)) {
    const end = endOfNP(tokens, cursor, limit);
    if (end > cursor) return end;
  }
  return index + 1;
}

function endOfInfinitive(tokens: Internal[], index: number, limit: number): number {
  let cursor = index + 1;
  while (cursor < limit && tokens[cursor].pos === "d") cursor += 1;
  if (tokens[cursor]?.pos !== "v" && !tokens[cursor]?.tags.includes("Verb")) return index + 1;
  cursor += 1;
  if (cursor < limit && isNPStart(tokens, cursor, limit)) {
    const end = endOfNP(tokens, cursor, limit);
    if (end > cursor) cursor = end;
  }
  if (cursor < limit && tokens[cursor].pos === "p") cursor = endOfPP(tokens, cursor, limit);
  return cursor;
}

function detectInversion(tokens: Internal[]): { aux: number; subjectStart: number; subjectEnd: number } | null {
  if (!tokens.length) return null;
  const aux = tokens[0].pos === "w" ? 1 : 0;
  if (!tokens[aux] || !(isModalToken(tokens[aux]) || isDoToken(tokens[aux]) || isHaveToken(tokens[aux]) || isBeToken(tokens[aux]))) return null;
  const next = tokens[aux + 1];
  if (!next) return null;
  if (isVerbToken(next)) return null;
  if (!["r", "t", "n", "m", "a", "e"].includes(next.pos)) return null;
  if (next.pos === "a" && !isNPStart(tokens, aux + 1, tokens.length)) return null;
  const subjectEnd = endOfNP(tokens, aux + 1, tokens.length);
  if (subjectEnd <= aux + 1) return null;
  return { aux, subjectStart: aux + 1, subjectEnd };
}

function findGroups(tokens: Internal[], inverted: { aux: number; subjectStart: number; subjectEnd: number } | null, imperative: boolean): Group[] {
  const groups: Group[] = [];
  const consumed = new Set<number>();
  if (inverted) {
    const chain = readChain(tokens, inverted.aux, tokens.length, inverted.subjectEnd);
    if (chain) {
      const pattern = classify(chain.verbs, {
        inverted: true,
        imperative: false,
        negated: chain.negated,
        surface: chainText(tokens, chain.indices),
      });
      const last = chain.indices[chain.indices.length - 1];
      groups.push({
        start: inverted.aux,
        end: last + 1,
        consumeEnd: Math.max(last + 1, inverted.subjectEnd),
        indices: chain.indices,
        inverted: true,
        subjectStart: inverted.subjectStart,
        subjectEnd: inverted.subjectEnd,
        pattern,
      });
      chain.indices.forEach((index) => consumed.add(index));
      for (let index = inverted.subjectStart; index < inverted.subjectEnd; index += 1) consumed.add(index);
    }
  }

  for (let index = 0; index < tokens.length; index += 1) {
    if (consumed.has(index) || !isVerbToken(tokens[index])) continue;
    if (tokens[index - 1]?.pos === "i") continue;
    if (isIng(tokens[index]) && !BE.has(tokens[index - 1]?.normal ?? "")) continue;
    const chain = readChain(tokens, index, tokens.length);
    if (!chain) continue;
    const pattern = classify(chain.verbs, {
      inverted: false,
      imperative: imperative && groups.length === 0 && index < 2,
      negated: chain.negated,
      surface: chainText(tokens, chain.indices),
    });
    groups.push({
      start: chain.indices[0],
      end: chain.end,
      consumeEnd: chain.end,
      indices: chain.indices,
      inverted: false,
      subjectStart: -1,
      subjectEnd: -1,
      pattern,
    });
    chain.indices.forEach((item) => consumed.add(item));
    index = chain.end - 1;
  }
  return groups.sort((a, b) => a.start - b.start);
}

function previousNoun(tokens: Internal[], index: number): Internal | null {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const token = tokens[cursor];
    if (token.pos === "n") return token;
    if (token.pos === "a" || token.pos === "t" || token.pos === "m" || token.pos === "d") continue;
    break;
  }
  return null;
}

function nominalThat(tokens: Internal[], index: number): boolean {
  if (tokens[index]?.normal !== "that" || tokens[index].pos === "t") return false;
  let cursor = index - 1;
  while (cursor >= 0 && tokens[cursor].pos === "d") cursor -= 1;
  if (cursor < 0) return false;
  const previous = tokens[cursor];
  if (previous.pos === "v" || previous.pos === "x" || previous.pos === "a") return true;
  return ["fact", "idea", "news", "hope", "belief", "claim", "view", "opinion", "possibility", "chance", "sign", "feeling"].includes(previous.normal);
}

function isRelativizer(tokens: Internal[], index: number, sentence: string): boolean {
  const token = tokens[index];
  if (!token || !["who", "whom", "whose", "which", "that", "where", "when", "why"].includes(token.normal)) return false;
  if (index === 0) return false;
  if (sentence.includes("?") && index < 2) return false;
  if (token.normal === "that" && (token.pos === "t" || nominalThat(tokens, index))) return false;
  return Boolean(previousNoun(tokens, index));
}

function introducesClause(tokens: Internal[], index: number, groups: Group[]): boolean {
  const comma = tokens.findIndex((token, tokenIndex) => tokenIndex > index && token.after.includes(","));
  const limit = comma >= 0 ? comma + 1 : tokens.length;
  return groups.some((group) => group.start > index && group.start < limit);
}

function findSpans(tokens: Internal[], groups: Group[], sentence: string): Span[] {
  const spans: Span[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    if (!isRelativizer(tokens, index, sentence)) continue;
    const group = groups.find((item) => item.start > index);
    if (!group) continue;
    let cursorGroup = group;
    let end = tokens.length;
    for (let guard = 0; guard < 4; guard += 1) {
      const next = groups.find((item) => item.start >= cursorGroup.end);
      if (!next) {
        end = tokens.length;
        break;
      }
      const between = tokens.slice(cursorGroup.end, next.start);
      if (between.some((token) => token.normal === "that" && token.pos !== "t")) {
        cursorGroup = next;
        continue;
      }
      const comma = tokens.findIndex((token, tokenIndex) => tokenIndex >= group.end && tokenIndex < next.start && token.after.includes(","));
      end = comma >= 0 ? comma + 1 : next.start;
      break;
    }
    if (end > index + 1) spans.push({ type: "relative", start: index, end, word: tokens[index].normal });
  }

  for (let index = 0; index < tokens.length; index += 1) {
    const word = tokens[index].normal;
    if (!SUBORDINATORS.has(word)) continue;
    if (word === "if" && NOMINAL_IF.has(tokens[index - 1]?.lemma ?? "")) continue;
    if (["before", "after", "since"].includes(word) && !introducesClause(tokens, index, groups)) continue;
    if (index === 0 && sentence.includes("?") && ["when", "where", "why"].includes(word)) continue;
    let end = tokens.length;
    if (index < 3) {
      const comma = tokens.findIndex((token, tokenIndex) => tokenIndex >= index && token.after.includes(","));
      if (comma >= 0) end = comma + 1;
    }
    if (!spans.some((span) => index >= span.start && index < span.end)) {
      spans.push({ type: "adverbial", start: index, end, word });
    }
  }
  return spans.sort((a, b) => a.start - b.start);
}

function surface(tokens: Internal[], start: number, end: number): string {
  let text = "";
  for (let index = start; index < end; index += 1) {
    text += tokens[index].text;
    if (index < end - 1) text += tokens[index].after;
  }
  return text.replace(/\s+/g, " ").trim();
}

function findImperative(tokens: Internal[], sentence: string): boolean {
  if (sentence.includes("?")) return false;
  const start = tokens.findIndex((token) => token.normal !== "please" && token.pos !== "d");
  if (start < 0 || start > 1) return false;
  if (tokens.slice(0, start).some((token) => token.pos === "r" || token.pos === "n")) return false;
  const token = tokens[start];
  if (token.negated && (token.aux === "do" || token.normal === "do")) return true;
  if (token.tags.includes("Imperative")) return true;
  if (token.pos === "v" && !isPastFinite(token) && !tokens.slice(0, start).some((item) => item.pos === "r")) return true;
  return false;
}

function buildChunks(tokens: Internal[], groups: Group[], spans: Span[], matrix: Group | null, inversion: { aux: number; subjectStart: number; subjectEnd: number } | null): Chunk[] {
  const chunks: Chunk[] = [];
  const push = (role: string, label: string, start: number, end: number) => {
    if (end <= start) return;
    const text = surface(tokens, start, end);
    if (!text) return;
    chunks.push({ role, label, text, start, end });
  };

  let index = 0;
  while (index < tokens.length) {
    const span = spans.find((item) => item.start === index);
    if (span) {
      const label = span.type === "relative" ? "定语从句" : span.type === "adverbial" ? "状语从句" : "从句";
      push(span.type === "relative" ? "clause" : "adverbialClause", label, span.start, span.end);
      index = span.end;
      continue;
    }
    if (matrix?.inverted && inversion && index === (tokens[0].pos === "w" ? 0 : inversion.aux)) {
      if (tokens[0].pos === "w" && inversion.aux > 0) push("wh", "疑问词", 0, 1);
      const verbAfter = matrix.indices.filter((item) => item >= inversion.subjectEnd);
      if (!verbAfter.length) push("predicate", "谓语", inversion.aux, inversion.aux + 1);
      else push("auxiliary", "助动词", inversion.aux, inversion.aux + 1);
      push("subject", "主语", inversion.subjectStart, inversion.subjectEnd);
      if (verbAfter.length) push("predicate", "谓语", verbAfter[0], matrix.end);
      index = matrix.consumeEnd;
      continue;
    }
    const group = groups.find((item) => item.indices[0] === index);
    if (group && !group.inverted) {
      push("predicate", "谓语", group.indices[0], group.indices[group.indices.length - 1] + 1);
      index = group.end;
      continue;
    }
    if (tokens[index].pos === "e") {
      push("formSubject", "形式主语", index, index + 1);
      index += 1;
      continue;
    }
    if (tokens[index].pos === "i") {
      const end = endOfInfinitive(tokens, index, tokens.length);
      push("infinitive", "不定式", index, end);
      index = Math.max(end, index + 1);
      continue;
    }
    if (tokens[index].pos === "p") {
      const end = endOfPP(tokens, index, tokens.length);
      push("adverbial", "状语", index, end);
      index = Math.max(end, index + 1);
      continue;
    }
    if (isNPStart(tokens, index, tokens.length)) {
      const end = endOfNP(tokens, index, tokens.length);
      if (end > index) {
        push("noun", "名词短语", index, end);
        index = end;
        continue;
      }
    }
    if (tokens[index].pos === "w") {
      push("wh", "疑问词", index, index + 1);
      index += 1;
      continue;
    }
    if (tokens[index].pos === "d") {
      push("adverbial", "状语", index, index + 1);
      index += 1;
      continue;
    }
    if (tokens[index].pos === "c") {
      push("connective", "连词", index, index + 1);
      index += 1;
      continue;
    }
    if (tokens[index].pos === "a") {
      push("complement", "表语", index, index + 1);
      index += 1;
      continue;
    }
    push("other", "其他", index, index + 1);
    index += 1;
  }
  return refineChunks(chunks, tokens, matrix);
}

function refineChunks(chunks: Chunk[], tokens: Internal[], matrix: Group | null): Chunk[] {
  const existential = tokens[0]?.pos === "e" && matrix && isBeToken(tokens[matrix.indices[0]]);
  const predicates = chunks
    .map((chunk, index) => (chunk.label === "谓语" ? index : -1))
    .filter((index) => index >= 0);
  if (existential) {
    const predicate = predicates[0] ?? -1;
    const noun = chunks.find((chunk, index) => index > predicate && chunk.label === "名词短语");
    if (noun) {
      noun.role = "realSubject";
      noun.label = "真正主语";
    }
  }

  const assignClause = (from: number, to: number, predicateIndex: number) => {
    if (predicateIndex < 0) return;
    for (let index = predicateIndex - 1; index >= from; index -= 1) {
      const chunk = chunks[index];
      if (chunk.label === "定语从句" || chunk.label === "状语从句" || chunk.label === "状语" || chunk.label === "连词" || chunk.label === "疑问词") continue;
      if (chunk.label === "名词短语" || chunk.label === "形式主语") {
        if (!existential || chunk.label !== "形式主语") {
          chunk.role = "subject";
          chunk.label = "主语";
        }
        break;
      }
      break;
    }
    const nouns: Chunk[] = [];
    for (let index = predicateIndex + 1; index < to; index += 1) {
      const chunk = chunks[index];
      if (chunk.label === "连词") break;
      if (chunk.label === "名词短语") nouns.push(chunk);
    }
    const copula = Boolean(matrix && chunks[predicateIndex].start === matrix.start && matrix.pattern.copula && !matrix.pattern.passive);
    if (nouns.length >= 2 && !copula) {
      nouns[0].role = "iobject";
      nouns[0].label = "间接宾语";
      nouns[1].role = "object";
      nouns[1].label = "直接宾语";
    } else if (nouns[0]) {
      nouns[0].role = copula ? "complement" : "object";
      nouns[0].label = copula ? "表语" : "宾语";
    }
  };

  if (!existential && predicates.length) {
    let from = 0;
    predicates.forEach((predicate, offset) => {
      const nextLink = chunks.findIndex((chunk, index) => index > predicate && chunk.label === "连词" && ["but", "and", "or", "But", "And", "Or"].includes(chunk.text));
      const to = nextLink >= 0 ? nextLink : chunks.length;
      assignClause(from, offset === 0 ? to : chunks.length, predicate);
      from = nextLink >= 0 ? nextLink + 1 : chunks.length;
    });
  }

  if (tokens[0]?.normal === "it" && matrix?.pattern.copula) {
    const infinitive = chunks.find((chunk) => chunk.role === "infinitive");
    const complement = chunks.find((chunk) => chunk.label === "表语");
    const subject = chunks.find((chunk) => chunk.label === "主语" && chunk.text.toLowerCase() === "it");
    if (infinitive && complement && subject) {
      subject.role = "formSubject";
      subject.label = "形式主语";
      infinitive.role = "realSubject";
      infinitive.label = "真正主语";
    }
  }

  if (!matrix?.inverted) {
    const first = chunks[0];
    const second = chunks[1];
    if (first?.label === "疑问词" && second?.label === "谓语") {
      first.role = "subject";
      first.label = "主语";
    }
  }
  return chunks;
}

function tenseLabel(pattern: Pattern): string {
  if (pattern.perfect && pattern.progressive) return pattern.tense === "past" ? "过去完成进行时" : "现在完成进行时";
  if (pattern.perfect && pattern.passive) return pattern.tense === "past" ? "过去完成时的被动" : pattern.tense === "future" ? "将来完成时的被动" : "现在完成时的被动";
  if (pattern.perfect) return pattern.tense === "past" ? "过去完成时" : pattern.tense === "future" ? "将来完成时" : "现在完成时";
  if (pattern.progressive) return pattern.tense === "past" ? "过去进行时" : pattern.tense === "future" ? "将来进行时" : "现在进行时";
  if (pattern.passive) return pattern.tense === "past" ? "一般过去时的被动" : pattern.tense === "future" ? "一般将来时的被动" : "一般现在时的被动";
  if (pattern.tense === "past") return "一般过去时";
  if (pattern.tense === "future") return "一般将来时";
  return "一般现在时";
}

function patternPoint(pattern: Pattern, tokens: Internal[]): GrammarPoint {
  const shown = quote(pattern.surface);
  const lexical = pattern.lexical;
  const lemmaNote = lexical && lexical.lemma !== lexical.normal
    ? `${quote(lexical.text)} 是 ${lexical.lemma} 的${lexical.formLabel ?? "变化形式"}。`
    : "";
  if (pattern.imperative) {
    return {
      id: "imperative",
      title: pattern.negated ? "否定祈使句" : "祈使句",
      detail: pattern.negated
        ? `${shown} 是祈使句的否定式。Don't 是 do not，后面仍然用动词原形。主语 you 被省掉了，句子用来要求对方不要做这件事。`
        : `${shown} 是祈使句。主语 you 被省掉，动词用原形，用来提出要求或建议。`,
    };
  }
  if (pattern.passive) {
    const by = tokens.findIndex((token) => token.normal === "by");
    const agent = by >= 0 ? surface(tokens, by, endOfPP(tokens, by, tokens.length)) : "";
    return {
      id: "passive",
      title: tenseLabel(pattern),
      detail: `${shown} 是被动语态：be 的相应形式加上过去分词。主语是动作的承受者。${lemmaNote}${agent ? ` ${quote(agent)} 引出动作的发出者。` : ""}`.trim(),
    };
  }
  if (pattern.doSupport) {
    const wh = tokens[0]?.pos === "w" ? tokens[0] : null;
    const aux = pattern.surface.split("…")[0]?.trim() || "do";
    const verb = lexical ? quote(lexical.text) : "动词原形";
    let detail = pattern.inverted
      ? `实义动词构成疑问句时要借助 do。${quote(aux)} 负责${pattern.tense === "past" ? "过去" : "现在"}时态，${verb} 用原形，主语放在助动词和实义动词之间。`
      : `否定实义动词时要借助 do。${shown} 里，时态落在 do 上，后面的动词用原形。`;
    if (wh && ["what", "whom", "which", "who"].includes(wh.normal)) detail += ` ${quote(wh.text)} 提到了句首，在这里充当宾语。`;
    if (wh && ["where", "when", "why", "how"].includes(wh.normal)) detail += ` ${quote(wh.text)} 提到了句首，问的是状语。`;
    if (pattern.negated && !pattern.inverted) detail += " not 否定的是后面的动作。";
    return { id: "do-support", title: pattern.inverted ? "借助 do 的疑问句" : "借助 do 的否定", detail };
  }
  if (pattern.modal && pattern.perfect) {
    return {
      id: "modal-perfect",
      title: "情态动词的完成式",
      detail: `${shown} 的结构是 ${pattern.modal} have + 过去分词。它常用来谈过去：可能发生过、本可以发生，或与过去事实相反。${lemmaNote}`.trim(),
    };
  }
  if (pattern.perfect && pattern.progressive) {
    return {
      id: pattern.tense === "past" ? "tense-past-perfect-progressive" : "tense-present-perfect-progressive",
      title: tenseLabel(pattern),
      detail: `${shown} 由 have 的形式 + been + 现在分词构成。动作从更早的时候一直持续到${pattern.tense === "past" ? "过去那个时刻" : "现在"}，而且当时多半还没停。${lemmaNote}`.trim(),
    };
  }
  if (pattern.perfect) {
    return {
      id: pattern.tense === "past" ? "tense-past-perfect" : pattern.tense === "future" ? "tense-future-perfect" : "tense-present-perfect",
      title: tenseLabel(pattern),
      detail: `${shown} 是${tenseLabel(pattern)}：have 的形式加上过去分词。${pattern.tense === "past" ? "表示在过去某个时间之前已经完成。" : pattern.tense === "future" ? "表示在将来某个时间之前会完成。" : "它把过去的动作和现在联系起来，并不强调具体发生在哪一个过去的时间点。"}${lemmaNote}`.trim(),
    };
  }
  if (pattern.progressive) {
    return {
      id: pattern.tense === "past" ? "tense-past-progressive" : "tense-present-progressive",
      title: tenseLabel(pattern),
      detail: `${shown} 是${tenseLabel(pattern)}：be 加上动词的现在分词，表示那段时间里动作正在进行。${lemmaNote}`.trim(),
    };
  }
  if (pattern.modal) {
    const id = pattern.tense === "future" ? "tense-simple-future" : "modal";
    const meaning = MODAL_NOTE[pattern.modal] ?? "";
    return {
      id,
      title: pattern.tense === "future" ? "一般将来时" : "情态动词",
      detail: `${shown} 里，情态动词 ${pattern.modal} 后面用动词原形。${meaning}`.trim(),
    };
  }
  if (pattern.copula) {
    const be = pattern.lexical?.text ?? "be";
    const when = pattern.tense === "past" ? "过去式" : "现在式";
    let detail = `${quote(be)} 是系动词 be 的${when}，用来连接主语和后面的表语，本身几乎没有动作意思。`;
    if (pattern.inverted) detail += " 这是疑问句，所以系动词放到了主语前面。";
    return { id: "copula", title: "系动词", detail };
  }
  if (pattern.tense === "past") {
    return {
      id: "tense-simple-past",
      title: "一般过去时",
      detail: `${shown} 是一般过去时，表示动作发生在过去。${lemmaNote}`.trim(),
    };
  }
  const third = lexical?.morphForm === "3";
  return {
    id: "tense-simple-present",
    title: "一般现在时",
    detail: `${shown} 是一般现在时。${third ? "主语是第三人称单数，所以动词用了单数形式。" : "可以表示现在的状态、习惯或一般事实。"}`.trim(),
  };
}

function relativePoint(tokens: Internal[], span: Span, groups: Group[]): GrammarPoint | null {
  const group = groups.find((item) => item.start > span.start && item.start < span.end);
  if (!group) return null;
  const antecedent = previousNoun(tokens, span.start);
  const relativizer = tokens[span.start];
  const beforeVerb = tokens.slice(span.start + 1, group.start);
  const hasSubject = beforeVerb.some((token) => token.pos === "r" || token.pos === "n" || token.pos === "t");
  const afterVerb = tokens.slice(group.end, span.end);
  const hasObject = afterVerb.some((token) => token.pos === "n" || token.pos === "r" || token.pos === "t");
  const head = antecedent ? `它修饰名词 ${quote(antecedent.text)}。` : "";
  let role = "";
  if (["why", "where", "when"].includes(relativizer.normal)) {
    role = `${quote(relativizer.text)} 是关系副词，在从句里作状语。`;
  } else if (!hasSubject) {
    role = `${quote(relativizer.text)} 在从句里作主语，所以后面直接接谓语 ${quote(group.pattern.surface)}。`;
  } else if (!hasObject) {
    const subject = beforeVerb.filter((token) => token.pos === "r" || token.pos === "n").map((token) => token.text).join(" ");
    role = `${quote(relativizer.text)} 在从句里作宾语。从句自己的主语是 ${quote(subject || beforeVerb.map((token) => token.text).join(" "))}，谓语是 ${quote(group.pattern.surface)}，宾语的位置空着。`;
  } else {
    role = `${quote(relativizer.text)} 引出这个从句，从句谓语是 ${quote(group.pattern.surface)}。`;
  }
  return {
    id: "relative",
    title: "定语从句",
    detail: `${head}${role}`.trim(),
  };
}

function adverbialPoint(tokens: Internal[], span: Span, groups: Group[]): GrammarPoint | null {
  const names: Record<string, [string, string, string]> = {
    because: ["adverbial-reason", "原因状语从句", "because 表示原因。"],
    although: ["adverbial-concession", "让步状语从句", "although 表示「虽然」。这种从句后面的主句不再用 but。"],
    though: ["adverbial-concession", "让步状语从句", "though 表示「虽然」。"],
    unless: ["adverbial-condition", "条件状语从句", "unless 表示「除非」，意思接近 if not。"],
    while: ["adverbial-time", "时间状语从句", "while 表示「在……期间」，有时也用来对比。"],
    when: ["adverbial-time", "时间状语从句", "when 表示「当……的时候」。"],
    before: ["adverbial-time", "时间状语从句", "before 表示「在……之前」。"],
    after: ["adverbial-time", "时间状语从句", "after 表示「在……之后」。"],
    since: ["adverbial-time", "时间状语从句", "since 在这里引出一个从句，表示「自从……」。"],
    once: ["adverbial-time", "时间状语从句", "once 表示「一旦」。"],
    whereas: ["adverbial-concession", "对比状语从句", "whereas 用来对比两件事。"],
  };
  const info = names[span.word];
  if (!info) return null;
  const group = groups.find((item) => item.start > span.start && item.start < span.end);
  const verb = group ? `从句谓语是 ${quote(group.pattern.surface)}。` : "";
  return {
    id: info[0],
    title: info[1],
    detail: `${info[2]}从句是 ${quote(surface(tokens, span.start, span.end))}。${verb}`.trim(),
  };
}

function conditionalPoint(tokens: Internal[], span: Span, groups: Group[], matrix: Group): GrammarPoint | null {
  if (span.word !== "if") return null;
  const inside = groups.filter((group) => group.start > span.start && group.start < span.end);
  const first = inside[0];
  if (!first) return null;
  const main = matrix.pattern;
  const sub = first.pattern;
  const subText = quote(sub.surface);
  const mainText = quote(main.surface);
  const extra = inside[1] && first.pattern.lexical?.lemma === "know"
    ? ` ${quote(first.pattern.lexical.text)} 后面还带了从句 ${quote(surface(tokens, first.end, span.end))}，作它的宾语。`
    : "";
  if (sub.perfect && sub.tense === "past" && main.modal === "would" && main.perfect) {
    return {
      id: "conditional-3",
      title: "与过去事实相反",
      detail: `这是第三条件句。if 从句用 had + 过去分词（${subText}），主句用 would have + 过去分词（${mainText}）。说的是过去没有发生的假设。${extra}`.trim(),
    };
  }
  if (sub.tense === "past" && !sub.perfect && ["would", "could", "might"].includes(main.modal ?? "") && !main.perfect) {
    return {
      id: "conditional-2",
      title: "与现在事实相反",
      detail: `这是第二条件句。if 从句用过去式（${subText}），主句用 ${main.modal} + 动词原形（${mainText}）。说的是现在并不真实的假设。`,
    };
  }
  if (sub.tense === "present" && !sub.modal && main.modal === "will") {
    return {
      id: "conditional-1",
      title: "真实条件",
      detail: `这是第一条件句。if 从句用一般现在时（${subText}）表示将来的条件，主句用 will（${mainText}）。`,
    };
  }
  if (sub.tense === "present" && main.tense === "present" && !main.modal && !sub.modal) {
    return {
      id: "conditional-0",
      title: "零条件句",
      detail: `if 的两边都是一般现在时：从句 ${subText}，主句 ${mainText}。说的是规律，只要条件成立，结果就会发生。`,
    };
  }
  return {
    id: "conditional-mixed",
    title: "条件从句",
    detail: `if 引出条件。从句谓语是 ${subText}，主句谓语是 ${mainText}。`,
  };
}

function buildPoints(sentence: string, tokens: Internal[], groups: Group[], spans: Span[], matrix: Group | null, mood: Mood): GrammarPoint[] {
  const points: GrammarPoint[] = [];
  if (!matrix) {
    points.push({ id: "fragment", title: "不成句", detail: "这里没有找到明确的谓语，可能是一个片段、标题，或单独的短语。" });
    return points;
  }
  const existential = tokens[0]?.pos === "e" && isBeToken(tokens[matrix.indices[0]]);
  if (existential) {
    const real = tokens.slice(matrix.end).find((token) => token.pos === "n");
    points.push({
      id: "existential",
      title: "there be 存在句",
      detail: `there 在这里不是「在那里」。there be 用来表示「有」。真正的主语是后面的名词${real ? quote(real.text) : ""}，be 要和这个主语保持一致。`,
    });
  } else {
    points.push(patternPoint(matrix.pattern, tokens));
  }

  if (mood === "interrogative" && !matrix.pattern.doSupport && !matrix.pattern.inverted && tokens[0]?.pos === "w") {
    points.push({
      id: "question-subject",
      title: "疑问词作主语",
      detail: `${quote(tokens[0].text)} 本身就是主语，所以语序和陈述句一样，不需要再借助 do。`,
    });
  }

  const adverbial = spans.find((span) => span.type === "adverbial");
  if (adverbial?.word === "if") {
    const conditional = conditionalPoint(tokens, adverbial, groups, matrix);
    if (conditional) points.push(conditional);
  } else if (adverbial) {
    const point = adverbialPoint(tokens, adverbial, groups);
    if (point) points.push(point);
  }

  for (const span of spans.filter((item) => item.type === "relative")) {
    const point = relativePoint(tokens, span, groups);
    if (point) points.push(point);
  }

  if (tokens[0]?.normal === "it" && matrix.pattern.copula && tokens.some((token) => token.pos === "i")) {
    const infinitive = surface(tokens, tokens.findIndex((token) => token.pos === "i"), tokens.length);
    points.push({
      id: "dummy-it",
      title: "形式主语 it",
      detail: `句首的 it 没有具体所指，是形式主语。真正的主语是后面的不定式 ${quote(infinitive)}。这样安排是为了避免主语太长。`,
    });
  } else if (tokens.some((token) => token.pos === "i")) {
    const at = tokens.findIndex((token) => token.pos === "i");
    points.push({
      id: "infinitive",
      title: "不定式",
      detail: `${quote(surface(tokens, at, endOfInfinitive(tokens, at, tokens.length)))} 是不定式。这里的 to 不是介词「到」，后面接动词原形。`,
    });
  }

  if (matrix.pattern.copula) {
    const complement = tokens[matrix.end];
    if (complement && PARTICIPLE_ADJECTIVES.has(complement.normal)) {
      points.push({
        id: "predicative-participle",
        title: "分词形容词作表语",
        detail: `${quote(complement.text)} 虽然是过去分词的形状，这里却是形容词，放在系动词后面描述主语的感受或状态，不是被动语态。`,
      });
    }
  }

  if ((matrix.pattern.perfect || matrix.pattern.progressive) && tokens.some((token) => token.normal === "since" || token.normal === "for")) {
    const since = tokens.findIndex((token) => token.normal === "since");
    const duration = tokens.findIndex((token) => token.normal === "for");
    const bits: string[] = [];
    if (since >= 0 && !spans.some((span) => span.start === since && span.type === "adverbial")) {
      bits.push(`${quote(surface(tokens, since, endOfPP(tokens, since, tokens.length)))} 表示时间的起点，意思是「自从……」。`);
    }
    if (duration >= 0) bits.push(`${quote(surface(tokens, duration, endOfPP(tokens, duration, tokens.length)))} 表示持续了多久。`);
    if (bits.length) {
      points.push({
        id: "since-for",
        title: "since / for",
        detail: `${bits.join("")}完成体经常和 since（起点）或 for（时长）一起用。`,
      });
    }
  }

  if (matrix.pattern.negated && !matrix.pattern.imperative && !matrix.pattern.doSupport) {
    points.push({ id: "negation", title: "否定", detail: "句中的 not 或 n't 否定谓语。它通常贴在第一个助动词或系动词后面。" });
  }

  const top = groups.filter((group) => !spans.some((span) => group.start >= span.start && group.start < span.end));
  if (top.length >= 2) {
    const between = tokens.slice(top[0].consumeEnd, top[1].start);
    const conjunction = between.find((token) => ["and", "but", "or", "nor", "yet"].includes(token.normal));
    if (conjunction) {
      points.push({
        id: "coordination",
        title: "并列分句",
        detail: `${quote(conjunction.text)} 连接两个分句，前后各有自己的谓语：${quote(top[0].pattern.surface)} 和 ${quote(top[1].pattern.surface)}。`,
      });
    }
  }

  const than = tokens.findIndex((token) => token.normal === "than");
  if (than > 0) {
    const earlier = tokens.slice(Math.max(0, than - 3), than);
    const marked = earlier.some((token) => token.normal === "more" || token.normal === "less" || token.morphForm === "r" || (token.pos === "a" && /er$/.test(token.normal)));
    if (marked) {
      points.push({
        id: "comparative",
        title: "比较级",
        detail: `${quote(surface(tokens, Math.max(0, than - 2), Math.min(tokens.length, than + 3)))} 是比较结构。than 的前面是比较级，后面是比较对象。`,
      });
    }
  }

  if (mood === "exclamatory") {
    points.push({ id: "exclamation", title: "感叹句", detail: "感叹句常用 how 或 what 把被强调的成分放到句首。" });
  }
  return points;
}

function finalizeTokens(tokens: Internal[], groups: Group[], chunks: Chunk[]): Token[] {
  for (const group of groups) {
    for (const index of group.indices) {
      const token = tokens[index];
      if (token.pos === "d") continue;
      const lexical = group.pattern.lexical;
      const isLexical = lexical ? token === lexical : false;
      if (isModalToken(token)) {
        token.pos = "x";
        token.posLabel = "情态动词";
      } else if (group.pattern.copula && isBeToken(token)) {
        token.pos = "x";
        token.posLabel = "系动词";
      } else if (!isLexical) {
        token.pos = "x";
        token.posLabel = "助动词";
      } else {
        token.pos = "v";
        token.posLabel = "动词";
      }
    }
  }
  return tokens.map((token, index) => {
    const described = describeWord(token.lemma === token.normal ? token.normal : token.lemma, token.pos);
    const own = describeWord(token.normal, token.pos);
    const chunk = chunks.find((item) => index >= item.start && index < item.end);
    const contraction = CONTRACTIONS[token.normal];
    return {
      text: token.text,
      before: token.before,
      after: token.after,
      lemma: token.lemma,
      formLabel: contraction ? contraction.label : own.formLabel ?? described.formLabel,
      pos: token.pos,
      posLabel: token.posLabel || POS_LABEL[token.pos] || "其他",
      gloss: own.gloss ?? described.gloss,
      phonetic: own.phonetic ?? described.phonetic,
      roleLabel: chunk && chunk.label !== "名词短语" && chunk.label !== "其他" ? chunk.label : null,
    };
  });
}

function analyzeSentence(sentence: string): SentenceAnalysis {
  const tokens = tokenize(sentence);
  if (tokens.length) {
    const next = tokens[1];
    if (next && next.pos === "n" && !tokens[0]?.text.match(/^(a|an|the)$/i) && (next.tags.includes("Adjective") || PREDICATE_ADJECTIVES.has(next.normal)) && hasSense(next.normal, "a") && tokens[0] && BE.has(tokens[0].normal)) {
      next.pos = "a";
      next.posLabel = "形容词";
    }
    for (let index = 0; index < tokens.length - 1; index += 1) {
      if (!isBeToken(tokens[index])) continue;
      const nextToken = tokens[index + 1];
      if (nextToken.pos === "n" && (nextToken.tags.includes("Adjective") || PREDICATE_ADJECTIVES.has(nextToken.normal)) && hasSense(nextToken.normal, "a") && tokens[index + 2]?.pos !== "n") {
        nextToken.pos = "a";
        nextToken.posLabel = "形容词";
      }
    }
  }
  const imperative = findImperative(tokens, sentence);
  const inversion = imperative || !sentence.includes("?") ? null : detectInversion(tokens);
  const groups = findGroups(tokens, inversion, imperative);
  const spans = findSpans(tokens, groups, sentence);
  const top = groups.filter((group) => !spans.some((span) => group.start >= span.start && group.start < span.end));
  const matrix = top[0] ?? groups[0] ?? null;
  const mood: Mood = imperative
    ? "imperative"
    : sentence.includes("?")
      ? "interrogative"
      : sentence.includes("!") && /^(how|what)\b/i.test(sentence)
        ? "exclamatory"
        : "declarative";
  const moodLabel = { declarative: "陈述句", interrogative: "疑问句", imperative: "祈使句", exclamatory: "感叹句" }[mood];
  const chunks = buildChunks(tokens, groups, spans, matrix, inversion);
  const points = buildPoints(sentence, tokens, groups, spans, matrix, mood);
  return {
    text: sentence.trim(),
    mood,
    moodLabel,
    tokens: finalizeTokens(tokens, groups, chunks),
    chunks: chunks.filter((chunk) => chunk.text.trim()),
    points,
    note: matrix ? null : "这句没有清楚的谓语。",
  };
}

export function analyzeText(text: string): Analysis {
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const pieces: string[] = [];
  for (const line of lines) {
    const found = (nlp(line).json() as { text?: string }[])
      .map((sentence) => (sentence.text ?? "").trim())
      .filter(Boolean);
    pieces.push(...(found.length ? found : [line]));
  }
  return {
    truncated: pieces.length > 12,
    sentences: pieces.slice(0, 12).map(analyzeSentence),
  };
}
