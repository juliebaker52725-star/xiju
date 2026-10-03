import assert from "node:assert/strict";
import test from "node:test";
import { analyzeText } from "./analyze";
import type { SentenceAnalysis } from "./types";

function one(text: string): SentenceAnalysis {
  const sentence = analyzeText(text).sentences[0];
  assert.ok(sentence, `no sentence for ${text}`);
  return sentence;
}

function dump(sentence: SentenceAnalysis): string {
  return JSON.stringify(
    {
      mood: sentence.mood,
      chunks: sentence.chunks.map((chunk) => `${chunk.label}:${chunk.text}`),
      points: sentence.points.map((point) => `${point.id}:${point.title}`),
    },
    null,
    2,
  );
}

test("passive voice with a relative clause", () => {
  const sentence = one("The book that she bought yesterday was written by a famous novelist.");
  const ids = sentence.points.map((point) => point.id);
  assert.ok(ids.includes("passive"), dump(sentence));
  assert.ok(ids.includes("relative"), dump(sentence));
  const chunks = sentence.chunks.map((chunk) => `${chunk.label}:${chunk.text}`);
  assert.ok(chunks.some((chunk) => chunk.startsWith("主语:") && chunk.toLowerCase().includes("book")), dump(sentence));
  assert.ok(chunks.some((chunk) => chunk.startsWith("谓语:") && /written/i.test(chunk)), dump(sentence));
  assert.ok(chunks.some((chunk) => chunk.includes("定语从句") && /bought/i.test(chunk)), dump(sentence));
  assert.ok(chunks.some((chunk) => chunk.includes("状语") && /novelist/i.test(chunk)), dump(sentence));
});

test("third conditional", () => {
  const sentence = one("If I had known you were coming, I would have baked a cake.");
  const ids = sentence.points.map((point) => point.id);
  assert.ok(ids.includes("conditional-3"), dump(sentence));
  assert.ok(ids.includes("modal-perfect"), dump(sentence));
  const predicate = sentence.chunks.find((chunk) => chunk.label === "谓语");
  assert.ok(predicate && /would have baked/i.test(predicate.text), dump(sentence));
});

test("present perfect progressive", () => {
  const sentence = one("She has been working on this project since last Monday.");
  const ids = sentence.points.map((point) => point.id);
  assert.ok(ids.includes("tense-present-perfect-progressive"), dump(sentence));
  assert.ok(ids.includes("since-for"), dump(sentence));
  assert.equal(sentence.chunks[0]?.label, "主语");
  assert.match(sentence.chunks.find((chunk) => chunk.label === "谓语")?.text ?? "", /has been working/i);
});

test("there be and a why-clause", () => {
  const sentence = one("There are three reasons why the experiment failed.");
  const ids = sentence.points.map((point) => point.id);
  assert.ok(ids.includes("existential"), dump(sentence));
  assert.ok(ids.includes("relative"), dump(sentence));
  assert.ok(sentence.chunks.some((chunk) => chunk.label === "真正主语" && /reasons/i.test(chunk.text)), dump(sentence));
});

test("do-support question", () => {
  const sentence = one("Did she finish the report?");
  assert.equal(sentence.mood, "interrogative");
  assert.ok(sentence.points.some((point) => point.id === "do-support"), dump(sentence));
  assert.ok(sentence.chunks.some((chunk) => chunk.label === "主语" && /^she$/i.test(chunk.text)), dump(sentence));
  assert.ok(sentence.chunks.some((chunk) => chunk.label === "宾语" && /report/i.test(chunk.text)), dump(sentence));
});

test("negative imperative", () => {
  const sentence = one("Don't open the window.");
  assert.equal(sentence.mood, "imperative");
  assert.ok(sentence.points.some((point) => point.id === "imperative"), dump(sentence));
  assert.ok(sentence.chunks.some((chunk) => chunk.label === "宾语" && /window/i.test(chunk.text)), dump(sentence));
  assert.match(sentence.chunks.find((chunk) => chunk.label === "谓语")?.text ?? "", /Don't open/);
});

test("dummy it with an infinitive", () => {
  const sentence = one("It is important to check the results.");
  const ids = sentence.points.map((point) => point.id);
  assert.ok(ids.includes("dummy-it"), dump(sentence));
  assert.ok(sentence.chunks.some((chunk) => chunk.label === "形式主语"), dump(sentence));
  assert.ok(sentence.chunks.some((chunk) => chunk.label === "真正主语" && /check/i.test(chunk.text)), dump(sentence));
});

test("second conditional", () => {
  const sentence = one("I would travel more if I had more time.");
  assert.ok(sentence.points.some((point) => point.id === "conditional-2"), dump(sentence));
});

test("participle adjective is not passive", () => {
  const sentence = one("She was interested in the result.");
  const ids = sentence.points.map((point) => point.id);
  assert.ok(ids.includes("predicative-participle"), dump(sentence));
  assert.equal(ids.includes("passive"), false, dump(sentence));
});

test("passive with an agent", () => {
  const sentence = one("The window was broken by the storm.");
  assert.ok(sentence.points.some((point) => point.id === "passive"), dump(sentence));
  assert.match(sentence.points.find((point) => point.id === "passive")?.detail ?? "", /storm|发出者/);
});

test("possession is not the perfect", () => {
  const sentence = one("I have a book.");
  const ids = sentence.points.map((point) => point.id);
  assert.ok(ids.includes("tense-simple-present"), dump(sentence));
  assert.equal(ids.some((id) => id.includes("perfect")), false, dump(sentence));
  assert.ok(sentence.chunks.some((chunk) => chunk.label === "宾语" && /book/i.test(chunk.text)), dump(sentence));
});

test("wh-question with did", () => {
  const sentence = one("What did she buy yesterday?");
  assert.equal(sentence.mood, "interrogative");
  assert.ok(sentence.points.some((point) => point.id === "do-support"), dump(sentence));
  assert.ok(sentence.chunks.some((chunk) => chunk.label === "疑问词" && /what/i.test(chunk.text)), dump(sentence));
});

test("although clause", () => {
  const sentence = one("Although it was raining, we walked home.");
  assert.ok(sentence.points.some((point) => point.id === "adverbial-concession"), dump(sentence));
  assert.ok(sentence.chunks.some((chunk) => chunk.label === "谓语" && /walked/i.test(chunk.text)), dump(sentence));
});

test("subject question does not add do", () => {
  const sentence = one("Who wrote this note?");
  assert.ok(sentence.points.some((point) => point.id === "question-subject"), dump(sentence));
  assert.equal(sentence.points.some((point) => point.id === "do-support"), false);
});

test("word gloss and lemma", () => {
  const sentence = one("She bought a book.");
  const bought = sentence.tokens.find((token) => /bought/i.test(token.text));
  assert.ok(bought, dump(sentence));
  assert.equal(bought?.lemma, "buy");
  assert.match(bought?.gloss ?? "", /买/);
  assert.match(bought?.formLabel ?? "", /过去/);
});
