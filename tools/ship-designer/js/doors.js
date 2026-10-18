// Door styles: what fills a doorway / hatch / air lock. A style is data (resources/doors/*.door.json, written like a gadget part):
//   { "name", "hinge": {"side": "-x|+x|-y|+y", "angle": 100, "push": 0.3} | "slide": {"dir": [1, 0], "dist": "w"},
//     "where": "mid" | "ends", "frame": [nodes that stay put], "leaf": [nodes that swing] }
// Nodes are the same primitives as gadgets (box cyl lathe wheel ring ...). They are drawn in "part space" - X across the
// opening, Y THROUGH the door (towards the child hall), Z down - and may use the opening's size in expressions:
// w, h = width / height, r = half the smaller of them, t = wall thickness. "color": "$frame" borrows the connection's frame paint.
// A node can follow the open / locked state: "anim": {"type": "spin", "axis": "y", "turns": 3} or {"type": "slide", "dir": [x,y,z], "dist": 0.5}.
import * as THREE from 'three';
import { lib, buildFromJson } from './assets.js';

const { Group, MathUtils } = THREE;

export const BUILTIN_DOORS = {
  'builtin:door': { name: 'Hinged panel', hinge: { side: '-x', angle: 105 }, leaf: [{ shape: 'box', size: ['w+0.04', 0.06, 'h+0.04'], color: '$frame' }] },
  'builtin:hatch': { name: 'Round hatch', hinge: { side: '-y', angle: 110 }, leaf: [{ shape: 'cyl', size: ['w/2+0.03', 'w/2+0.03', 0.09], scale: [1, 1, 'h/w'], color: '$frame' }] },
};

export function doorOptions() {
  const o = Object.fromEntries(Object.entries(BUILTIN_DOORS).map(([id, d]) => [id, d.name]));
  lib.doors.forEach(d => { o[d.id] = d.name; });
  return o;
}

export function doorStyleFor(c) {
  const id = c.doorStyle || (c.type === 'door' ? 'builtin:door' : 'builtin:hatch');
  const def = lib.doors.get(id)?.def || BUILTIN_DOORS[id] || BUILTIN_DOORS['builtin:hatch'];
  return { id, def };
}

const smooth01 = x => { x = Math.min(Math.max(x, 0), 1); return x * x * (3 - 2 * x); };

/** one door (frame + swinging leaf) for an opening `sec` = {w, h}, centred on the origin with Z through the opening */
export function buildDoorLeaf(def, sec, ctx0) {
  const w = sec.w, h = sec.h;
  const ctx = { ...ctx0, w, h, r: Math.min(w, h) / 2 };
  const toDoorSpace = g => { const o = new Group(); o.rotation.x = Math.PI / 2; o.add(g); return o; };   // part Y -> through, part Z -> down
  const root = new Group();
  if (def.frame?.length) root.add(toDoorSpace(buildFromJson({ nodes: def.frame }, { ...ctx, open: undefined })));
  const open = MathUtils.clamp(ctx.open ?? 1, 0, 1);
  const leaf = toDoorSpace(buildFromJson({ nodes: def.leaf || [] }, ctx));
  if (def.slide) {                                            // a sliding door
    const d = def.slide.dir || [1, 0], dist = typeof def.slide.dist === 'number' ? def.slide.dist : w;
    leaf.position.set(d[0] * dist * open, d[1] * dist * open, 0);
    root.add(leaf);
    return root;
  }
  const hg = def.hinge || { side: '-x', angle: 100 };
  const at = { '+x': [w / 2, 0], '-x': [-w / 2, 0], '+y': [0, h / 2], '-y': [0, -h / 2] }[hg.side] || [-w / 2, 0];
  const pivot = new Group();
  pivot.position.set(at[0], at[1], (hg.push || 0) * smooth01(open / 0.22));       // a plug door first unseats out of its frame
  leaf.position.set(-at[0], -at[1], 0);
  pivot.add(leaf);
  const a = MathUtils.degToRad(hg.angle ?? 100) * smooth01(Math.max(0, (open - (hg.push ? 0.22 : 0)) / (hg.push ? 0.78 : 1)));
  if (hg.side === '-x') pivot.rotation.y = -a; else if (hg.side === '+x') pivot.rotation.y = a;
  else if (hg.side === '-y') pivot.rotation.x = a; else pivot.rotation.x = -a;
  root.add(pivot);
  return root;
}
