export type Mood = "declarative" | "interrogative" | "imperative" | "exclamatory";

export type Chunk = {
  role: string;
  label: string;
  text: string;
  start: number;
  end: number;
};

export type Token = {
  text: string;
  before: string;
  after: string;
  lemma: string;
  formLabel: string | null;
  pos: string;
  posLabel: string;
  gloss: string | null;
  phonetic: string | null;
  roleLabel: string | null;
};

export type GrammarPoint = {
  id: string;
  title: string;
  detail: string;
};

export type SentenceAnalysis = {
  text: string;
  mood: Mood;
  moodLabel: string;
  tokens: Token[];
  chunks: Chunk[];
  points: GrammarPoint[];
  note: string | null;
};

export type Analysis = {
  sentences: SentenceAnalysis[];
  truncated: boolean;
};

export type AnalyzedSentence = SentenceAnalysis & {
  translation: string | null;
};

export type AnalyzeResponse = {
  translation: string | null;
  translationError: string | null;
  truncated: boolean;
  sentences: AnalyzedSentence[];
};
