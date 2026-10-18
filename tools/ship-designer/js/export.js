// Saving: ship files, PNG pictures, and 3D model export (GLB / glTF / OBJ / STL).
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { extractGeometry } from './hull.js';
import { branchOf } from './ship.js';
import { exportLib, importLib, lib } from './assets.js';
import { app, usedTextures, usedPieces, usedConnectors } from './app.js';
import { paramsOf, styleOf } from './connector.js';
import * as paint from './paint.js';
import { download, toast } from './util.js';

const safeName = s => (s || 'ship').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') || 'ship';

// ------------------------------------------------------------------ ship files
export function shipFile() {
  return { format: 'ship-designer', version: 3, ship: app.ship, lib: exportLib(usedPieces(), usedTextures(), usedConnectors()), paint: paint.exportPaint(new Set(app.ship.halls.map(h => h.id))) };
}

export const saveShipFile = () => download(new Blob([JSON.stringify(shipFile())], { type: 'application/json' }), safeName(app.ship.name) + '.ship.json');

export function openShipObject(obj) {
  if (!obj?.ship && !obj?.halls) throw new Error('That does not look like a ship file.');
  importLib(obj.lib);
  paint.importPaint(obj.paint).then(() => { app.dirty.mats = true; });
  const empty = !app.model && !app.ship.halls.length && !app.ship.atts.length;
  if (empty) app.actions.setShip(obj.ship || obj);          // an empty tab is reused, otherwise the ship opens in a new tab
  else app.actions.newDoc('ship', obj.ship || obj);
}

export async function saveShipToResources() {
  const name = safeName(app.ship.name) + '.ship.json';
  const r = await fetch('resources/ships/' + name, { method: 'POST', body: JSON.stringify(shipFile()) });
  if (!r.ok) throw new Error('The server refused the file (' + r.status + ')');
  toast('Saved resources/ships/' + name);
  return name;
}

// ------------------------------------------------------------------ PNG
export async function savePNG(opts) {
  const { blob, width, height } = await app.vp.capture(opts);
  download(blob, `${safeName(app.ship.name)}_${width}x${height}.png`);
  toast(`Saved ${width} × ${height} PNG`);
}

// ------------------------------------------------------------------ models
export function exportMaterial(m) {
  const c = m.clone();
  c.clippingPlanes = null;
  const clear = m.userData.glass ? m.opacity : m.userData.baseOpacity ?? 1; // windows and see-through hull parts stay see-through
  c.wireframe = false;
  c.transparent = clear < 0.99;
  c.opacity = clear;
  c.depthWrite = true;
  c.side = THREE.FrontSide;
  if (m.map) {
    const t = m.map.clone();
    t.repeat.set(1, 1);
    t.needsUpdate = true;
    c.map = t;
  }
  return c;
}

/** the same triangles as the viewport, with each material's tile size baked into the UVs so other programs map them right */
function bakedHullMesh(ex, mats, name) {
  const geo = ex.geometry, uv = geo.attributes.uv, uv1 = geo.attributes.uv1;
  const out = ex.materialIndices.map(i => {
    const m = mats[i], L = paint.layers.get(m.userData.key);
    const c = exportMaterial(m);
    if (L && paint.isPainted(L)) {                      // brush painting: flatten it over the surface colour into one picture on the paint canvas's own UVs
      const cv = document.createElement('canvas');
      cv.width = cv.height = L.res;
      const g = cv.getContext('2d');
      g.fillStyle = m.color.getStyle();
      g.fillRect(0, 0, L.res, L.res);
      g.drawImage(L.canvas, 0, 0);
      const t = new THREE.CanvasTexture(cv);
      t.colorSpace = THREE.SRGBColorSpace;
      c.map = t;
      c.color.set('#ffffff');
      c.userData.painted = true;
    }
    return c;
  });
  geo.groups.forEach(g => {
    const m = mats[ex.materialIndices[g.materialIndex]], painted = out[g.materialIndex].userData.painted;
    const k = m.map ? m.map.repeat.x : 1;
    for (let i = g.start; i < g.start + g.count; i++) {
      if (painted) uv.setXY(i, uv1.getX(i), uv1.getY(i));
      else uv.setXY(i, uv.getX(i) * k, uv.getY(i) * k);
    }
  });
  const mesh = new THREE.Mesh(geo, out);
  mesh.name = name;
  return mesh;
}

