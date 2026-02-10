const DETS_SING = ["the", "a", "this", "that", "my", "your", "our", "some"];
const DETS_PLUR = ["the", "these", "those", "my", "your", "our", "some"];
const PREPS = [
  "in",
  "on",
  "under",
  "over",
  "through",
  "toward",
  "behind",
  "within",
  "beyond",
];
const CONJS = ["and", "but", "so", "while"];
const TAIL_PREP = ["of", "with", "without"];

let WORDS = null;

async function loadJSON(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`Failed to load ${path}: ${r.status}`);
  return r.json();
}

async function loadWords() {
  if (WORDS) return WORDS;

  // Prefer JSON arrays over txt in browsers.
  const [nouns, verbs, adjs, advs] = await Promise.all([
    loadJSON("./words/nouns.json"),
    loadJSON("./words/verbs.json"),
    loadJSON("./words/adjectives.json"),
    loadJSON("./words/adverbs.json"),
  ]);

  for (const [name, arr] of Object.entries({ nouns, verbs, adjs, advs })) {
    if (!Array.isArray(arr) || arr.length !== 256) {
      throw new Error(`${name}.json must be an array of exactly 256 strings`);
    }
  }

  WORDS = { nouns, verbs, adjs, advs };
  return WORDS;
}

function aOrAn(word) {
  return /^[aeiou]/i.test(word) ? "an" : "a";
}

function makeCursor(bytes) {
  let i = 0;
  return () => bytes[i++ % bytes.length];
}

async function sha512Bytes(str) {
  const data = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest("SHA-512", data);
  return new Uint8Array(hash);
}

function cap(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

export async function generatePoem(message) {
  const { nouns, verbs, adjs, advs } = await loadWords();

  const digest = await sha512Bytes(message);
  const next = makeCursor(digest);

  const twoSentences = next() % 100 < 35;

  const makeSentence = () => {
    const plural = (next() & 1) === 1;
    const DETS = plural ? DETS_PLUR : DETS_SING;

    let det1 = DETS[next() % DETS.length];
    let det2 = DETS[next() % DETS.length];

    const prep = PREPS[next() % PREPS.length];
    const conj = CONJS[next() % CONJS.length];

    const noun1i = next();
    const noun2i = next();
    const verb1i = next();
    const verb2i = next();
    const adv1i = next();
    const adv2i = next();

    const useAdj1 = next() % 100 < 70;
    const useAdj2 = next() % 100 < 70;

    let adj1 = useAdj1 ? adjs[next()] : "";
    let adj2 = useAdj2 ? adjs[next()] : "";

    let noun1 = nouns[noun1i];
    let noun2 = nouns[noun2i];
    let verb1 = verbs[verb1i];
    let verb2 = verbs[verb2i];
    let adv1 = advs[adv1i];
    let adv2 = advs[adv2i];

    if (noun2 === noun1) noun2 = nouns[next()];
    if (adj2 && adj2 === adj1) adj2 = adjs[next()];

    if (det1 === "a") det1 = aOrAn(adj1 || noun1);
    if (det2 === "a") det2 = aOrAn(adj2 || noun2);

    const subj = `${det1} ${adj1} ${noun1}`.replace(/\s+/g, " ").trim();
    const obj = `${det2} ${adj2} ${noun2}`.replace(/\s+/g, " ").trim();

    const advBefore = (next() & 1) === 1;

    // Weighted template choice by repetition
    const templates = [0, 0, 0, 1, 1, 2, 3];
    const t = templates[next() % templates.length];

    let s;
    if (t === 0) {
      s = advBefore
        ? `${subj} ${adv1} ${verb1} ${prep} ${obj}`
        : `${subj} ${verb1} ${adv1} ${prep} ${obj}`;
    } else if (t === 1) {
      s = advBefore
        ? `${subj} ${verb1}, ${conj} ${obj} ${adv2} ${verb2}`
        : `${subj} ${verb1}, ${conj} ${obj} ${verb2} ${adv2}`;
    } else if (t === 2) {
      s = advBefore
        ? `${prep} ${obj}, ${subj} ${adv1} ${verb1}`
        : `${prep} ${obj}, ${subj} ${verb1} ${adv1}`;
    } else {
      s = `${subj} ${verb1} ${prep} ${obj}`;
    }

    // Optional tail phrase
    if (next() % 100 < 35) {
      const tp = TAIL_PREP[next() % TAIL_PREP.length];
      const tadj = adjs[next()];
      let tnoun = nouns[next()];
      if (tnoun === noun1 || tnoun === noun2) tnoun = nouns[next()];
      s = `${s} ${tp} ${tadj} ${tnoun}`;
    }

    // Punctuation
    const pr = next() % 100;
    const punct = pr < 85 ? "." : pr < 95 ? "!" : pr < 99 ? "…" : "?";

    return cap(s.replace(/\s+/g, " ").trim()) + punct;
  };

  const s1 = makeSentence();
  if (!twoSentences) return s1;
  const s2 = makeSentence();
  return `${s1} ${s2}`;
}
