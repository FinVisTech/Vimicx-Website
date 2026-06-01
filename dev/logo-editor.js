/* ============================================
   LOGO EDITOR â€” Interactive tool for editing
   the logo sizes (icon and text) at top and bottom.
   ============================================ */

(function () {
  'use strict';

  let isOpen = false;

  // ===== DOM refs =====
  const panel      = document.getElementById('logo-editor');
  const toggleBtn  = document.getElementById('logo-toggle-btn');
  const closeBtn   = document.getElementById('logo-close-btn');
  const copyBtn    = document.getElementById('logo-copy-btn');
  const logBtn     = document.getElementById('logo-log-btn');
  const logOutput  = document.getElementById('logo-log-output');

  // Sliders
  const inputs = {
    iconSize: document.getElementById('logo-icon-size'),
    textSize: document.getElementById('logo-text-size')
  };

  // Value displays
  const vals = {
    iconSize: document.getElementById('lv-icon-size'),
    textSize: document.getElementById('lv-text-size')
  };

  const icons = document.querySelectorAll('.nav-logo-icon');
  const textLogos = document.querySelectorAll('.nav-logo');

  // ===== Update value displays =====
  function updateDisplays() {
    vals.iconSize.textContent = inputs.iconSize.value;
    vals.textSize.textContent = parseFloat(inputs.textSize.value).toFixed(1);
  }

  // ===== Apply sliders to DOM elements =====
  function applyToDOM() {
    icons.forEach(icon => {
      icon.style.width = inputs.iconSize.value + 'px';
      icon.style.height = inputs.iconSize.value + 'px';
    });
    textLogos.forEach(logo => {
      logo.style.fontSize = inputs.textSize.value + 'rem';
    });
    updateDisplays();
  }

  // ===== Generate snippet log =====
  function generateLog() {
    const snippet = 
      `/* --- Logo Size Settings (Update in style.css) --- */\n` +
      `.nav-logo {\n` +
      `  font-size: ${parseFloat(inputs.textSize.value).toFixed(1)}rem;\n` +
      `}\n\n` +
      `.nav-logo-icon {\n` +
      `  width: ${inputs.iconSize.value}px;\n` +
      `  height: ${inputs.iconSize.value}px;\n` +
      `}\n`;
    return `/* --- LOGO SETTINGS START --- */\n${snippet}/* --- LOGO SETTINGS END --- */\n`;
  }

  window.vimicxEditorLogs['logo'] = generateLog;

  function copySettings() {
    const text = generateLog();
    navigator.clipboard.writeText(text).then(() => {
      copyBtn.textContent = 'âœ… Copied!';
      setTimeout(() => { copyBtn.textContent = 'ðŸ“‹ Copy Settings'; }, 2000);
    }).catch(() => {
      logOutput.style.display = 'block';
      logOutput.textContent = text;
    });
  }

  function showLog() {
    const text = generateLog();
    console.log('=== LOGO SETTINGS ===');
    console.log(text);
    logOutput.style.display = logOutput.style.display === 'block' ? 'none' : 'block';
    logOutput.textContent = text;
  }

  // ===== Open / Close =====
  function openEditor() {
    isOpen = true;
    panel.style.display = 'flex';
    toggleBtn.style.display = 'none';
    updateDisplays();
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
          applyToDOM();
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
  console.log('[Logo Editor] Ready — click "🖼️ Logo" to start');

})();
