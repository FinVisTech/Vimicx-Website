/* ============================================
   SCENE EDITOR — Interactive tool for global
   scene settings, lights, and fog.
   ============================================ */

(function () {
  'use strict';

  let isOpen = false;

  // ===== DOM refs =====
  const panel      = document.getElementById('scene-editor');
  const toggleBtn  = document.getElementById('scene-toggle-btn');
  const closeBtn   = document.getElementById('scene-close-btn');
  const copyBtn    = document.getElementById('scene-copy-btn');
  const logBtn     = document.getElementById('scene-log-btn');
  const logOutput  = document.getElementById('scene-log-output');

  // Sliders and Colors
  const inputs = {
    bgColor:    document.getElementById('sc-bg-color'),
    fogColor:   document.getElementById('sc-fog-color'),
    fogDensity: document.getElementById('sc-fog-density'),

    globalToggle: document.getElementById('sc-global-toggle'),
    globalColor:  document.getElementById('sc-global-color'),

    ambColor:   document.getElementById('sc-amb-color'),
    ambInt:     document.getElementById('sc-amb-int'),

    dirColor:   document.getElementById('sc-dir-color'),
    dirInt:     document.getElementById('sc-dir-int'),

    cyanColor:  document.getElementById('sc-cyan-color'),
    cyanInt:    document.getElementById('sc-cyan-int'),

    magColor:   document.getElementById('sc-mag-color'),
    magInt:     document.getElementById('sc-mag-int')
  };

  // Value displays
  const vals = {
    fogDensity: document.getElementById('sv-fog-density'),
    ambInt:     document.getElementById('sv-amb-int'),
    dirInt:     document.getElementById('sv-dir-int'),
    cyanInt:    document.getElementById('sv-cyan-int'),
    magInt:     document.getElementById('sv-mag-int')
  };

  // ===== Snap inputs from current scene state =====
  function snapFromScene() {
    if (typeof scene === 'undefined' || !scene) return;

    // Background Color
    if (typeof renderer !== 'undefined') {
      const clearColor = new THREE.Color();
      renderer.getClearColor(clearColor);
      inputs.bgColor.value = '#' + clearColor.getHexString();
    }

    // Fog
    if (scene.fog) {
      inputs.fogColor.value = '#' + scene.fog.color.getHexString();
      inputs.fogDensity.value = scene.fog.density.toFixed(3);
    }

    // Lights
    if (typeof ambientLight !== 'undefined' && ambientLight) {
      inputs.ambColor.value = '#' + ambientLight.color.getHexString();
      inputs.ambInt.value = ambientLight.intensity.toFixed(2);
    }
    if (typeof dirLight !== 'undefined' && dirLight) {
      inputs.dirColor.value = '#' + dirLight.color.getHexString();
      inputs.dirInt.value = dirLight.intensity.toFixed(2);
    }
    if (typeof pointCyan !== 'undefined' && pointCyan) {
      inputs.cyanColor.value = '#' + pointCyan.color.getHexString();
      inputs.cyanInt.value = pointCyan.intensity.toFixed(2);
    }
    if (typeof pointMagenta !== 'undefined' && pointMagenta) {
      inputs.magColor.value = '#' + pointMagenta.color.getHexString();
      inputs.magInt.value = pointMagenta.intensity.toFixed(2);
    }

    updateDisplays();
  }

  // ===== Update value displays =====
  function updateDisplays() {
    vals.fogDensity.textContent = parseFloat(inputs.fogDensity.value).toFixed(3);
    vals.ambInt.textContent     = parseFloat(inputs.ambInt.value).toFixed(2);
    vals.dirInt.textContent     = parseFloat(inputs.dirInt.value).toFixed(2);
    vals.cyanInt.textContent    = parseFloat(inputs.cyanInt.value).toFixed(2);
    vals.magInt.textContent     = parseFloat(inputs.magInt.value).toFixed(2);
  }

  // ===== Apply sliders to scene =====
  function applyToScene() {
    if (typeof scene === 'undefined' || !scene) return;

    // Background Color
    if (typeof renderer !== 'undefined' && inputs.bgColor.value) {
      const hex = parseInt(inputs.bgColor.value.replace('#', '0x'), 16);
      renderer.setClearColor(hex, 1);
    }

    // Fog
    if (scene.fog) {
      if (inputs.fogColor.value) {
        scene.fog.color.setHex(parseInt(inputs.fogColor.value.replace('#', '0x'), 16));
      }
      scene.fog.density = parseFloat(inputs.fogDensity.value);
    }

    const useGlobal = inputs.globalToggle && inputs.globalToggle.checked;
    const globalHex = (useGlobal && inputs.globalColor && inputs.globalColor.value) ? parseInt(inputs.globalColor.value.replace('#', '0x'), 16) : null;

    // Lights
    if (typeof ambientLight !== 'undefined' && ambientLight) {
      if (useGlobal) {
        ambientLight.color.setHex(globalHex);
      } else if (inputs.ambColor.value) {
        ambientLight.color.setHex(parseInt(inputs.ambColor.value.replace('#', '0x'), 16));
      }
      ambientLight.intensity = parseFloat(inputs.ambInt.value);
    }
    if (typeof dirLight !== 'undefined' && dirLight) {
      if (useGlobal) {
        dirLight.color.setHex(globalHex);
      } else if (inputs.dirColor.value) {
        dirLight.color.setHex(parseInt(inputs.dirColor.value.replace('#', '0x'), 16));
      }
      dirLight.intensity = parseFloat(inputs.dirInt.value);
    }
    if (typeof pointCyan !== 'undefined' && pointCyan) {
      if (useGlobal) {
        pointCyan.color.setHex(globalHex);
      } else if (inputs.cyanColor.value) {
        pointCyan.color.setHex(parseInt(inputs.cyanColor.value.replace('#', '0x'), 16));
      }
      pointCyan.intensity = parseFloat(inputs.cyanInt.value);
    }
    if (typeof pointMagenta !== 'undefined' && pointMagenta) {
      if (useGlobal) {
        pointMagenta.color.setHex(globalHex);
      } else if (inputs.magColor.value) {
        pointMagenta.color.setHex(parseInt(inputs.magColor.value.replace('#', '0x'), 16));
      }
      pointMagenta.intensity = parseFloat(inputs.magInt.value);
    }

    updateDisplays();
  }

  // ===== Generate snippet log =====
  function generateLog() {
    const useGlobal = inputs.globalToggle && inputs.globalToggle.checked;
    
    const cAmb  = useGlobal ? inputs.globalColor.value : inputs.ambColor.value;
    const cDir  = useGlobal ? inputs.globalColor.value : inputs.dirColor.value;
    const cCyan = useGlobal ? inputs.globalColor.value : inputs.cyanColor.value;
    const cMag  = useGlobal ? inputs.globalColor.value : inputs.magColor.value;

    const snippet = 
      `// --- Global Scene Settings (Paste into main.js init function) ---\n` +
      `renderer.setClearColor(${inputs.bgColor.value.replace('#', '0x')}, 1);\n` +
      `scene.fog = new THREE.FogExp2(${inputs.fogColor.value.replace('#', '0x')}, ${parseFloat(inputs.fogDensity.value).toFixed(3)});\n` +
      `\n` +
      `// Lights\n` +
      `ambientLight = new THREE.AmbientLight(${cAmb.replace('#', '0x')}, ${parseFloat(inputs.ambInt.value).toFixed(2)});\n` +
      `scene.add(ambientLight);\n` +
      `\n` +
      `dirLight = new THREE.DirectionalLight(${cDir.replace('#', '0x')}, ${parseFloat(inputs.dirInt.value).toFixed(2)});\n` +
      `dirLight.position.set(5, 8, 5);\n` +
      `scene.add(dirLight);\n` +
      `\n` +
      `pointCyan = new THREE.PointLight(${cCyan.replace('#', '0x')}, ${parseFloat(inputs.cyanInt.value).toFixed(2)}, 20);\n` +
      `pointCyan.position.set(-3, 4, 2);\n` +
      `scene.add(pointCyan);\n` +
      `\n` +
      `pointMagenta = new THREE.PointLight(${cMag.replace('#', '0x')}, ${parseFloat(inputs.magInt.value).toFixed(2)}, 15);\n` +
      `pointMagenta.position.set(3, 2, -2);\n` +
      `scene.add(pointMagenta);\n`;

    return snippet;
  }

  window.vimicxEditorLogs['scene'] = generateLog;

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
    console.log('=== SCENE SETTINGS ===');
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

    snapFromScene();
  }

  function closeEditor() {
    isOpen = false;
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
    if (typeof scene !== 'undefined' && scene) {
      clearInterval(check);
      console.log('[Scene Editor] Ready — click "🌍 Scene" to start');
      if (isOpen) snapFromScene();
    }
  }, 200);

})();
