/* ============================================
   WATER EDITOR — Interactive tool for water
   surface material properties.
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
    color:     document.getElementById('wt-color'),
    specular:  document.getElementById('wt-specular'),
    shininess: document.getElementById('wt-shininess'),
    opacity:   document.getElementById('wt-opacity')
  };

  // Value displays
  const vals = {
    shininess: document.getElementById('wv-shininess'),
    opacity:   document.getElementById('wv-opacity')
  };

  // ===== Snap inputs from current scene state =====
  function snapFromScene() {
    if (typeof waterPlane === 'undefined' || !waterPlane) return;

    const mat = waterPlane.material;
    if (mat) {
      if (mat.color) inputs.color.value = '#' + mat.color.getHexString();
      if (mat.specular) inputs.specular.value = '#' + mat.specular.getHexString();
      if (mat.shininess !== undefined) inputs.shininess.value = mat.shininess;
      if (mat.opacity !== undefined) inputs.opacity.value = mat.opacity;
    }

    updateDisplays();
  }

  // ===== Update value displays =====
  function updateDisplays() {
    vals.shininess.textContent = inputs.shininess.value;
    vals.opacity.textContent   = parseFloat(inputs.opacity.value).toFixed(2);
  }

  // ===== Apply sliders to scene =====
  function applyToScene() {
    if (typeof waterPlane === 'undefined' || !waterPlane) return;

    const mat = waterPlane.material;
    if (mat) {
      if (inputs.color.value) {
        mat.color.setHex(parseInt(inputs.color.value.replace('#', '0x'), 16));
      }
      if (inputs.specular.value) {
        mat.specular.setHex(parseInt(inputs.specular.value.replace('#', '0x'), 16));
      }
      mat.shininess = parseFloat(inputs.shininess.value);
      mat.opacity = parseFloat(inputs.opacity.value);
    }

    updateDisplays();
  }

  // ===== Generate snippet log =====
  function generateLog() {
    const snippet = 
      `// --- Water Material Settings ---\n` +
      `const waterMat = new THREE.MeshPhongMaterial({\n` +
      `  color: ${inputs.color.value.replace('#', '0x')},\n` +
      `  specular: ${inputs.specular.value.replace('#', '0x')},\n` +
      `  shininess: ${inputs.shininess.value},\n` +
      `  transparent: true,\n` +
      `  opacity: ${parseFloat(inputs.opacity.value).toFixed(2)},\n` +
      `  side: THREE.DoubleSide,\n` +
      `  flatShading: false\n` +
      `});\n`;
    return `// --- WATER SETTINGS START ---\n${snippet}// --- WATER SETTINGS END ---\n`;
  }

  window.vimicxEditorLogs['water'] = generateLog;

  function copySettings() {
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
    window.waterEditorActive = true; // Signal to main.js to keep water visible if needed

    window.scrollTo({ top: 0, behavior: 'smooth' });

    snapFromScene();
  }

  function closeEditor() {
    isOpen = false;
    panel.style.display = 'none';
    toggleBtn.style.display = '';
    logOutput.style.display = 'none';
    window.waterEditorActive = false;
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
          applyToScene();
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
    if (typeof waterPlane !== 'undefined' && waterPlane) {
      clearInterval(check);
      console.log('[Water Editor] Ready — click "🌊 Water" to start');
      if (isOpen) snapFromScene();
    }
  }, 200);

})();
