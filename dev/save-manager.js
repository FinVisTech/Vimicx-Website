/* ============================================
   SAVE MANAGER
   Tracks unsaved changes across all dev tools.
   Exposes Save / Cancel UI and POST to dev-server.py.
   ============================================ */
(function () {
  'use strict';

  let savedSnapshot = null;  // last state committed to scene-config.json
  let saveBar = null;
  let saveBtn = null;
  let cancelBtn = null;

  // ===== Snapshot helpers =====

  function getCurrentConfig() {
    const config = {};
    const pathApi = window.vimicxCameraPath;
    if (pathApi) config.cameraPath = pathApi.hasOverride() ? pathApi.getPath() : null;
    const textApi = window.vimicxTextConfig;
    if (textApi) config.textItems = textApi.getItems();
    const flickApi = window.vimicxFlickerConfig;
    if (flickApi) config.screenFlicker = flickApi.get();
    const glassApi = window.vimicxGlassesRise;
    if (glassApi) config.glassesRise = glassApi.get();
    return config;
  }

  function snapshotsEqual(a, b) {
    if (!a || !b) return false;
    return JSON.stringify(a) === JSON.stringify(b);
  }

  // ===== Save bar visibility =====

  function updateSaveBar() {
    if (!saveBar) return;
    const dirty = !snapshotsEqual(getCurrentConfig(), savedSnapshot);
    saveBar.style.display = dirty ? 'flex' : 'none';
  }

  // ===== Save =====

  function save() {
    const config = getCurrentConfig();
    saveBtn.textContent = '⏳ Saving…';
    saveBtn.disabled = true;

    fetch('/save-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    })
      .then(r => r.json())
      .then(data => {
        if (data.ok) {
          savedSnapshot = JSON.parse(JSON.stringify(config));
          updateSaveBar();
          saveBtn.textContent = '✅ Saved!';
          setTimeout(() => {
            saveBtn.textContent = '💾 Save Changes';
            saveBtn.disabled = false;
          }, 1400);
        } else {
          throw new Error(data.error || 'unknown');
        }
      })
      .catch(err => {
        console.error('[SaveManager] save failed:', err);
        saveBtn.textContent = '❌ Save failed — dev server running?';
        saveBtn.disabled = false;
        setTimeout(() => { saveBtn.textContent = '💾 Save Changes'; }, 3000);
      });
  }

  // ===== Cancel =====

  function cancel() {
    if (!savedSnapshot) return;

    // Restore camera path
    const pathApi = window.vimicxCameraPath;
    if (pathApi) {
      if (savedSnapshot.cameraPath) {
        pathApi.setPath(savedSnapshot.cameraPath);
      } else {
        pathApi.clearPathOverride();
      }
      if (window.vimicxCameraEditorRefresh) window.vimicxCameraEditorRefresh();
    }

    // Restore text config
    const textApi = window.vimicxTextConfig;
    if (textApi && savedSnapshot.textItems) textApi.setItems(savedSnapshot.textItems);
    if (window.vimicxTextEditorRefresh) window.vimicxTextEditorRefresh();

    // Restore flicker + glasses rise configs
    const flickApi = window.vimicxFlickerConfig;
    if (flickApi && savedSnapshot.screenFlicker) flickApi.set(savedSnapshot.screenFlicker);
    const glassApi = window.vimicxGlassesRise;
    if (glassApi && savedSnapshot.glassesRise) glassApi.set(savedSnapshot.glassesRise);
    if (window.vimicxFlickerEditorRefresh) window.vimicxFlickerEditorRefresh();

    updateSaveBar();
  }

  // ===== Public API =====

  // Called by main.js once the config file is loaded
  window.vimicxSetSavedSnapshot = function (config) {
    savedSnapshot = JSON.parse(JSON.stringify(config));
    updateSaveBar();
  };

  // Called by editors when they make a change
  window.vimicxSaveManager = {
    notifyChange: updateSaveBar,
    save,
    cancel
  };

  // Apply any snapshot that arrived before we were ready
  if (window._pendingSavedSnapshot) {
    window.vimicxSetSavedSnapshot(window._pendingSavedSnapshot);
    delete window._pendingSavedSnapshot;
  }

  // ===== Init UI =====

  function bindUI() {
    saveBar = document.getElementById('dev-save-bar');
    saveBtn = document.getElementById('dev-save-btn');
    cancelBtn = document.getElementById('dev-cancel-btn');
    if (!saveBar || !saveBtn || !cancelBtn) return;
    saveBtn.addEventListener('click', save);
    cancelBtn.addEventListener('click', cancel);
    // Poll every 600ms to catch changes from any editor
    setInterval(updateSaveBar, 600);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindUI);
  } else {
    bindUI();
  }
})();
