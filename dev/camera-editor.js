/* ============================================
   CAMERA EDITOR — Interactive tool for finding
   camera positions and viewing angles.
   Uses direct Euler rotation (yaw/pitch) instead
   of lookAt to prevent the "model orbiting" effect.
   ============================================ */

(function () {
  'use strict';

  const DEG2RAD = Math.PI / 180;
  const RAD2DEG = 180 / Math.PI;

  let isOpen = false;
  let cameraOverride = false;
  let rotationPaused = false;

  // ===== DOM refs =====
  const panel      = document.getElementById('camera-editor');
  const toggleBtn  = document.getElementById('camera-toggle-btn');
  const closeBtn   = document.getElementById('camera-close-btn');
  const copyBtn    = document.getElementById('camera-copy-btn');
  const logBtn     = document.getElementById('camera-log-btn');
  const logOutput  = document.getElementById('camera-log-output');
  const liveToggle = document.getElementById('camera-live-toggle');
  const pauseRotBtn = document.getElementById('camera-pause-rot-btn');

  // Sliders
  const sl = {
    px:    document.getElementById('cam-px'),
    py:    document.getElementById('cam-py'),
    pz:    document.getElementById('cam-pz'),
    yaw:   document.getElementById('cam-yaw'),
    pitch: document.getElementById('cam-pitch'),
    fov:   document.getElementById('cam-fov'),
  };

  // Value displays
  const vl = {
    px:    document.getElementById('cv-px'),
    py:    document.getElementById('cv-py'),
    pz:    document.getElementById('cv-pz'),
    yaw:   document.getElementById('cv-yaw'),
    pitch: document.getElementById('cv-pitch'),
    fov:   document.getElementById('cv-fov'),
  };

  // ===== Compute lookAt point from position + yaw/pitch =====
  function getLookAtFromAngles() {
    const yawRad   = parseFloat(sl.yaw.value) * DEG2RAD;
    const pitchRad = parseFloat(sl.pitch.value) * DEG2RAD;
    const px = parseFloat(sl.px.value);
    const py = parseFloat(sl.py.value);
    const pz = parseFloat(sl.pz.value);

    // Direction vector from yaw/pitch (yaw=0 looks toward -Z, pitch=0 is level)
    const dx = Math.sin(yawRad) * Math.cos(pitchRad);
    const dy = Math.sin(pitchRad);
    const dz = -Math.cos(yawRad) * Math.cos(pitchRad);

    // lookAt = position + direction * distance
    const dist = 10;
    return {
      x: px + dx * dist,
      y: py + dy * dist,
      z: pz + dz * dist,
    };
  }

  // ===== Snap sliders from current camera =====
  function snapFromCamera() {
    if (typeof camera === 'undefined') return;
    sl.px.value = camera.position.x.toFixed(1);
    sl.py.value = camera.position.y.toFixed(1);
    sl.pz.value = camera.position.z.toFixed(1);

    // Extract yaw/pitch from current camera rotation
    // Camera uses default Euler order 'XYZ'
    // Yaw = rotation around Y axis, Pitch = rotation around X axis
    const euler = camera.rotation;
    sl.pitch.value = Math.round(euler.x * RAD2DEG);
    sl.yaw.value   = Math.round(euler.y * RAD2DEG);
    sl.fov.value   = Math.round(camera.fov);

    updateDisplays();
  }

  // ===== Update value displays =====
  function updateDisplays() {
    vl.px.textContent    = parseFloat(sl.px.value).toFixed(1);
    vl.py.textContent    = parseFloat(sl.py.value).toFixed(1);
    vl.pz.textContent    = parseFloat(sl.pz.value).toFixed(1);
    vl.yaw.textContent   = sl.yaw.value + '°';
    vl.pitch.textContent = sl.pitch.value + '°';
    vl.fov.textContent   = sl.fov.value + '°';
  }

  // ===== Apply sliders to camera =====
  function applyToCamera() {
    if (typeof camera === 'undefined' || !cameraOverride) return;

    camera.position.set(
      parseFloat(sl.px.value),
      parseFloat(sl.py.value),
      parseFloat(sl.pz.value)
    );

    // Set rotation directly via Euler — no lookAt, so position changes
    // won't cause the model to appear to rotate
    const yawRad   = parseFloat(sl.yaw.value) * DEG2RAD;
    const pitchRad = parseFloat(sl.pitch.value) * DEG2RAD;
    camera.rotation.set(pitchRad, yawRad, 0, 'YXZ');

    // FOV
    const newFov = parseFloat(sl.fov.value);
    if (Math.abs(camera.fov - newFov) > 0.01) {
      camera.fov = newFov;
      camera.updateProjectionMatrix();
    }

    updateDisplays();
  }

  // ===== Generate coordinate log =====
  function generateLog() {
    const lookAt = getLookAtFromAngles();
    const data = {
      _info: 'Vimicx Camera Coordinates — paste into your next prompt',
      position: {
        x: parseFloat(parseFloat(sl.px.value).toFixed(2)),
        y: parseFloat(parseFloat(sl.py.value).toFixed(2)),
        z: parseFloat(parseFloat(sl.pz.value).toFixed(2)),
      },
      rotation: {
        yaw: parseInt(sl.yaw.value),
        pitch: parseInt(sl.pitch.value),
      },
      lookAt: {
        x: parseFloat(lookAt.x.toFixed(2)),
        y: parseFloat(lookAt.y.toFixed(2)),
        z: parseFloat(lookAt.z.toFixed(2)),
      },
      _jsSnippet:
        `camera.position.set(${parseFloat(sl.px.value).toFixed(1)}, ${parseFloat(sl.py.value).toFixed(1)}, ${parseFloat(sl.pz.value).toFixed(1)});\n` +
        `camera.fov = ${sl.fov.value}; camera.updateProjectionMatrix();\n` +
        `camera.lookAt(${lookAt.x.toFixed(2)}, ${lookAt.y.toFixed(2)}, ${lookAt.z.toFixed(2)});`
    };
    const jsonStr = JSON.stringify(data, null, 2);
    return `// --- CAMERA SETTINGS START ---\n${jsonStr}\n// --- CAMERA SETTINGS END ---\n`;
  }

  window.vimicxEditorLogs['camera'] = generateLog;

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
    console.log('=== CAMERA COORDINATES ===');
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

    const canvas = document.getElementById('three-canvas');
    if (canvas) canvas.style.opacity = '1';

    snapFromCamera();
    cameraOverride = true;
    liveToggle.checked = true;
  }

  function closeEditor() {
    isOpen = false;
    cameraOverride = false;
    panel.style.display = 'none';
    toggleBtn.style.display = '';
    logOutput.style.display = 'none';
  }

  // ===== Expose flags globally =====
  Object.defineProperty(window, 'cameraEditorActive', {
    get: () => cameraOverride
  });

  Object.defineProperty(window, 'rotationPaused', {
    get: () => rotationPaused
  });

  // ===== Per-frame tick: enforce camera every frame =====
  function tick() {
    if (isOpen && typeof camera !== 'undefined') {
      if (cameraOverride) {
        // FORCE camera to slider values every frame
        camera.position.set(
          parseFloat(sl.px.value),
          parseFloat(sl.py.value),
          parseFloat(sl.pz.value)
        );
        const yawRad   = parseFloat(sl.yaw.value) * DEG2RAD;
        const pitchRad = parseFloat(sl.pitch.value) * DEG2RAD;
        camera.rotation.set(pitchRad, yawRad, 0, 'YXZ');

        // FOV
        const newFov = parseFloat(sl.fov.value);
        if (Math.abs(camera.fov - newFov) > 0.01) {
          camera.fov = newFov;
          camera.updateProjectionMatrix();
        }
      } else {
        // Read-only: show current camera values
        sl.px.value = camera.position.x.toFixed(1);
        sl.py.value = camera.position.y.toFixed(1);
        sl.pz.value = camera.position.z.toFixed(1);
        sl.pitch.value = Math.round(camera.rotation.x * RAD2DEG);
        sl.yaw.value   = Math.round(camera.rotation.y * RAD2DEG);
        sl.fov.value   = Math.round(camera.fov);
        updateDisplays();
      }
    }
    requestAnimationFrame(tick);
  }
  tick();

  // ===== Bind events =====
  function bindEvents() {
    toggleBtn.addEventListener('click', openEditor);
    closeBtn.addEventListener('click', closeEditor);
    copyBtn.addEventListener('click', copyCoords);
    logBtn.addEventListener('click', showLog);

    liveToggle.addEventListener('change', () => {
      cameraOverride = liveToggle.checked;
      if (cameraOverride) applyToCamera();
    });

    pauseRotBtn.addEventListener('click', () => {
      rotationPaused = !rotationPaused;
      pauseRotBtn.textContent = rotationPaused ? '▶ Resume Rotation' : '⏸ Pause Rotation';
    });

    // Slider input events
    Object.keys(sl).forEach(key => {
      sl[key].addEventListener('input', () => {
        updateDisplays();
        if (cameraOverride) applyToCamera();
      });
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
    if (typeof camera !== 'undefined') {
      clearInterval(check);
      console.log('[Camera Editor] Ready — click "📷 Camera" to start');
      if (isOpen) snapFromCamera();
    }
  }, 200);

})();
