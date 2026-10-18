import * as THREE from 'three';
import { app, loadAutosave } from './app.js';
import { loadManifest } from './assets.js';
import { ShipView } from './shipview.js';
import { Viewport } from './viewport.js';
import { initUI } from './ui.js';
import { toast } from './util.js';
import * as paint from './paint.js';
import { registerProcTextures } from './proctex.js';
import { rebuildModel } from './modelbuilder.js';
import './layout.js';

const scene = new THREE.Scene();
app.sv = new ShipView(app, scene);
app.vp = new Viewport(document.getElementById('view'), app, app.sv, scene);
window.app = app; // handy in the browser console

let lastBuild = 0;
app.onFrame = () => {
  paint.flush();
  const D = app.dirty, sv = app.sv, now = performance.now();
  if (D.hull) {
    // rebuilds are throttled to what the machine can sustain, so dragging a slider stays smooth
    if (now - lastBuild < Math.max(100, sv.buildMs * 2.5)) return;      // rebuilds block the page: leave most of the time free for the mouse
    D.hull = D.conn = D.atts = D.mats = false;
    sv.rebuildHull();
    sv.refreshMaterials();
    lastBuild = performance.now();
    app.vp.fitLights();
    app.vp.applyAmbient();
    app.vp.syncGizmo();
    if (!app.vp.gizmoDragging && !app.vp.reloc) app.vp.clearDragGhost();
    if (app.model) { D.model = false; rebuildModel(); }
    if (app.frameAfterBuild) { app.frameAfterBuild = false; app.vp.frame(sv.bounds); }
    app.emit('built');
    return;
  }
  if (D.model) { D.model = false; if (app.model) rebuildModel(); else if (app.vp.modelGroup) { app.vp.scene.remove(app.vp.modelGroup); app.vp.modelGroup = null; } }
  if (D.bridges) { D.bridges = false; sv.rebuildBridges(); sv.updateBounds(); }
  if (D.lights) { D.lights = false; app.vp.syncLights(); app.vp.syncGizmo(); }
  if (D.mats) { D.mats = false; sv.refreshMaterials(); }
  if (D.conn) { D.conn = false; sv.rebuildConns(); }
  if (D.atts) { D.atts = false; sv.syncAtts(); sv.updateBounds(); app.vp.syncLights(); app.vp.syncGizmo(); }
};

registerProcTextures();
try {
  await loadManifest();
} catch (e) {
  console.warn(e);
}
const fatal = (what, e) => {                       // never leave the page on "Loading…": say what went wrong and offer a way out
  console.error(what, e);
  const box = document.getElementById('loading');
  box.classList.remove('done');
  box.replaceChildren(
    Object.assign(document.createElement('div'), { textContent: what + ': ' + (e?.message || e), style: 'max-width:560px;margin:0 auto 12px;white-space:pre-wrap' }),
    Object.assign(document.createElement('button'), { className: 'btn', textContent: 'Clear the saved session and reload', onclick: () => { try { localStorage.removeItem('shipdesigner.autosave.v1'); } catch (err) { /* ignore */ } location.search = '?fresh=1'; } }),
    Object.assign(document.createElement('button'), { className: 'btn', style: 'margin-left:8px', textContent: 'Continue anyway', onclick: () => box.classList.add('done') }));
};
try { initUI(); } catch (e) { fatal('The panels failed to start', e); }
if (!location.search.includes('fresh')) {
  try { loadAutosave(); } catch (e) { fatal('Your last session could not be restored', e); }
}
app.restored = true;                               // from here on the session is saved as you work
if (!app.ship.halls.length) app.actions.commit();
if (!document.getElementById('loading').firstElementChild) document.getElementById('loading').classList.add('done');
if (!app.vp.renderer.capabilities.isWebGL2) toast('This browser has limited WebGL support.');
