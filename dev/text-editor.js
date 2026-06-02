/* ============================================
   TEXT EDITOR
   Renders draggable bars in the Scroll Control
   timeline representing text animation windows.
   Each bar: left handle (fade-in start) |
             FV mark (fully visible) |
             FO mark (fade-out start) |
             right handle (fully gone)
   ============================================ */
(function () {
  'use strict';

  // ===== Config =====
  const BAR_H        = 8;    // bar height px
  const MARK_TOP     = 20;   // top of protrusion (px from track top, above rail)
  const MIN_GAP      = 0.004;
  const FLICKER_TOP  = 40;   // flicker bar
  const GLASSES_TOP  = 50;   // glasses rise bar
  const ROW_TOPS     = [62, 73, 84, 95]; // text item rows

  // ===== State =====
  let items = [];       // section-local copies
  let selectedId = null;
  let trackEl = null;
  let barsEl = null;

  // ===== API accessor =====
  function api() { return window.vimicxTextConfig || null; }

  // ===== Coordinate helpers =====
  function toCam(item) {
    const a = api();
    return a ? a.toCameraProgress(item) : { start: 0, fullyVisible: 0, fadeOutStart: 0, end: 1 };
  }

  function fromCam(item, cp) {
    const a = api();
    return a ? a.fromCameraProgress(item, cp) : cp;
  }

  function pct(v) { return (v * 100).toFixed(4) + '%'; }

  function trackP(event) {
    if (!trackEl) return 0;
    const r = trackEl.getBoundingClientRect();
    return Math.max(0, Math.min(1, (event.clientX - r.left) / Math.max(1, r.width)));
  }

  // ===== Flicker bar helpers =====
  function flickerApi() { return window.vimicxFlickerConfig || null; }

  function flickerToCam(fc) {
    const he = api() ? api().getHeroEnd() : 0.167;
    const tp = x => he + (1 - he) * x;
    return { start: tp(fc.start), end: tp(fc.end) };
  }

  function flickerFromCam(cp) {
    const he = api() ? api().getHeroEnd() : 0.167;
    const inv = x => he < 1 ? Math.max(0, Math.min(1, (x - he) / (1 - he))) : 0;
    return { start: inv(cp.start), end: inv(cp.end) };
  }

  function renderFlickerBar() {
    const fa = flickerApi();
    if (!fa) return;
    const fc = fa.get();
    const cp = flickerToCam(fc);
    const top = FLICKER_TOP;

    // Bar body
    const body = document.createElement('div');
    body.className = 'tbar-body tbar-flicker-body';
    body.dataset.flickerPart = 'body';
    body.style.cssText = `position:absolute; left:${pct(cp.start)}; width:${pct(Math.max(0, cp.end - cp.start))}; top:${top}px; height:${BAR_H}px; background:rgba(12,154,161,0.22); border:1px solid rgba(12,154,161,0.60); border-radius:3px; box-sizing:border-box; cursor:grab; pointer-events:all;`;
    body.title = 'Screen Flicker';
    barsEl.appendChild(body);

    // Left handle
    const lh = document.createElement('div');
    lh.className = 'tbar-handle';
    lh.dataset.flickerPart = 'lh';
    lh.style.cssText = `position:absolute; left:${pct(cp.start)}; top:${top - 3}px; transform:translateX(-50%);`;
    barsEl.appendChild(lh);

    // Right handle
    const rh = document.createElement('div');
    rh.className = 'tbar-handle';
    rh.dataset.flickerPart = 'rh';
    rh.style.cssText = `position:absolute; left:${pct(cp.end)}; top:${top - 3}px; transform:translateX(-50%);`;
    barsEl.appendChild(rh);

    // Label
    const lbl = document.createElement('div');
    lbl.className = 'tbar-label';
    lbl.style.cssText = `position:absolute; left:${pct(cp.start)}; top:${top + BAR_H + 2}px; color:rgba(12,184,200,0.75);`;
    lbl.textContent = 'Screen Flicker';
    barsEl.appendChild(lbl);
  }

  function beginFlickerDrag(event, mode) {
    event.preventDefault();
    event.stopPropagation();
    const fa = flickerApi();
    if (!fa) return;
    const fcOrig = fa.get();
    const cpOrig = flickerToCam(fcOrig);
    const p0 = trackP(event);
    const barLen = cpOrig.end - cpOrig.start;

    function onMove(e) {
      const delta = trackP(e) - p0;
      let cp = { ...cpOrig };
      if (mode === 'body') {
        const s = Math.max(0, Math.min(1 - barLen, cpOrig.start + delta));
        cp.start = s; cp.end = s + barLen;
      } else if (mode === 'lh') {
        cp.start = Math.max(0, Math.min(cpOrig.end - MIN_GAP, cpOrig.start + delta));
      } else if (mode === 'rh') {
        cp.end = Math.max(cpOrig.start + MIN_GAP, Math.min(1, cpOrig.end + delta));
      }
      fa.set(flickerFromCam(cp));
      render();
    }
    function onUp() {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      if (window.vimicxSaveManager) window.vimicxSaveManager.notifyChange();
    }
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }

  // ===== Glasses rise bar helpers =====
  function glassesApi() { return window.vimicxGlassesRise || null; }

  function glassesToCam(gc) {
    const he = api() ? api().getHeroEnd() : 0.167;
    const tp = x => he + (1 - he) * x;
    return { start: tp(gc.start), end: tp(gc.end) };
  }

  function glassesFromCam(cp) {
    const he = api() ? api().getHeroEnd() : 0.167;
    const inv = x => he < 1 ? Math.max(0, Math.min(1, (x - he) / (1 - he))) : 0;
    return { start: inv(cp.start), end: inv(cp.end) };
  }

  function renderGlassesBar() {
    const ga = glassesApi();
    if (!ga) return;
    const gc = ga.get();
    const cp = glassesToCam(gc);
    const top = GLASSES_TOP;

    const body = document.createElement('div');
    body.className = 'tbar-body tbar-glasses-body';
    body.dataset.glassesPart = 'body';
    body.style.cssText = `position:absolute; left:${pct(cp.start)}; width:${pct(Math.max(0, cp.end - cp.start))}; top:${top}px; height:${BAR_H}px; background:rgba(200,155,30,0.22); border:1px solid rgba(220,185,60,0.65); border-radius:3px; box-sizing:border-box; cursor:grab; pointer-events:all;`;
    body.title = 'Glasses Rise';
    barsEl.appendChild(body);

    const lh = document.createElement('div');
    lh.className = 'tbar-handle';
    lh.dataset.glassesPart = 'lh';
    lh.style.cssText = `position:absolute; left:${pct(cp.start)}; top:${top - 3}px; transform:translateX(-50%); background:rgba(220,185,60,0.85);`;
    barsEl.appendChild(lh);

    const rh = document.createElement('div');
    rh.className = 'tbar-handle';
    rh.dataset.glassesPart = 'rh';
    rh.style.cssText = `position:absolute; left:${pct(cp.end)}; top:${top - 3}px; transform:translateX(-50%); background:rgba(220,185,60,0.85);`;
    barsEl.appendChild(rh);

    const lbl = document.createElement('div');
    lbl.className = 'tbar-label';
    lbl.style.cssText = `position:absolute; left:${pct(cp.start)}; top:${top + BAR_H + 2}px; color:rgba(220,185,60,0.75);`;
    lbl.textContent = 'Glasses Rise';
    barsEl.appendChild(lbl);
  }

  function beginGlassesDrag(event, mode) {
    event.preventDefault();
    event.stopPropagation();
    const ga = glassesApi();
    if (!ga) return;
    const gcOrig = ga.get();
    const cpOrig = glassesToCam(gcOrig);
    const p0 = trackP(event);
    const barLen = cpOrig.end - cpOrig.start;

    function onMove(e) {
      const delta = trackP(e) - p0;
      let cp = { ...cpOrig };
      if (mode === 'body') {
        const s = Math.max(0, Math.min(1 - barLen, cpOrig.start + delta));
        cp.start = s; cp.end = s + barLen;
      } else if (mode === 'lh') {
        cp.start = Math.max(0, Math.min(cpOrig.end - MIN_GAP, cpOrig.start + delta));
      } else if (mode === 'rh') {
        cp.end = Math.max(cpOrig.start + MIN_GAP, Math.min(1, cpOrig.end + delta));
      }
      ga.set(glassesFromCam(cp));
      render();
    }
    function onUp() {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      if (window.vimicxSaveManager) window.vimicxSaveManager.notifyChange();
    }
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }

  // ===== Render =====
  function rowTop(idx) { return ROW_TOPS[Math.min(idx, ROW_TOPS.length - 1)]; }

  function render() {
    if (!barsEl) return;
    barsEl.innerHTML = '';

    items.forEach((item, idx) => {
      const cp   = toCam(item);
      const top  = rowTop(idx);
      const sel  = item.id === selectedId;
      const prot = top - MARK_TOP + BAR_H; // protrusion height (mark top → bar bottom)

      // ── Bar body ──
      const body = el('div', 'tbar-body' + (sel ? ' is-selected' : ''), {
        left:  pct(cp.start),
        width: pct(Math.max(0, cp.end - cp.start)),
        top:   top + 'px',
        height: BAR_H + 'px'
      }, item.id);
      body.title = item.label;
      barsEl.appendChild(body);

      // ── Left handle (move start) ──
      barsEl.appendChild(el('div', 'tbar-handle tbar-lh', {
        left: pct(cp.start),
        top:  (top - 3) + 'px'
      }, item.id));

      // ── Right handle (move end) ──
      barsEl.appendChild(el('div', 'tbar-handle tbar-rh', {
        left: pct(cp.end),
        top:  (top - 3) + 'px'
      }, item.id));

      // ── Fully-visible mark (gold, protrudes up) ──
      barsEl.appendChild(el('div', 'tbar-mark tbar-fv', {
        left:   pct(cp.fullyVisible),
        top:    MARK_TOP + 'px',
        height: prot + 'px'
      }, item.id, 'Fully Visible'));

      // ── Fade-out-start mark (orange, protrudes up) ──
      barsEl.appendChild(el('div', 'tbar-mark tbar-fo', {
        left:   pct(cp.fadeOutStart),
        top:    MARK_TOP + 'px',
        height: prot + 'px'
      }, item.id, 'Fade Out Start'));

      // ── Label ──
      const lbl = el('div', 'tbar-label', {
        left: pct(cp.start),
        top:  (top + BAR_H + 2) + 'px'
      }, item.id);
      lbl.textContent = item.label;
      barsEl.appendChild(lbl);

      // ── Delete button (only when selected) ──
      if (sel) {
        const del = el('button', 'tbar-del', {
          left: pct(cp.end),
          top:  (top - 10) + 'px'
        }, item.id);
        del.textContent = '×';
        del.title = 'Delete ' + item.label;
        barsEl.appendChild(del);
      }
    });

    renderFlickerBar();
    renderGlassesBar();
  }

  // small helper — creates a positioned absolute div with data-id
  function el(tag, cls, styles, id, title) {
    const node = document.createElement(tag);
    node.className = cls;
    node.dataset.id = id;
    node.style.position = 'absolute';
    Object.assign(node.style, styles);
    if (title) node.title = title;
    return node;
  }

  // ===== Commit =====
  function commit(updatedItem) {
    items = items.map(i => i.id === updatedItem.id ? updatedItem : i);
    api().setItems(items);
    render();
    if (window.vimicxSaveManager) window.vimicxSaveManager.notifyChange();
  }

  // ===== Drag =====
  function beginDrag(event, item, mode) {
    event.preventDefault();
    event.stopPropagation();
    selectedId = item.id;
    render();

    const cpOrig   = toCam(item);
    const pOrig    = trackP(event);
    const barLen   = cpOrig.end - cpOrig.start;

    function onMove(e) {
      const delta = trackP(e) - pOrig;
      let cp = { ...cpOrig };

      if (mode === 'body') {
        const s = Math.max(0, Math.min(1 - barLen, cpOrig.start + delta));
        cp.start        = s;
        cp.end          = s + barLen;
        cp.fullyVisible = Math.max(s, Math.min(s + barLen, cpOrig.fullyVisible + delta));
        cp.fadeOutStart = Math.max(cp.fullyVisible + MIN_GAP, Math.min(s + barLen, cpOrig.fadeOutStart + delta));
      } else if (mode === 'lh') {
        cp.start = Math.max(0, Math.min(cpOrig.fullyVisible - MIN_GAP, cpOrig.start + delta));
      } else if (mode === 'rh') {
        cp.end = Math.max(cpOrig.fadeOutStart + MIN_GAP, Math.min(1, cpOrig.end + delta));
      } else if (mode === 'fv') {
        cp.fullyVisible = Math.max(cpOrig.start + MIN_GAP, Math.min(cpOrig.fadeOutStart - MIN_GAP, cpOrig.fullyVisible + delta));
      } else if (mode === 'fo') {
        cp.fadeOutStart = Math.max(cpOrig.fullyVisible + MIN_GAP, Math.min(cpOrig.end - MIN_GAP, cpOrig.fadeOutStart + delta));
      }

      const local = fromCam(item, cp);
      const updated = { ...item, ...local };
      items = items.map(i => i.id === item.id ? updated : i);
      api().setItems(items);
      render();
    }

    function onUp() {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      if (window.vimicxSaveManager) window.vimicxSaveManager.notifyChange();
    }

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }

  // ===== Event delegation on bars container =====
  function onPointerdown(event) {
    // ── Flicker bar ──
    const flickerPart = event.target.dataset.flickerPart ||
                        event.target.closest('[data-flicker-part]')?.dataset.flickerPart;
    if (flickerPart) { beginFlickerDrag(event, flickerPart); return; }

    // ── Glasses rise bar ──
    const glassesPart = event.target.dataset.glassesPart ||
                        event.target.closest('[data-glasses-part]')?.dataset.glassesPart;
    if (glassesPart) { beginGlassesDrag(event, glassesPart); return; }

    const body = event.target.closest('.tbar-body');
    const lh   = event.target.closest('.tbar-lh');
    const rh   = event.target.closest('.tbar-rh');
    const fv   = event.target.closest('.tbar-fv');
    const fo   = event.target.closest('.tbar-fo');
    const del  = event.target.closest('.tbar-del');

    const hit = body || lh || rh || fv || fo || del;
    if (!hit) return;

    const id   = hit.dataset.id;
    const item = items.find(i => i.id === id);
    if (!item) return;

    if (del) {
      event.preventDefault();
      event.stopPropagation();
      deleteItem(id);
      return;
    }

    const mode = body ? 'body' : lh ? 'lh' : rh ? 'rh' : fv ? 'fv' : 'fo';
    beginDrag(event, item, mode);
  }

  // ===== Add / Delete =====
  function addItem() {
    const a = api();
    if (!a) return;
    const newItem = a.addItem({
      section: 'transform',
      label: 'New Text',
      content: 'New Text',
      start: 0.45, fullyVisible: 0.48, fadeOutStart: 0.52, end: 0.55
    });
    items = a.getItems();
    selectedId = newItem.id;
    render();
    if (window.vimicxSaveManager) window.vimicxSaveManager.notifyChange();
  }

  function deleteItem(id) {
    const a = api();
    if (!a) return;
    a.removeItem(id);
    items = a.getItems();
    if (selectedId === id) selectedId = null;
    render();
    if (window.vimicxSaveManager) window.vimicxSaveManager.notifyChange();
  }

  // ===== Init =====
  function init() {
    trackEl = document.getElementById('camera-scroll-track');
    barsEl  = document.getElementById('camera-text-bars');
    const addBtn = document.getElementById('camera-text-add-btn');

    if (!trackEl || !barsEl || !api()) return false;

    items = api().getItems();
    render();

    barsEl.addEventListener('pointerdown', onPointerdown);

    // Deselect when clicking bare track area
    trackEl.addEventListener('click', e => {
      if (!e.target.closest('.tbar-body') && !e.target.closest('.tbar-handle') &&
          !e.target.closest('.tbar-mark')  && !e.target.closest('.tbar-del')) {
        selectedId = null;
        render();
      }
    });

    if (addBtn) addBtn.addEventListener('click', addItem);

    // Refresh bars when Scroll Control opens (heroEnd may differ after resize)
    const openBtn = document.getElementById('camera-path-open-scroll-btn');
    if (openBtn) openBtn.addEventListener('click', () => setTimeout(render, 60));

    // Expose for external refresh (save-manager cancel)
    window.vimicxTextEditorRefresh = () => { items = api() ? api().getItems() : []; render(); };
    window.vimicxFlickerEditorRefresh = render;

    return true;
  }

  // Wait for DOM elements and main.js API to be ready
  const ready = setInterval(() => {
    if (window.vimicxTextConfig && document.getElementById('camera-text-bars')) {
      clearInterval(ready);
      init();
    }
  }, 150);
})();
