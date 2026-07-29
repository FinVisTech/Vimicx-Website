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
    const pathApi = window.vimixCameraPath;
    if (pathApi) config.cameraPath = pathApi.hasOverride() ? pathApi.getPath() : null;
    const textApi = window.vimixTextConfig;
    if (textApi) config.textItems = textApi.getItems();
    const flickApi = window.vimixFlickerConfig;
    if (flickApi) config.screenFlicker = flickApi.get();
    const glassApi = window.vimixGlassesRise;
    if (glassApi) config.glassesRise = glassApi.get();
    const screenApi = window.vimixScreenLayout;
    if (screenApi) config.screenLayout = screenApi.get();
    const boatApi = window.vimixBoatConfig;
    if (boatApi) config.boatSettings = boatApi.get();
    const bassApi = window.vimixBassConfig;
    if (bassApi) config.bassSettings = bassApi.get();
    const treeApi = window.vimixTreeConfig;
    if (treeApi) config.treeSettings = treeApi.get();
    return config;
  }

  function snapshotsEqual(a, b) {
    if (!a || !b) return false;
    return JSON.stringify(a) === JSON.stringify(b);
  }

  // ===== Save bar visibility =====

  function updateSaveBar() {
    if (!saveBar) return;
    // Don't show until the snapshot has been initialised from the config file
    if (savedSnapshot === null) { saveBar.style.display = 'none'; return; }
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
    const pathApi = window.vimixCameraPath;
    if (pathApi) {
      if (savedSnapshot.cameraPath) {
        pathApi.setPath(savedSnapshot.cameraPath);
      } else {
        pathApi.clearPathOverride();
      }
      if (window.vimixCameraEditorRefresh) window.vimixCameraEditorRefresh();
    }

    // Restore text config
    const textApi = window.vimixTextConfig;
    if (textApi && savedSnapshot.textItems) textApi.setItems(savedSnapshot.textItems);
    if (window.vimixTextEditorRefresh) window.vimixTextEditorRefresh();

    // Restore flicker + glasses rise configs
    const flickApi = window.vimixFlickerConfig;
    if (flickApi && savedSnapshot.screenFlicker) flickApi.set(savedSnapshot.screenFlicker);
    const glassApi = window.vimixGlassesRise;
    if (glassApi && savedSnapshot.glassesRise) glassApi.set(savedSnapshot.glassesRise);
    if (window.vimixFlickerEditorRefresh) window.vimixFlickerEditorRefresh();

    // Restore screen layout
    const screenApi = window.vimixScreenLayout;
    if (screenApi && savedSnapshot.screenLayout) screenApi.set(savedSnapshot.screenLayout);

    // Restore boat settings
    const boatApi = window.vimixBoatConfig;
    if (boatApi && savedSnapshot.boatSettings) boatApi.set(savedSnapshot.boatSettings);

    // Restore bass settings
    const bassApi = window.vimixBassConfig;
    if (bassApi && savedSnapshot.bassSettings) bassApi.set(savedSnapshot.bassSettings);

    // Restore tree settings
    const treeApi = window.vimixTreeConfig;
    if (treeApi && savedSnapshot.treeSettings) treeApi.set(savedSnapshot.treeSettings);

    updateSaveBar();
  }

  // ===== Public API =====

  // Called by main.js once the config file is loaded
  window.vimixSetSavedSnapshot = function (config) {
    savedSnapshot = JSON.parse(JSON.stringify(config));
    // If no screenLayout was persisted, immediately baseline with whatever is
    // currently on the meshes (may be default positions if boat is already loaded,
    // or null if boat hasn't loaded yet — main.js calls baselineScreenLayout()
    // after buildScreens() to cover the reverse-timing case).
    if (!savedSnapshot.screenLayout && window.vimixScreenLayout) {
      const layout = window.vimixScreenLayout.get();
      if (layout) savedSnapshot.screenLayout = JSON.parse(JSON.stringify(layout));
    }
    if (!savedSnapshot.boatSettings && window.vimixBoatConfig) {
      const boatSettings = window.vimixBoatConfig.get();
      if (boatSettings) savedSnapshot.boatSettings = JSON.parse(JSON.stringify(boatSettings));
    }
    if (!savedSnapshot.bassSettings && window.vimixBassConfig) {
      const bassSettings = window.vimixBassConfig.get();
      if (bassSettings) savedSnapshot.bassSettings = JSON.parse(JSON.stringify(bassSettings));
    }
    if (!savedSnapshot.treeSettings && window.vimixTreeConfig) {
      const treeSettings = window.vimixTreeConfig.get();
      if (treeSettings) savedSnapshot.treeSettings = JSON.parse(JSON.stringify(treeSettings));
    }
    updateSaveBar();
  };

  // Called by main.js after screens are built with no saved layout override —
  // silently folds the default positions into the snapshot so the bar stays hidden.
  window.vimixSaveManager = {
    notifyChange: updateSaveBar,
    save,
    cancel,
    baselineLoadedMeshes() {
      if (!savedSnapshot) return;
      const layout = window.vimixScreenLayout ? window.vimixScreenLayout.get() : null;
      if (layout) savedSnapshot.screenLayout = JSON.parse(JSON.stringify(layout));
      const boatSettings = window.vimixBoatConfig ? window.vimixBoatConfig.get() : null;
      if (boatSettings) savedSnapshot.boatSettings = JSON.parse(JSON.stringify(boatSettings));
      const bassSettings = window.vimixBassConfig ? window.vimixBassConfig.get() : null;
      if (bassSettings) savedSnapshot.bassSettings = JSON.parse(JSON.stringify(bassSettings));
      const treeSettings = window.vimixTreeConfig ? window.vimixTreeConfig.get() : null;
      if (treeSettings) savedSnapshot.treeSettings = JSON.parse(JSON.stringify(treeSettings));
    },
  };

  // Apply any snapshot that arrived before we were ready
  if (window._pendingSavedSnapshot) {
    window.vimixSetSavedSnapshot(window._pendingSavedSnapshot);
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
