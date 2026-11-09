/* Systematic names for a ring core with groups attached, following the usual IUPAC substitutive rules:
     - the highest-ranking group becomes the ending (-oic acid, -amide, -nitrile, -al, -one, -ol, -amine), the rest are prefixes
     - prefixes go in alphabetical order, with di-/tri- (bis-/tris- for bracketed names) ignored when sorting
     - ring atoms are numbered in the way that gives the ending group, then all groups, then the first-cited prefix the lowest numbers
   Only the groups in data.js are named. */

const SUFFIX = {
  acid: { rank: 1, text: "carboxylic acid" },
  amide: { rank: 2, text: "carboxamide" },
  sulfonamide: { rank: 3, text: "sulfonamide" },
  nitrile: { rank: 4, text: "carbonitrile" },
  aldehyde: { rank: 5, text: "carbaldehyde" },
  ketone: { rank: 6, text: "one", vowel: true },
  alcohol: { rank: 7, text: "ol", vowel: true },
  amine: { rank: 8, text: "amine", vowel: true },
};
// benzene's accepted names when it has a single ending group
const BENZENE_RETAINED = {
  alcohol: "phenol", amine: "aniline", acid: "benzoic acid", amide: "benzamide",
  nitrile: "benzonitrile", aldehyde: "benzaldehyde", sulfonamide: "benzenesulfonamide",
};
const MULT = ["", "", "di", "tri", "tetra", "penta", "hexa", "hepta", "octa"];
const MULT_BRACKET = ["", "", "bis", "tris", "tetrakis", "pentakis", "hexakis", "heptakis", "octakis"];

/* every way of renumbering the ring that keeps the same structure (the ring's symmetries), as lists mapping
   an atom to the atom whose position number it takes */
const autoCache = new Map();
export function automorphisms(core) {
  if (autoCache.has(core.id)) return autoCache.get(core.id);
  const n = core.atoms.length, adj = Array.from({ length: n }, () => new Set());
  for (const [a, b] of core.bonds) { adj[a].add(b); adj[b].add(a); }
  const out = [], map = new Array(n).fill(-1), used = new Array(n).fill(false);
  const place = (i) => {
    if (i === n) { out.push(map.slice()); return; }
    for (let j = 0; j < n; j++) {
      if (used[j] || core.atoms[j] !== core.atoms[i] || adj[j].size !== adj[i].size) continue;
      let ok = true;
      for (let k = 0; k < i && ok; k++) if (adj[i].has(k) !== adj[j].has(map[k])) ok = false;
      if (!ok) continue;
      map[i] = j; used[j] = true;
      place(i + 1);
      used[j] = false; map[i] = -1;
    }
  };
  place(0);
  autoCache.set(core.id, out);
  return out;
}

const num = (label) => parseFloat(label) + (/[a-z]$/.test(label) ? 0.5 : 0);
const cmpArr = (a, b) => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] === undefined) return -1;
    if (b[i] === undefined) return 1;
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
};

// the groups that are the same kind, in alphabetical order, each with the position numbers it sits at
function prefixGroups(items, loc) {
  const by = new Map();
  for (const p of items) {
    if (!by.has(p.sub.id)) by.set(p.sub.id, { sub: p.sub, locs: [] });
    by.get(p.sub.id).locs.push(loc(p.atom));
  }
  const groups = [...by.values()];
  for (const g of groups) g.locs.sort((a, b) => num(a) - num(b));
  const key = (g) => (g.sub.sortKey || g.sub.prefix).replace(/^[^a-z]+/i, "").toLowerCase();
  groups.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
  return groups;
}

/* `placed` is a list of { atom, sub }: the ring atom a group is on and the group (from data.js) */
export function nameCompound(core, placed) {
  const parent = core.parent, indicated = core.indicated || "";
  if (!placed.length) return indicated + parent;

  // the ending group: the highest-ranking kind that is on a carbon
  let principal = null;
  for (const p of placed) {
    if (!p.sub.suffix || core.atoms[p.atom] !== "C") continue;
    const rank = SUFFIX[p.sub.suffix].rank;
    if (!principal || rank < principal.rank) principal = { type: p.sub.suffix, rank, items: [] };
  }
  if (principal) principal.items = placed.filter((p) => p.sub.suffix === principal.type && core.atoms[p.atom] === "C");
  const rest = placed.filter((p) => !principal || !principal.items.includes(p));

  // choose the numbering
  let best = null;
  for (const pi of automorphisms(core)) {
    const loc = (atom) => core.labels[pi[atom]];
    const cand = {
      loc,
      principal: principal ? principal.items.map((p) => num(loc(p.atom))).sort((a, b) => a - b) : [],
      all: placed.map((p) => num(loc(p.atom))).sort((a, b) => a - b),
      alpha: prefixGroups(rest, loc).flatMap((g) => g.locs.map(num)),
    };
    if (!best || cmpArr(cand.principal, best.principal) < 0
      || (!cmpArr(cand.principal, best.principal) && (cmpArr(cand.all, best.all) < 0
        || (!cmpArr(cand.all, best.all) && cmpArr(cand.alpha, best.alpha) < 0)))) best = cand;
  }

  // a ring with only one thing on it doesn't need position numbers if every position is alike
  const noLocants = !!core.homogeneous && placed.length === 1;
  const mult = (n, bracket) => (n > 1 ? (bracket ? MULT_BRACKET : MULT)[n] : "");
  const pre = prefixGroups(rest, best.loc).map((g) => {
    const name = g.sub.paren ? `(${g.sub.prefix})` : g.sub.prefix;
    const word = mult(g.locs.length, g.sub.paren) + name;
    return noLocants ? word : `${g.locs.join(",")}-${word}`;
  }).join("-");

  const retained = principal && principal.items.length === 1 && core.id === "benzene" ? BENZENE_RETAINED[principal.type] : null;
  const join = (head, body) => (head ? head + (indicated && body.startsWith(indicated) ? "-" : "") + body : body);
  if (!principal) return join(pre, indicated + parent);
  if (retained) return pre + retained;

  const suf = SUFFIX[principal.type], k = principal.items.length;
  const locs = principal.items.map((p) => best.loc(p.atom)).sort((a, b) => num(a) - num(b)).join(",");
  const stem = suf.vowel && k === 1 && parent.endsWith("e") ? parent.slice(0, -1) : parent;
  const locPart = noLocants ? "" : `-${locs}-`;
  return join(pre, indicated + stem + locPart + mult(k, false) + suf.text);
}
