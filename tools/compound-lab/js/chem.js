/* Chemistry: building the molecule from a core and its groups, checking it with RDKit (compiled to WebAssembly, loaded
   from a CDN), and reading off the formula, weight, descriptors and a flat picture. The 3D shape is made in embed3d.js. */
import { PATTERNS, CLASSES } from "./effects.js";

const RDKIT_BASE = "https://cdn.jsdelivr.net/npm/@rdkit/rdkit@2026.3.6/dist/";
let RD = null;

export async function loadChem() {
  if (RD) return RD;
  await new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = RDKIT_BASE + "RDKit_minimal.js"; s.onload = res; s.onerror = () => rej(new Error("Couldn't load the chemistry library. Check your connection and reload."));
    document.head.appendChild(s);
  });
  RD = await window.initRDKitModule({ locateFile: (f) => RDKIT_BASE + f });
  return RD;
}

const atomCount = (smi) => (smi.match(/\[[^\]]+\]|Br|Cl|[BCNOSPFIcnosp]/g) || []).length;

/* the molecule as a SMILES string: each group goes in a branch after the atom it sits on.
   `map[i]` is the position of core atom i in the finished molecule's atom list. */
export function assemble(core, placed) {
  const at = new Map();
  for (const p of placed) { if (!at.has(p.atom)) at.set(p.atom, []); at.get(p.atom).push(p); }
  let smi = "", n = 0, ring = 0;
  const map = [], parts = [];   // parts: for each group, which atoms of the finished molecule it is made of
  core.tokens.forEach((tok, i) => {
    const subs = at.get(i) || [];
    smi += subs.length && core.alt && core.alt[i] ? core.alt[i] : tok;
    map[i] = n++;
    for (const p of subs) {
      const s = p.sub;
      parts.push({ placed: p, attach: map[i], atoms: Array.from({ length: atomCount(s.smi) }, (_, k) => n + k) });
      // a group that is itself a ring closes it with its own number, so it can't clash with the core's
      const label = {};
      smi += `(${s.order === 2 ? "=" : ""}${s.smi.replace(/\d/g, (d) => (label[d] ??= "%" + (20 + ring++)))})`;
      n += atomCount(s.smi);
    }
  });
  return { smiles: smi, map, parts };
}

const used = (placed, atom) => placed.reduce((t, p) => t + (p.atom === atom ? (p.sub.order || 1) : 0), 0);
export const freeHydrogens = (core, placed, atom) => core.hs[atom] - used(placed, atom);

// can this group go on this atom? Returns { ok } or { ok: false, why }
export function canAttach(core, placed, atom, sub) {
  const need = sub.order || 1;
  if (core.hs[atom] === 0) return { ok: false, why: "This atom has no hydrogen to replace." };
  if (freeHydrogens(core, placed, atom) < need) return { ok: false, why: need > 1 ? "Needs two free hydrogens on this atom." : "This atom is full." };
  const m = RD.get_mol(assemble(core, [...placed, { atom, sub }]).smiles);
  if (!m) return { ok: false, why: "That would break the bonding rules." };
  m.delete();
  return { ok: true };
}

export const isValid = (smiles) => { const m = RD.get_mol(smiles); if (!m) return false; m.delete(); return true; };

const HILL = (counts) => {
  const els = Object.keys(counts);
  const order = counts.C ? ["C", ...(counts.H ? ["H"] : []), ...els.filter((e) => e !== "C" && e !== "H").sort()] : els.sort();
  return order.map((e) => ({ el: e, n: counts[e] }));
};

// things that are allowed by the bonding rules but would not last: a short note for each
const WARNINGS = [
  ["[CX4]([OX2H])[OX2H]", "Two hydroxyls on one carbon (a gem-diol) usually lose water to become a carbonyl."],
  ["[CX4]([OX2H])[NX3;H1,H2]", "A hydroxyl and an amine on one carbon (a hemiaminal) tends to fall apart."],
  ["[CX4]([NX3;H1,H2])[NX3;H1,H2]", "Two amines on one carbon (an aminal) is easily hydrolysed."],
  ["[#7][F,Cl,Br,I]", "A halogen bonded to nitrogen is very reactive."],
  ["[#8;!$([OX1])][#8;!$([OX1])]", "An O–O bond (a peroxide) is unstable."],
  ["[#7;!a][#7;!a]", "An N–N single bond (a hydrazine-type group) is reactive and often toxic."],
  ["[CX3](=O)[CX3](=O)", "Two carbonyls bonded together (a 1,2-dicarbonyl) are reactive."],
  ["[SX2H]", "A free thiol oxidises easily in air (and smells)."],
  ["[CX4]([Cl,Br,I])[OX2,NX3]", "A chlorine, bromine or iodine on the same carbon as O or N (an α-halo ether or amine) is very reactive."],
];
const NITRO = "[N+](=O)[O-]";

