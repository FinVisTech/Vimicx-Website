/* ============================================
   BOAT EDITOR — Interactive tool for moving
   and styling the bass boat model.
   ============================================ */

(function () {
  'use strict';

  const DEG2RAD = Math.PI / 180;
  const RAD2DEG = 180 / Math.PI;

  let isOpen = false;

  // ===== DOM refs =====
  const panel      = document.getElementById('boat-editor');
  const toggleBtn  = document.getElementById('boat-toggle-btn');
  const closeBtn   = document.getElementById('boat-close-btn');
  const copyBtn    = document.getElementById('boat-copy-btn');
  const logBtn     = document.getElementById('boat-log-btn');
  const logOutput  = document.getElementById('boat-log-output');

  // Sliders
  const sl = {
    px:    document.getElementById('boat-px'),
    py:    document.getElementById('boat-py'),
    pz:    document.getElementById('boat-pz'),
    yaw:   document.getElementById('boat-yaw'),
    pitch: document.getElementById('boat-pitch'),
    roll:  document.getElementById('boat-roll'),
    scale: document.getElementById('boat-scale'),
    color: document.getElementById('boat-color')
  };

  // Value displays
  const vl = {
    px:    document.getElementById('bo-px'),
    py:    document.getElementById('bo-py'),
    pz:    document.getElementById('bo-pz'),
    yaw:   document.getElementById('bo-yaw'),
    pitch: document.getElementById('bo-pitch'),
    roll:  document.getElementById('bo-roll'),
    scale: document.getElementById('bo-scale')
  };

  // ===== Snap sliders from current boat model =====
  function snapFromBoat() {
    if (typeof boatGroup === 'undefined' || !boatGroup) return;
    sl.px.value = boatGroup.position.x.toFixed(2);
    sl.py.value = boatGroup.position.y.toFixed(2);
    sl.pz.value = boatGroup.position.z.toFixed(2);

    const euler = boatGroup.rotation;
    sl.pitch.value = Math.round(euler.x * RAD2DEG);
    sl.yaw.value   = Math.round(euler.y * RAD2DEG);
    sl.roll.value  = Math.round(euler.z * RAD2DEG);

    sl.scale.value = boatGroup.scale.x.toFixed(2);

    const hull = boatGroup.children.find(c => c.name === 'hull');
    if (hull && hull.material) {
      sl.color.value = '#' + hull.material.color.getHexString();
    }

    updateDisplays();
  }

  // ===== Update value displays =====
  function updateDisplays() {
    vl.px.textContent    = parseFloat(sl.px.value).toFixed(2);
    vl.py.textContent    = parseFloat(sl.py.value).toFixed(2);
    vl.pz.textContent    = parseFloat(sl.pz.value).toFixed(2);
    vl.yaw.textContent   = sl.yaw.value + '°';
    vl.pitch.textContent = sl.pitch.value + '°';
    vl.roll.textContent  = sl.roll.value + '°';
    vl.scale.textContent = parseFloat(sl.scale.value).toFixed(2);
  }

  // ===== Apply sliders to boat model =====
  function applyToBoat() {
    if (typeof boatGroup === 'undefined' || !boatGroup) return;

    boatGroup.position.set(
      parseFloat(sl.px.value),
      parseFloat(sl.py.value),
      parseFloat(sl.pz.value)
    );

    const yawRad   = parseFloat(sl.yaw.value) * DEG2RAD;
    const pitchRad = parseFloat(sl.pitch.value) * DEG2RAD;
    const rollRad  = parseFloat(sl.roll.value) * DEG2RAD;
    boatGroup.rotation.set(pitchRad, yawRad, rollRad, 'YXZ');

    const scale = parseFloat(sl.scale.value);
    boatGroup.scale.set(scale, scale, scale);

    if (sl.color.value) {
      const hex = sl.color.value.replace('#', '0x');
      const colorVal = parseInt(hex, 16);
      const hull = boatGroup.children.find(c => c.name === 'hull');
      if (hull && hull.material) {
        hull.material.color.setHex(colorVal);
      }
    }

    if (window.vimixBoatConfig && window.vimixBoatConfig.updateFromEditor) {
      window.vimixBoatConfig.updateFromEditor({
        pos: [parseFloat(sl.px.value), parseFloat(sl.py.value), parseFloat(sl.pz.value)],
        rot: [parseFloat(sl.pitch.value) * DEG2RAD, parseFloat(sl.yaw.value) * DEG2RAD, parseFloat(sl.roll.value) * DEG2RAD],
        scale: parseFloat(sl.scale.value),
        color: sl.color.value || '#ffffff'
      });
    }

    updateDisplays();
  }

  // ===== Generate coordinate log =====
  function generateLog() {
    const data = {
      _info: 'Vimix Boat Coordinates',
      position: {
        x: parseFloat(parseFloat(sl.px.value).toFixed(2)),
        y: parseFloat(parseFloat(sl.py.value).toFixed(2)),
        z: parseFloat(parseFloat(sl.pz.value).toFixed(2)),
      },
      rotation: {
        yaw: parseInt(sl.yaw.value),
        pitch: parseInt(sl.pitch.value),
        roll: parseInt(sl.roll.value),
      },
      scale: parseFloat(parseFloat(sl.scale.value).toFixed(2)),
      color: sl.color.value,
      _jsSnippet:
        `boatGroup.position.set(${parseFloat(sl.px.value).toFixed(2)}, ${parseFloat(sl.py.value).toFixed(2)}, ${parseFloat(sl.pz.value).toFixed(2)});\n` +
        `boatGroup.rotation.set(${parseInt(sl.pitch.value)} * DEG2RAD, ${parseInt(sl.yaw.value)} * DEG2RAD, ${parseInt(sl.roll.value)} * DEG2RAD, 'YXZ');\n` +
        `boatGroup.scale.set(${parseFloat(sl.scale.value).toFixed(2)}, ${parseFloat(sl.scale.value).toFixed(2)}, ${parseFloat(sl.scale.value).toFixed(2)});\n` +
        `const hull = boatGroup.children.find(c => c.name === 'hull');\n` +
        `if (hull) hull.material.color.setHex(${sl.color.value.replace('#', '0x')});`
    };
    const jsonStr = JSON.stringify(data, null, 2);
    return `// --- BOAT SETTINGS START ---\n${jsonStr}\n// --- BOAT SETTINGS END ---\n`;
  }

  window.vimixEditorLogs['boat'] = generateLog;

  function copyCoords() {
    const text = generateLog();
    navigator.clipboard.writeText(text).then(() => {
      copyBtn.textContent = '✅ Copied!';
      setTimeout(() => { copyBtn.textContent = '📋 Copy Settings'; }, 2000);
    }).catch(() => {
      logOutput.style.display = 'block';
      logOutput.textContent = text;
    });
  }


  function showLog() {
    const text = generateLog();
    console.log('=== BOAT COORDINATES ===');
    console.log(text);
    logOutput.style.display = logOutput.style.display === 'block' ? 'none' : 'block';
    logOutput.textContent = text;
  }

  // ===== Open / Close =====
  function openEditor() {
    isOpen = true;
    panel.style.display = 'flex';
    toggleBtn.style.display = 'none';

    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Mark as globally active so main.js updateScene() stops overwriting the boat's rotation
    window.boatEditorActive = true;

    snapFromBoat();
  }

  function closeEditor() {
    isOpen = false;
    window.boatEditorActive = false;
    panel.style.display = 'none';
    toggleBtn.style.display = '';
    logOutput.style.display = 'none';
  }

  // ===== Per-frame tick: enforce boat transform every frame =====
  function tick() {
    if (isOpen && typeof boatGroup !== 'undefined' && boatGroup) {
      boatGroup.position.set(
        parseFloat(sl.px.value),
        parseFloat(sl.py.value),
        parseFloat(sl.pz.value)
      );
      const yawRad   = parseFloat(sl.yaw.value) * DEG2RAD;
      const pitchRad = parseFloat(sl.pitch.value) * DEG2RAD;
      const rollRad  = parseFloat(sl.roll.value) * DEG2RAD;
      boatGroup.rotation.set(pitchRad, yawRad, rollRad, 'YXZ');

      const scale = parseFloat(sl.scale.value);
      boatGroup.scale.set(scale, scale, scale);
      
      if (sl.color.value) {
        const hex = sl.color.value.replace('#', '0x');
        const colorVal = parseInt(hex, 16);
        const hull = boatGroup.children.find(c => c.name === 'hull');
        if (hull && hull.material) {
          hull.material.color.setHex(colorVal);
        }
      }
    }
    requestAnimationFrame(tick);
  }
  tick();

  // ===== Bind events =====
  function bindEvents() {
    if (toggleBtn) toggleBtn.addEventListener('click', openEditor);
    if (closeBtn) closeBtn.addEventListener('click', closeEditor);
    if (copyBtn) copyBtn.addEventListener('click', copyCoords);
    if (logBtn) logBtn.addEventListener('click', showLog);

    // Slider input events
    Object.keys(sl).forEach(key => {
      if (sl[key]) {
        sl[key].addEventListener('input', () => {
          updateDisplays();
          applyToBoat();
        });
      }
    });

    // Keyboard
    document.addEventListener('keydown', (e) => {
      if (!isOpen) return;
      if (e.key === 'Escape') closeEditor();
    });
  }

  // ===== Boot =====
  bindEvents();
  const check = setInterval(() => {
    if (typeof boatLoaded !== 'undefined' && boatLoaded && typeof boatGroup !== 'undefined') {
      clearInterval(check);
      console.log('[Boat Editor] Ready — click "🚤 Boat" to start');
      if (isOpen) snapFromBoat();
    }
  }, 200);

})();