/** scopes: ship | hulls | gadgets | hall | branch */
export function buildExportRoot(scope) {
  const sv = app.sv, ship = app.ship;
  const root = new THREE.Group();
  root.name = ship.name;
  let hallIds;
  const sel = app.sel;
  if (scope === 'hall' || scope === 'branch') {
    const hid = sel.type === 'hall' ? sel.id : sel.type === 'att' ? app.actions.att(sel.id)?.hall : null;
    if (!hid) throw new Error('Select a hall (or a gadget on one) first.');
    hallIds = new Set(scope === 'hall' ? [hid] : branchOf(ship, hid).map(h => h.id));
  } else hallIds = new Set(ship.halls.map(h => h.id));
  const wantHull = scope !== 'gadgets';
  const wantGadgets = scope !== 'hulls';

  if (wantHull && sv.hullData) {
    for (const hall of ship.halls) {
      if (!hallIds.has(hall.id) || hall.hidden) continue;
      const ex = extractGeometry(sv.hullData.geometry, sv.hullData.materials, k => k.startsWith(hall.id + '.'));
      if (ex) { const bm = bakedHullMesh(ex, sv.hullData.materials, hall.name); bm.userData.hallId = hall.id; root.add(bm); }
    }
    for (const m of sv.frameGroup.children) {           // rib rings and lattice poles
      if (!hallIds.has(m.userData.hallId)) continue;
      const c = m.clone();
      c.name = (app.actions.hall(m.userData.hallId)?.name || 'Hall') + ' - frame';
      c.material = exportMaterial(m.material);
      root.add(c);
    }
    if (scope === 'ship' || scope === 'hulls') {        // wings and scaffolding between halls
      for (const m of sv.bridgeGroup.children) {
        const c = m.clone();
        c.name = ship.bridges.find(b => b.id === m.userData.bridgeId)?.name || 'Wing';
        c.material = exportMaterial(m.material);
        root.add(c);
      }
    }
    for (const g of sv.connGroup.children) {
      if (!hallIds.has(g.userData.connHall)) continue;
      const hall = app.actions.hall(g.userData.connHall);
      const c = g.clone(true);
      c.name = `${hall.name} - ${hall.conn.type}`;
      c.traverse(o => { if (o.isMesh) o.material = exportMaterial(o.material); });
      root.add(c);
    }
  }
  if (wantGadgets) {
    ship.atts.forEach(a => {
      if (a.hidden) return;
      const inScope = scope === 'gadgets' || scope === 'ship' || scope === 'hulls' ? true : hallIds.has(a.hall);
      const rec = sv.attObjs.get(a.id);
      if (!inScope || !rec?.loaded) return;
      const g = rec.root.clone(true);
      g.name = a.name || 'Gadget';
      g.traverse(o => {
        if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map(exportMaterial) : exportMaterial(o.material);
      });
      root.add(g);
    });
  }
  if (!root.children.length) throw new Error('Nothing to export in that selection.');
  root.updateMatrixWorld(true);
  return root;
}

export async function exportModel(scope, format) {
  const root = buildExportRoot(scope);
  const base = safeName(app.ship.name) + (scope === 'ship' ? '' : '_' + scope);
  if (format === 'glb' || format === 'gltf') {
    const ex = new GLTFExporter();
    const out = await new Promise((res, rej) => ex.parse(root, res, rej, { binary: format === 'glb', maxTextureSize: 2048 }));
    if (format === 'glb') download(new Blob([out], { type: 'model/gltf-binary' }), base + '.glb');
    else download(new Blob([JSON.stringify(out)], { type: 'model/gltf+json' }), base + '.gltf');
  } else if (format === 'obj') {
    download(new Blob([new OBJExporter().parse(root)], { type: 'text/plain' }), base + '.obj');
  } else {
    const dv = new STLExporter().parse(root, { binary: true });
    download(new Blob([dv], { type: 'model/stl' }), base + '.stl');
  }
  toast('Exported ' + base + '.' + format);
}

// ------------------------------------------------------------------ connector styles
/** save the current connector's settings as a reusable style (into resources/connectors/ when the server is running, otherwise as a download) */
export async function saveConnectorStyle(hall, name) {
  const c = hall.conn;
  const def = { format: 'ship-connector', version: 1, name, params: paramsOf(c) };
  const file = safeName(name) + '.connector.json';
  if (lib.hasServer) {
    const r = await fetch('resources/connectors/' + file, { method: 'POST', body: JSON.stringify(def, null, 1) });
    if (!r.ok) throw new Error('The server refused the file (' + r.status + ')');
    const id = 'res:resources/connectors/' + file;
    lib.connectors.set(id, { id, name, kind: 'proc', params: def.params, imported: false });
    c.style = id;
    c.params = {};
    toast('Saved resources/connectors/' + file);
  } else {
    download(new Blob([JSON.stringify(def, null, 1)], { type: 'application/json' }), file);
    toast('Downloaded ' + file + ' - put it in resources/connectors/');
  }
}