export function analyse(smiles) {
  const m = RD.get_mol(smiles);
  if (!m) return null;
  const out = { smiles: m.get_smiles() };
  const d = JSON.parse(m.get_descriptors());
  out.desc = d;
  out.mw = d.amw; out.exact = d.exactmw;

  out.warnings = [];
  for (const [smarts, text] of WARNINGS) {
    const q = RD.get_qmol(smarts);
    if (q) { if (Object.keys(JSON.parse(m.get_substruct_match(q))).length) out.warnings.push(text); q.delete(); }
  }
  const nq = RD.get_qmol(NITRO);
  if (nq) {
    const hits = JSON.parse(m.get_substruct_matches(nq)).length;
    if (hits >= 2) out.warnings.push("Several nitro groups on one molecule make it energetic (shock- and heat-sensitive).");
    nq.delete();
  }

  // the formula and a hydrogen-complete structure with a flat layout (the 3D shape builds on it)
  const json = JSON.parse(m.get_json());
  const ext = ((json.molecules || json.m)[0].extensions || []).find((e) => e.name === "rdkitRepresentation") || {};
  const heavyBonds = (json.molecules || json.m)[0].bonds.map((b) => b.atoms);
  const aromBonds = new Set((ext.aromaticBonds || []).map((i) => heavyBonds[i].slice().sort((a, b) => a - b).join("-")));
  out.svg = null;
  out.mol2d = m;     // kept so the caller can draw it; call release() when done
  const h = RD.get_mol(smiles);
  h.add_hs_in_place(); h.set_new_coords();
  const block = h.get_molblock();
  h.delete();
  const lines = block.split("\n");
  const na = parseInt(lines[3].slice(0, 3)), nb = parseInt(lines[3].slice(3, 6));
  const atoms = [], bonds = [];
  for (let i = 0; i < na; i++) {
    const l = lines[4 + i];
    atoms.push({ x: parseFloat(l.slice(0, 10)), y: parseFloat(l.slice(10, 20)), el: l.slice(31, 34).trim() });
  }
  for (let i = 0; i < nb; i++) {
    const l = lines[4 + na + i], a = parseInt(l.slice(0, 3)) - 1, b = parseInt(l.slice(3, 6)) - 1;
    bonds.push({ a, b, order: parseInt(l.slice(6, 9)), arom: aromBonds.has([a, b].sort((x, y) => x - y).join("-")) });
  }
  const counts = {};
  let charge = 0;
  for (const a of atoms) counts[a.el] = (counts[a.el] || 0) + 1;
  for (const l of lines.slice(4 + na + nb)) { const mm = /^M  CHG\s+\d+((?:\s+\d+\s+-?\d+)+)/.exec(l); if (mm) { const t = mm[1].trim().split(/\s+/).map(Number); for (let i = 1; i < t.length; i += 2) charge += t[i]; } }
  out.formula = HILL(counts); out.charge = charge;
  out.graph = { atoms, bonds, rings: ext.atomRings || [] };
  out.molblock = block;
  return out;
}

export function drawFlat(out, highlightAtom) {
  const m = out.mol2d;
  const opts = { width: 320, height: 240, bondLineWidth: 2, padding: 0.12 };
  if (highlightAtom != null) return m.get_svg_with_highlights(JSON.stringify({ ...opts, atoms: [highlightAtom], highlightColour: [1, 0.7, 0.2], highlightRadius: 0.45 }));
  return m.get_svg(opts.width, opts.height);
}
export function release(out) { if (out && out.mol2d) { out.mol2d.delete(); out.mol2d = null; } }

// a small drawing of a core by itself, for the picker
export function coreSvg(core, w = 120, h = 90) {
  const m = RD.get_mol(core.tokens.join(""));
  if (!m) return "";
  const svg = m.get_svg(w, h);
  m.delete();
  return svg;
}

/* what a structure looks like to the effect model: its descriptors, which of the known groups it has,
   and whether it belongs to a class the Lab will not evaluate */
const queries = new Map();
const hasGroup = (m, smarts) => {
  if (!queries.has(smarts)) queries.set(smarts, RD.get_qmol(smarts));
  const q = queries.get(smarts);
  return q ? Object.keys(JSON.parse(m.get_substruct_match(q))).length > 0 : false;
};
export function profile(smiles) {
  const m = RD.get_mol(smiles);
  if (!m) return null;
  const desc = JSON.parse(m.get_descriptors());
  const flags = new Set();
  for (const [id, p] of Object.entries(PATTERNS)) if (hasGroup(m, p.smarts)) flags.add(id);
  const classes = CLASSES.filter((c) => hasGroup(m, c.smarts));
  const canonical = m.get_smiles();
  m.delete();
  return { smiles, canonical, desc, flags, classes };
}
