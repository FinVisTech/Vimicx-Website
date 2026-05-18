/* ============================================
   WATER EDITOR — Interactive tool for editing
   the water surface material.
   ============================================ */

(function () {
  'use strict';

  let isOpen = false;

  // ===== DOM refs =====
  const panel      = document.getElementById('water-editor');
  const toggleBtn  = document.getElementById('water-toggle-btn');
  const closeBtn   = document.getElementById('water-close-btn');
  const copyBtn    = document.getElementById('water-copy-btn');
  const logBtn     = document.getElementById('water-log-btn');
  const logOutput  = document.getElementById('water-log-output');

  // Sliders and Colors
  const inputs = {
    color:    document.getElementById('wt-color'),
    specular: document.getElementById('wt-specular'),
    shininess: document.getElementById('wt-shininess'),
    opacity:   document.getElementById('wt-opacity'),
  };

  // Value displays
  const vals = {
    shininess: document.getElementById('wv-shininess'),
    opacity:   document.getElementById('wv-opacity'),
  };

  // ===== Snap inputs from current water state =====
  function snapFromWater() {
    if (typeof waterPlane === 'undefined' || !waterPlane) return;

    if (waterPlane.material) {
      inputs.color.value = '#' + waterPlane.material.color.getHexString();
      inputs.specular.value = '#' + waterPlane.material.specular.getHexString();
      inputs.shininess.value = waterPlane.material.shininess;
      inputs.opacity.value = waterPlane.material.opacity.toFixed(2);
    }

    updateDisplays();
  }

  // ===== Update value displays =====
  function updateDisplays() {
    vals.shininess.textContent = parseFloat(inputs.shininess.value).toFixed(1);
    vals.opacity.textContent   = parseFloat(inputs.opacity.value).toFixed(2);
  }

  // ===== Apply sliders to water plane =====
  function applyToWater() {
    if (typeof waterPlane === 'undefined' || !waterPlane) return;

    if (waterPlane.material) {
      if (inputs.color.value) waterPlane.material.color.setHex(parseInt(inputs.color.value.replace('#', '0x'), 16));
      if (inputs.specular.value) waterPlane.material.specular.setHex(parseInt(inputs.specular.value.replace('#', '0x'), 16));
      waterPlane.material.shininess = parseFloat(inputs.shininess.value);
      // We don't overwrite opacity during normal animation because updateScene overrides it
      // But in dev mode, we can override it temporarily or just log it.
    }

    updateDisplays();
  }

  // Override tick loop to freeze opacity at slider value when editor is open
  function tick() {
    if (isOpen && typeof waterPlane !== 'undefined' && waterPlane && waterPlane.material) {
      waterPlane.material.opacity = parseFloat(inputs.opacity.value);
    }
    requestAnimationFrame(tick);
  }
  tick();

  // ===== Generate snippet log =====
  function generateLog() {
    const snippet = 
      `// --- Water Material Settings (Update in buildWater() in main.js) ---\n` +
      `const waterMat = new THREE.MeshPhongMaterial({\n` +
      `  color: ${inputs.color.value.replace('#', '0x')},\n` +
      `  specular: ${inputs.specular.value.replace('#', '0x')},\n` +
      `  shininess: ${parseFloat(inputs.shininess.value).toFixed(1)},\n` +
      `  transparent: true,\n` +
      `  opacity: ${parseFloat(inputs.opacity.value).toFixed(2)},\n` +
      `  side: THREE.DoubleSide,\n` +
      `  flatShading: false\n` +
      `});\n`;
    return snippet;
  }

  window.vimicxEditorLogs['water'] = generateLog;

  function copySettings() {
    if (window.copyAllDevSettings) {
      window.copyAllDevSettings(copyBtn);
    } else {
      const text = generateLog();
      navigator.clipboard.writeText(text).then(() => {
        copyBtn.textContent = '✅ Copied!';
        setTimeout(() => { copyBtn.textContent = '📋 Copy Settings'; }, 2000);
      }).catch(() => {
        logOutput.style.display = 'block';
        logOutput.textContent = text;
      });
    }
  }


  function showLog() {
    const text = generateLog();
    console.log('=== WATER SETTINGS ===');
    console.log(text);
    logOutput.style.display = logOutput.style.display === 'block' ? 'none' : 'block';
    logOutput.textContent = text;
  }

  // ===== Open / Close =====
  function openEditor() {
    isOpen = true;
    panel.style.display = 'flex';
    toggleBtn.style.display = 'none';
    window.waterEditorActive = true;

    // Make sure it's visible so we can edit it
    if (waterPlane) waterPlane.visible = true;

    snapFromWater();
  }

  function closeEditor() {
    isOpen = false;
    window.waterEditorActive = false;
    panel.style.display = 'none';
    toggleBtn.style.display = '';
    logOutput.style.display = 'none';
  }

  // ===== Bind events =====
  function bindEvents() {
    if (toggleBtn) toggleBtn.addEventListener('click', openEditor);
    if (closeBtn) closeBtn.addEventListener('click', closeEditor);
    if (copyBtn) copyBtn.addEventListener('click', copySettings);
    if (logBtn) logBtn.addEventListener('click', showLog);

    // Input events
    Object.keys(inputs).forEach(key => {
      if (inputs[key]) {
        inputs[key].addEventListener('input', () => {
          updateDisplays();
          applyToWater();
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
    if (typeof waterPlane !== 'undefined' && waterPlane) {
      clearInterval(check);
      bindEvents();
      console.log('[Water Editor] Ready — click "🌊 Water" to start');
    }
  }, 200);

})();
