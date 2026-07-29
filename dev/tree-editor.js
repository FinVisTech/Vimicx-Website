/* ============================================
   TREE EDITOR — Interactive tool for moving
   the low-poly tree model.
   ============================================ */

(function () {
  'use strict';

  const DEG2RAD = Math.PI / 180;
  const RAD2DEG = 180 / Math.PI;

  let isOpen = false;

  // ===== DOM refs =====
  const panel      = document.getElementById('tree-editor');
  const toggleBtn  = document.getElementById('tree-toggle-btn');
  const closeBtn   = document.getElementById('tree-close-btn');
  const copyBtn    = document.getElementById('tree-copy-btn');
  const logBtn     = document.getElementById('tree-log-btn');
  const logOutput  = document.getElementById('tree-log-output');

  // Sliders
  const sl = {
    px:    document.getElementById('tree-px'),
    py:    document.getElementById('tree-py'),
    pz:    document.getElementById('tree-pz'),
    yaw:   document.getElementById('tree-yaw'),
    pitch: document.getElementById('tree-pitch'),
    roll:  document.getElementById('tree-roll'),
    scale: document.getElementById('tree-scale'),
    color: document.getElementById('tree-color')
  };

  // Value displays
  const vl = {
    px:    document.getElementById('tv-px'),
    py:    document.getElementById('tv-py'),
    pz:    document.getElementById('tv-pz'),
    yaw:   document.getElementById('tv-yaw'),
    pitch: document.getElementById('tv-pitch'),
    roll:  document.getElementById('tv-roll'),
    scale: document.getElementById('tv-scale')
  };

  // ===== Snap sliders from current tree model =====
  function snapFromTree() {
    if (typeof treeModelGroup === 'undefined' || !treeModelGroup) return;
    sl.px.value = treeModelGroup.position.x.toFixed(1);
    sl.py.value = treeModelGroup.position.y.toFixed(1);
    sl.pz.value = treeModelGroup.position.z.toFixed(1);

    const euler = treeModelGroup.rotation;
    sl.pitch.value = Math.round(euler.x * RAD2DEG);
    sl.yaw.value   = Math.round(euler.y * RAD2DEG);
    sl.roll.value  = Math.round(euler.z * RAD2DEG);

    sl.scale.value = treeModelGroup.scale.x.toFixed(2);

    let foundMaterial = null;
    treeModelGroup.traverse(child => {
      if (!foundMaterial && child.material && child.material.color) {
        foundMaterial = child.material;
      }
    });
    if (foundMaterial) {
      sl.color.value = '#' + foundMaterial.color.getHexString();
    }

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

  // ===== Apply sliders to tree model =====
  function applyToTree() {
    if (typeof treeModelGroup === 'undefined' || !treeModelGroup) return;

    treeModelGroup.position.set(
      parseFloat(sl.px.value),
      parseFloat(sl.py.value),
      parseFloat(sl.pz.value)
    );

    const yawRad   = parseFloat(sl.yaw.value) * DEG2RAD;
    const pitchRad = parseFloat(sl.pitch.value) * DEG2RAD;
    const rollRad  = parseFloat(sl.roll.value) * DEG2RAD;
    treeModelGroup.rotation.set(pitchRad, yawRad, rollRad, 'YXZ');

    const scale = parseFloat(sl.scale.value);
    treeModelGroup.scale.set(scale, scale, scale);

    if (sl.color.value) {
      const hex = sl.color.value.replace('#', '0x');
      const colorVal = parseInt(hex, 16);
      treeModelGroup.traverse(child => {
        if (child.material && child.material.color) {
          child.material.color.setHex(colorVal);
        }
      });
    }

    if (window.vimixTreeConfig && window.vimixTreeConfig.updateFromEditor) {
      window.vimixTreeConfig.updateFromEditor({
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
      _info: 'Vimix Tree Coordinates',
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
        `treeModelGroup.position.set(${parseFloat(sl.px.value).toFixed(2)}, ${parseFloat(sl.py.value).toFixed(2)}, ${parseFloat(sl.pz.value).toFixed(2)});\n` +
        `treeModelGroup.rotation.set(${parseInt(sl.pitch.value)} * DEG2RAD, ${parseInt(sl.yaw.value)} * DEG2RAD, ${parseInt(sl.roll.value)} * DEG2RAD, 'YXZ');\n` +
        `treeModelGroup.scale.set(${parseFloat(sl.scale.value).toFixed(2)}, ${parseFloat(sl.scale.value).toFixed(2)}, ${parseFloat(sl.scale.value).toFixed(2)});\n` +
        `treeModelGroup.traverse(c => { if(c.material && c.material.color) c.material.color.setHex(${sl.color.value.replace('#', '0x')}); });`
    };
    const jsonStr = JSON.stringify(data, null, 2);
    return `// --- TREE SETTINGS START ---\n${jsonStr}\n// --- TREE SETTINGS END ---\n`;
  }

  window.vimixEditorLogs['tree'] = generateLog;

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
    console.log('=== TREE COORDINATES ===');
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

    // Make sure tree is visible when editing
    if (typeof treeModelGroup !== 'undefined' && treeModelGroup) {
      treeModelGroup.visible = true;
    }

    snapFromTree();
  }

  function closeEditor() {
    isOpen = false;
    panel.style.display = 'none';
    toggleBtn.style.display = '';
    logOutput.style.display = 'none';
  }

  // ===== Per-frame tick: enforce tree transform every frame =====
  function tick() {
    if (isOpen && typeof treeModelGroup !== 'undefined' && treeModelGroup) {
      treeModelGroup.position.set(
        parseFloat(sl.px.value),
        parseFloat(sl.py.value),
        parseFloat(sl.pz.value)
      );
      const yawRad   = parseFloat(sl.yaw.value) * DEG2RAD;
      const pitchRad = parseFloat(sl.pitch.value) * DEG2RAD;
      const rollRad  = parseFloat(sl.roll.value) * DEG2RAD;
      treeModelGroup.rotation.set(pitchRad, yawRad, rollRad, 'YXZ');

      const scale = parseFloat(sl.scale.value);
      treeModelGroup.scale.set(scale, scale, scale);
      
      if (sl.color.value) {
        const hex = sl.color.value.replace('#', '0x');
        const colorVal = parseInt(hex, 16);
        treeModelGroup.traverse(child => {
          if (child.material && child.material.color) {
            child.material.color.setHex(colorVal);
          }
        });
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
          applyToTree();
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
    if (typeof treeModelGroup !== 'undefined') {
      clearInterval(check);
      console.log('[Tree Editor] Ready — click "🌳 Tree" to start');
      if (isOpen) snapFromTree();
    }
  }, 200);

})();
