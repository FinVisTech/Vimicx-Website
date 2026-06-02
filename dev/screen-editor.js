/* ============================================
   SCREEN EDITOR — Interactive tool for positioning
   holographic screens on the boat model.
   ============================================ */

(function () {
  'use strict';

  // ===== Helpers =====
  const RAD2DEG = 180 / Math.PI;
  const DEG2RAD = Math.PI / 180;
  function toDeg(rad) { return Math.round(rad * RAD2DEG); }
  function toRad(deg) { return parseFloat(deg) * DEG2RAD; }

  // ===== State =====
  // Each entry: { mesh, edges, grid, color(hex int), w, h }
  let editorScreens = [];
  let selectedIdx = -1;
  let isOpen = false;

  // ===== DOM refs =====
  const panel     = document.getElementById('screen-editor');
  const toggleBtn = document.getElementById('editor-toggle-btn');
  const closeBtn  = document.getElementById('editor-close-btn');
  const listEl    = document.getElementById('editor-screens-list');
  const addBtn    = document.getElementById('editor-add-btn');
  const dupBtn    = document.getElementById('editor-dup-btn');
  const delBtn    = document.getElementById('editor-del-btn');
  const exportBtn = document.getElementById('editor-export-btn');
  const logBtn    = document.getElementById('screen-log-btn');
  const logOutput = document.getElementById('editor-log-output');

  // Sliders
  const sl = {
    px: document.getElementById('es-px'),
    py: document.getElementById('es-py'),
    pz: document.getElementById('es-pz'),
    rx: document.getElementById('es-rx'),
    ry: document.getElementById('es-ry'),
    rz: document.getElementById('es-rz'),
    w:  document.getElementById('es-w'),
    h:  document.getElementById('es-h'),
    color: document.getElementById('es-color'),
  };
  // Value displays
  const vl = {
    px: document.getElementById('ev-px'),
    py: document.getElementById('ev-py'),
    pz: document.getElementById('ev-pz'),
    rx: document.getElementById('ev-rx'),
    ry: document.getElementById('ev-ry'),
    rz: document.getElementById('ev-rz'),
    w:  document.getElementById('ev-w'),
    h:  document.getElementById('ev-h'),
  };

  // ===== Wait for boat to be ready =====
  function waitForBoat(cb) {
    const check = setInterval(() => {
      if (typeof boatLoaded !== 'undefined' && boatLoaded && typeof boatGroup !== 'undefined') {
        clearInterval(check);
        cb();
      }
    }, 200);
  }

  // ===== Sync editorScreens from main.js screenMeshes =====
  function syncFromMain() {
    editorScreens = [];
    // screenMeshes contains both the main planes and grid planes (alternating)
    // screenEdges contains one entry per screen
    // The main planes are at even indices, grids at odd indices in screenMeshes
    const mainPlanes = [];
    const gridPlanes = [];
    for (let i = 0; i < screenMeshes.length; i++) {
      if (screenMeshes[i].material.wireframe) {
        gridPlanes.push(screenMeshes[i]);
      } else {
        mainPlanes.push(screenMeshes[i]);
      }
    }

    for (let i = 0; i < mainPlanes.length; i++) {
      const mesh = mainPlanes[i];
      const edges = screenEdges[i] || null;
      const grid = gridPlanes[i] || null;
      const params = mesh.geometry.parameters || { width: 0.5, height: 0.35 };
      editorScreens.push({
        mesh,
        edges,
        grid,
        color: mesh.material.color.getHex(),
        w: params.width,
        h: params.height,
      });
    }
  }

  // ===== Rebuild the screen list buttons =====
  function rebuildList() {
    listEl.innerHTML = '';
    editorScreens.forEach((s, i) => {
      const btn = document.createElement('button');
      btn.className = 'editor-screen-btn' + (i === selectedIdx ? ' active' : '');
      btn.textContent = 'Screen ' + (i + 1);
      btn.style.borderLeftColor = '#' + s.color.toString(16).padStart(6, '0');
      btn.addEventListener('click', () => selectScreen(i));
      listEl.appendChild(btn);
    });
  }

  // ===== Select a screen =====
  function selectScreen(idx) {
    // Unhighlight previous
    if (selectedIdx >= 0 && editorScreens[selectedIdx]) {
      const prev = editorScreens[selectedIdx];
      if (prev.edges) prev.edges.material.opacity = 0.9;
    }

    selectedIdx = idx;
    rebuildList();

    if (idx < 0 || idx >= editorScreens.length) return;

    const s = editorScreens[idx];
    const m = s.mesh;

    // Highlight selected with bright edges
    if (s.edges) {
      s.edges.material.color.set(0xffffff);
      s.edges.material.opacity = 1;
    }

    // Update sliders (rotation: radians → degrees for UI)
    sl.px.value = m.position.x;
    sl.py.value = m.position.y;
    sl.pz.value = m.position.z;
    sl.rx.value = toDeg(m.rotation.x);
    sl.ry.value = toDeg(m.rotation.y);
    sl.rz.value = toDeg(m.rotation.z);
    sl.w.value = s.w;
    sl.h.value = s.h;
    sl.color.value = '#' + s.color.toString(16).padStart(6, '0');

    updateValueDisplays();
  }

  // ===== Update value displays =====
  function updateValueDisplays() {
    vl.px.textContent = parseFloat(sl.px.value).toFixed(2);
    vl.py.textContent = parseFloat(sl.py.value).toFixed(2);
    vl.pz.textContent = parseFloat(sl.pz.value).toFixed(2);
    vl.rx.textContent = sl.rx.value + '°';
    vl.ry.textContent = sl.ry.value + '°';
    vl.rz.textContent = sl.rz.value + '°';
    vl.w.textContent = parseFloat(sl.w.value).toFixed(2);
    vl.h.textContent = parseFloat(sl.h.value).toFixed(2);
  }

  // ===== Apply slider values to selected screen =====
  function applySliders() {
    if (selectedIdx < 0 || selectedIdx >= editorScreens.length) return;
    const s = editorScreens[selectedIdx];
    const m = s.mesh;

    // Position
    m.position.set(parseFloat(sl.px.value), parseFloat(sl.py.value), parseFloat(sl.pz.value));
    // Rotation (degrees → radians)
    m.rotation.set(toRad(sl.rx.value), toRad(sl.ry.value), toRad(sl.rz.value));

    // Sync edges and grid
    if (s.edges) {
      s.edges.position.copy(m.position);
      s.edges.rotation.copy(m.rotation);
    }
    if (s.grid) {
      s.grid.position.copy(m.position);
      // Slight forward offset
      const fwd = new THREE.Vector3(0, 0, 0.002);
      fwd.applyEuler(m.rotation);
      s.grid.position.add(fwd);
      s.grid.rotation.copy(m.rotation);
    }

    // Size — need to rebuild geometry if changed
    const newW = parseFloat(sl.w.value);
    const newH = parseFloat(sl.h.value);
    if (Math.abs(newW - s.w) > 0.001 || Math.abs(newH - s.h) > 0.001) {
      s.w = newW;
      s.h = newH;
      // Replace geometry
      m.geometry.dispose();
      m.geometry = new THREE.PlaneGeometry(newW, newH);
      if (s.edges) {
        s.edges.geometry.dispose();
        s.edges.geometry = new THREE.EdgesGeometry(m.geometry);
      }
      if (s.grid) {
        s.grid.geometry.dispose();
        s.grid.geometry = new THREE.PlaneGeometry(newW * 0.85, newH * 0.85, 4, 3);
      }
    }

    // Color
    const newColor = parseInt(sl.color.value.replace('#', ''), 16);
    if (newColor !== s.color) {
      s.color = newColor;
      m.material.color.set(newColor);
      if (s.grid) s.grid.material.color.set(newColor);
      // Keep edges white while selected for visibility; store color for export
      rebuildList(); // update list button border colors
    }

    updateValueDisplays();
  }

  // ===== Add a new screen =====
  function addScreen() {
    if (!boatGroup) return;

    const w = 0.4, h = 0.3;
    const color = 0x0C9AA1;

    const geo = new THREE.PlaneGeometry(w, h);
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.7, side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, 1, 0);
    boatGroup.add(mesh);
    screenMeshes.push(mesh);

    // Edges
    const edgeGeo = new THREE.EdgesGeometry(geo);
    const edgeMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 });
    const edges = new THREE.LineSegments(edgeGeo, edgeMat);
    edges.position.copy(mesh.position);
    boatGroup.add(edges);
    screenEdges.push(edges);

    // Grid
    const gridGeo = new THREE.PlaneGeometry(w * 0.85, h * 0.85, 4, 3);
    const gridMat = new THREE.MeshBasicMaterial({
      color, wireframe: true, transparent: true, opacity: 0.25
    });
    const grid = new THREE.Mesh(gridGeo, gridMat);
    grid.position.copy(mesh.position);
    grid.position.z += 0.002;
    boatGroup.add(grid);
    screenMeshes.push(grid);

    editorScreens.push({ mesh, edges, grid, color, w, h });
    selectScreen(editorScreens.length - 1);
    rebuildList();
  }

  // ===== Duplicate selected screen =====
  function duplicateScreen() {
    if (selectedIdx < 0 || selectedIdx >= editorScreens.length) return;
    const src = editorScreens[selectedIdx];

    const w = src.w, h = src.h, color = src.color;
    const geo = new THREE.PlaneGeometry(w, h);
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.7, side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(src.mesh.position);
    mesh.position.x += 0.3; // offset so it's visible
    mesh.rotation.copy(src.mesh.rotation);
    boatGroup.add(mesh);
    screenMeshes.push(mesh);

    const edgeGeo = new THREE.EdgesGeometry(geo);
    const edgeMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 });
    const edges = new THREE.LineSegments(edgeGeo, edgeMat);
    edges.position.copy(mesh.position);
    edges.rotation.copy(mesh.rotation);
    boatGroup.add(edges);
    screenEdges.push(edges);

    const gridGeo = new THREE.PlaneGeometry(w * 0.85, h * 0.85, 4, 3);
    const gridMat = new THREE.MeshBasicMaterial({
      color, wireframe: true, transparent: true, opacity: 0.25
    });
    const grid = new THREE.Mesh(gridGeo, gridMat);
    grid.position.copy(mesh.position);
    const fwd = new THREE.Vector3(0, 0, 0.002);
    fwd.applyEuler(mesh.rotation);
    grid.position.add(fwd);
    grid.rotation.copy(mesh.rotation);
    boatGroup.add(grid);
    screenMeshes.push(grid);

    editorScreens.push({ mesh, edges, grid, color, w, h });
    selectScreen(editorScreens.length - 1);
    rebuildList();
  }

  // ===== Delete selected screen =====
  function deleteScreen() {
    if (selectedIdx < 0 || selectedIdx >= editorScreens.length) return;
    const s = editorScreens[selectedIdx];

    // Remove from scene
    if (s.mesh) { boatGroup.remove(s.mesh); s.mesh.geometry.dispose(); }
    if (s.edges) { boatGroup.remove(s.edges); s.edges.geometry.dispose(); }
    if (s.grid) { boatGroup.remove(s.grid); s.grid.geometry.dispose(); }

    // Remove from main arrays
    screenMeshes = screenMeshes.filter(m => m !== s.mesh && m !== s.grid);
    screenEdges = screenEdges.filter(e => e !== s.edges);
    // Update the global refs (main.js uses these)
    window.screenMeshes = screenMeshes;
    window.screenEdges = screenEdges;

    editorScreens.splice(selectedIdx, 1);
    selectedIdx = Math.min(selectedIdx, editorScreens.length - 1);
    rebuildList();
    if (selectedIdx >= 0) selectScreen(selectedIdx);
  }

  // ===== Generate export log =====
  function generateLog() {
    const log = {
      _info: 'Vimicx Screen Layout — paste this log into your next prompt',
      _axes: 'X = boat length (bow at +X), Z = beam/width, Y = height',
      screenCount: editorScreens.length,
      screens: editorScreens.map((s, i) => ({
        index: i,
        label: 'Screen ' + (i + 1),
        position: {
          x: parseFloat(s.mesh.position.x.toFixed(3)),
          y: parseFloat(s.mesh.position.y.toFixed(3)),
          z: parseFloat(s.mesh.position.z.toFixed(3)),
        },
        rotation: {
          x: parseFloat(s.mesh.rotation.x.toFixed(3)),
          y: parseFloat(s.mesh.rotation.y.toFixed(3)),
          z: parseFloat(s.mesh.rotation.z.toFixed(3)),
        },
        size: {
          width: parseFloat(s.w.toFixed ? s.w.toFixed(3) : s.w),
          height: parseFloat(s.h.toFixed ? s.h.toFixed(3) : s.h),
        },
        color: '#' + s.color.toString(16).padStart(6, '0'),
      })),
    };
    const jsonStr = JSON.stringify(log, null, 2);
    return `// --- SCREEN SETTINGS START ---\n${jsonStr}\n// --- SCREEN SETTINGS END ---\n`;
  }

  window.vimicxEditorLogs['screens'] = generateLog;

  function exportToClipboard() {
    const text = generateLog();
    navigator.clipboard.writeText(text).then(() => {
      exportBtn.textContent = '✅ Copied!';
      setTimeout(() => { exportBtn.textContent = '📋 Copy Log to Clipboard'; }, 2000);
    }).catch(() => {
      // Fallback: show in the pre element
      logOutput.style.display = 'block';
      logOutput.textContent = text;
    });
  }

  function showLogConsole() {
    const text = generateLog();
    console.log('=== SCREEN LAYOUT LOG ===');
    console.log(text);
    logOutput.style.display = logOutput.style.display === 'block' ? 'none' : 'block';
    logOutput.textContent = text;
  }

  // ===== Open / Close editor =====
  function openEditor() {
    isOpen = true;
    editorMode = true;
    panel.style.display = 'flex';
    toggleBtn.style.display = 'none';
    document.body.classList.add('editor-active');

    // Scroll to top so the 3D canvas is visible
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Hide page content so only the 3D scene is visible
    document.getElementById('hero').style.opacity = '0';
    document.getElementById('hero').style.pointerEvents = 'none';

    // Make canvas full opacity
    const canvas = document.getElementById('three-canvas');
    canvas.style.opacity = '1';

    // Freeze boat rotation and reset to clean state
    if (boatGroup) {
      boatGroup.rotation.y = 0;
      boatGroup.position.y = 0.3;
    }

    // Make all screens fully visible
    screenMeshes.forEach(m => {
      m.material.opacity = m.material.wireframe ? 0.25 : 0.7;
    });
    screenEdges.forEach(e => {
      e.material.opacity = 0.9;
    });

    // Enable orbit controls
    if (!orbitControls) {
      orbitControls = new THREE.OrbitControls(camera, renderer.domElement);
      orbitControls.enableDamping = true;
      orbitControls.dampingFactor = 0.08;
      orbitControls.target.set(0, 0.3, 0);
    }
    orbitControls.enabled = true;

    // Sync screens and build list
    syncFromMain();
    rebuildList();
    if (editorScreens.length > 0) selectScreen(0);
  }

  function closeEditor() {
    isOpen = false;
    editorMode = false;
    panel.style.display = 'none';
    toggleBtn.style.display = '';
    document.body.classList.remove('editor-active');

    // Restore hero section
    document.getElementById('hero').style.opacity = '';
    document.getElementById('hero').style.pointerEvents = '';

    // Disable orbit controls
    if (orbitControls) orbitControls.enabled = false;

    // Reset edges back to screen colors
    editorScreens.forEach(s => {
      if (s.edges) s.edges.material.color.set(s.color);
    });

    logOutput.style.display = 'none';
  }

  // ===== Bind events =====
  function bindEvents() {
    toggleBtn.addEventListener('click', openEditor);
    closeBtn.addEventListener('click', closeEditor);
    addBtn.addEventListener('click', addScreen);
    dupBtn.addEventListener('click', duplicateScreen);
    delBtn.addEventListener('click', deleteScreen);
    exportBtn.addEventListener('click', exportToClipboard);
    if (logBtn) logBtn.addEventListener('click', showLogConsole);

    // Slider input events
    Object.keys(sl).forEach(key => {
      sl[key].addEventListener('input', applySliders);
    });

    // Preset buttons for quick tilt/yaw
    document.querySelectorAll('.editor-presets button').forEach(btn => {
      btn.addEventListener('click', () => {
        const deg = parseInt(btn.dataset.deg);
        const presetRow = btn.closest('.editor-presets');
        // Determine which rotation axis this preset row belongs to
        if (presetRow.id === 'presets-rx') {
          sl.rx.value = deg;
        } else if (presetRow.id === 'presets-ry') {
          sl.ry.value = deg;
        }
        applySliders();
      });
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (!isOpen) return;
      if (e.key === 'Escape') closeEditor();
      // Arrow keys to cycle screens
      if (e.key === 'ArrowLeft' && selectedIdx > 0) {
        selectScreen(selectedIdx - 1);
      }
      if (e.key === 'ArrowRight' && selectedIdx < editorScreens.length - 1) {
        selectScreen(selectedIdx + 1);
      }
    });
  }

  // ===== Boot =====
  bindEvents();
  waitForBoat(() => {
    // Auto-sync if the toggle is clicked before screens are ready
    console.log('[Screen Editor] Ready — click "Edit Screens" to start');
  });

})();
