/* Invented names that read like generic (INN-style) drug names: a pronounceable start, an optional infix for a halogen
   (flu-, clo-, bro-, io-), and an ending taken from the kind of ring or group in the molecule, the way real stems
   mark a family (-azole, -zine, -dole…). They are made up and not checked against registered names or trade marks. */
const ONSET = ["b", "br", "c", "cl", "d", "dr", "f", "fl", "g", "gl", "l", "m", "n", "p", "pr", "r", "s", "t", "tr", "v", "z", "al", "am", "el", "ol", "ar"];
const VOWEL = ["a", "e", "i", "o", "u", "ia", "io", "ea"];
const MID = ["ba", "ca", "da", "fe", "ga", "la", "li", "ma", "mo", "na", "ne", "pa", "pi", "ra", "ro", "sa", "se", "ta", "ti", "to", "va", "vi", "za", "zo", "bu", "du", "xi", "ve"];
const INFIX = { F: "flu", Cl: "clo", Br: "bro", I: "io" };
const STEM_BY_CORE = {
  imidazole: "azole", pyrazole: "azole", oxazole: "azole", thiazole: "azole", triazole: "conazole",
  indole: "dole", xanthine: "phylline", benzimidazole: "mizole", quinoline: "quine", piperazine: "zine", piperidine: "pidine",
  morpholine: "moline", pyridine: "pyridine", pyrimidine: "rimidine", pyrazine: "pyrazine", pyridazine: "dazine",
  pyrrole: "role", furan: "furan", thiophene: "thiene", naphthalene: "naft", pyrrolidine: "rolidine", oxolane: "olane",
  cyclohexane: "hexane", cyclopentane: "pentane", benzene: "",
};
const STEM_BY_GROUP = [["sulfonamide", "sulfa", "pre"], ["amide", "amide"], ["acid", "ic"], ["nh2", "amine"], ["oh", "ol"], ["cn", "nitril"]];

function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

/* features: { coreId, subs: [substituent objects] }; `round` asks for a different set of suggestions */
export function suggestNames(features, smiles, count = 3, round = 0) {
  const subs = features.subs || [], ids = new Set(subs.map((s) => s.id)), tags = new Set(subs.flatMap((s) => s.tags || []));
  let stem = STEM_BY_CORE[features.coreId] ?? "";
  let pre = "";
  for (const [tag, text, where] of STEM_BY_GROUP) {
    if (tags.has(tag) || ids.has(tag)) { if (where === "pre") pre = text; else if (!stem) stem = text; }
  }
  if (!stem) stem = "ine";
  const infix = ["I", "Br", "Cl", "F"].map((h) => (tags.has(h) ? INFIX[h] : "")).find(Boolean) || "";
  const out = [], seen = new Set();
  for (let t = 0; out.length < count && t < 60; t++) {
    const r = rng(hash(`${smiles}|${round}|${t}`));
    const pick = (a) => a[Math.floor(r() * a.length)];
    let start = pre ? pre + pick(MID) : pick(ONSET) + pick(VOWEL) + (r() < 0.6 ? pick(MID) : "");
    let name = start + infix + stem;
    name = name.replace(/([aeiou])\1/g, "$1").replace(/([^aeiou]{3,})/g, (m) => m.slice(0, 2));
    if (name.length < 6 || name.length > 14 || seen.has(name)) continue;
    seen.add(name);
    out.push(name[0].toUpperCase() + name.slice(1));
  }
  return out;
}
