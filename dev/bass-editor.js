/* ============================================
   BASS EDITOR — Interactive tool for moving
   the low-poly bass model.
   ============================================ */

(function () {
  'use strict';

  const DEG2RAD = Math.PI / 180;
  const RAD2DEG = 180 / Math.PI;

  let isOpen = false;

  // ===== DOM refs =====
  const panel      = document.getElementById('bass-editor');
  const toggleBtn  = document.getElementById('bass-toggle-btn');
  const closeBtn   = document.getElementById('bass-close-btn');
  const copyBtn    = document.getElementById('bass-copy-btn');
  const logBtn     = document.getElementById('bass-log-btn');
  const logOutput  = document.getElementById('bass-log-output');

  // Sliders
  const sl = {
    px:    document.getElementById('bass-px'),
    py:    document.getElementById('bass-py'),
    pz:    document.getElementById('bass-pz'),
    yaw:   document.getElementById('bass-yaw'),
    pitch: document.getElementById('bass-pitch'),
    roll:  document.getElementById('bass-roll'),
    scale: document.getElementById('bass-scale')
  };

  // Value displays
  const vl = {
    px:    document.getElementById('bv-px'),
    py:    document.getElementById('bv-py'),
    pz:    document.getElementById('bv-pz'),
    yaw:   document.getElementById('bv-yaw'),
    pitch: document.getElementById('bv-pitch'),
    roll:  document.getElementById('bv-roll'),
    scale: document.getElementById('bv-scale')
  };

  // ===== Snap sliders from current bass model =====
  function snapFromBass() {
    if (typeof bassModelGroup === 'undefined' || !bassModelGroup) return;
    sl.px.value = bassModelGroup.position.x.toFixed(1);
    sl.py.value = bassModelGroup.position.y.toFixed(1);
    sl.pz.value = bassModelGroup.position.z.toFixed(1);

    const euler = bassModelGroup.rotation;
    sl.pitch.value = Math.round(euler.x * RAD2DEG);
    sl.yaw.value   = Math.round(euler.y * RAD2DEG);
    sl.roll.value  = Math.round(euler.z * RAD2DEG);

    sl.scale.value = bassModelGroup.scale.x.toFixed(2);

    updateDisplays();
  }

  // ===== Update value displays =====
  function updateDisplays() {
    vl.px.textContent    = parseFloat(sl.px.value).toFixed(1);
    vl.py.textContent    = parseFloat(sl.py.value).toFixed(1);
    vl.pz.textContent    = parseFloat(sl.pz.value).toFixed(1);
    vl.yaw.textContent   = sl.yaw.value + '°';
    vl.pitch.textContent = sl.pitch.value + '°';
    vl.roll.textContent  = sl.roll.value + '°';
    vl.scale.textContent = parseFloat(sl.scale.value).toFixed(2);
  }

  // ===== Apply sliders to bass model =====
  function applyToBass() {
    if (typeof bassModelGroup === 'undefined' || !bassModelGroup) return;

    bassModelGroup.position.set(
      parseFloat(sl.px.value),
      parseFloat(sl.py.value),
      parseFloat(sl.pz.value)
    );

    const yawRad   = parseFloat(sl.yaw.value) * DEG2RAD;
    const pitchRad = parseFloat(sl.pitch.value) * DEG2RAD;
    const rollRad  = parseFloat(sl.roll.value) * DEG2RAD;
    bassModelGroup.rotation.set(pitchRad, yawRad, rollRad, 'YXZ');

    const scale = parseFloat(sl.scale.value);
    bassModelGroup.scale.set(scale, scale, scale);

    updateDisplays();
  }

  // ===== Generate coordinate log =====
  function generateLog() {
    const data = {
      _info: 'Vimicx Bass Coordinates',
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
      _jsSnippet:
        `bassModelGroup.position.set(${parseFloat(sl.px.value).toFixed(2)}, ${parseFloat(sl.py.value).toFixed(2)}, ${parseFloat(sl.pz.value).toFixed(2)});\n` +
        `bassModelGroup.rotation.set(${parseInt(sl.pitch.value)} * DEG2RAD, ${parseInt(sl.yaw.value)} * DEG2RAD, ${parseInt(sl.roll.value)} * DEG2RAD, 'YXZ');\n` +
        `bassModelGroup.scale.set(${parseFloat(sl.scale.value).toFixed(2)}, ${parseFloat(sl.scale.value).toFixed(2)}, ${parseFloat(sl.scale.value).toFixed(2)});`
    };
    return JSON.stringify(data, null, 2);
  }

  function copyCoords() {
    const text = generateLog();
    navigator.clipboard.writeText(text).then(() => {
      copyBtn.textContent = '✅ Copied!';
      setTimeout(() => { copyBtn.textContent = '📋 Copy Coordinates'; }, 2000);
    }).catch(() => {
      logOutput.style.display = 'block';
      logOutput.textContent = text;
    });
  }

  function showLog() {
    const text = generateLog();
    console.log('=== BASS COORDINATES ===');
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

    // Make sure bass is visible when editing
    if (typeof bassModelGroup !== 'undefined' && bassModelGroup) {
      bassModelGroup.visible = true;
    }

    snapFromBass();
  }

  function closeEditor() {
    isOpen = false;
    panel.style.display = 'none';
    toggleBtn.style.display = '';
    logOutput.style.display = 'none';
  }

  // ===== Per-frame tick: enforce bass transform every frame =====
  function tick() {
    if (isOpen && typeof bassModelGroup !== 'undefined' && bassModelGroup) {
      bassModelGroup.position.set(
        parseFloat(sl.px.value),
        parseFloat(sl.py.value),
        parseFloat(sl.pz.value)
      );
      const yawRad   = parseFloat(sl.yaw.value) * DEG2RAD;
      const pitchRad = parseFloat(sl.pitch.value) * DEG2RAD;
      const rollRad  = parseFloat(sl.roll.value) * DEG2RAD;
      bassModelGroup.rotation.set(pitchRad, yawRad, rollRad, 'YXZ');

      const scale = parseFloat(sl.scale.value);
      bassModelGroup.scale.set(scale, scale, scale);
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
          applyToBass();
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
  const check = setInterval(() => {
    if (typeof bassModelGroup !== 'undefined') {
      clearInterval(check);
      bindEvents();
      console.log('[Bass Editor] Ready — click "🐟 Bass" to start');
    }
  }, 200);

})();
