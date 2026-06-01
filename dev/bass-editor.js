/* ============================================
   BASS EDITOR — Interactive tool for moving
   the low-poly bass models.
   ============================================ */

(function () {
  'use strict';

  const DEG2RAD = Math.PI / 180;
  const RAD2DEG = 180 / Math.PI;

  let isOpen = false;
  let selectedIdx = 0;

  // ===== DOM refs =====
  const panel      = document.getElementById('bass-editor');
  const toggleBtn  = document.getElementById('bass-toggle-btn');
  const closeBtn   = document.getElementById('bass-close-btn');
  const copyBtn    = document.getElementById('bass-copy-btn');
  const logBtn     = document.getElementById('bass-log-btn');
  const logOutput  = document.getElementById('bass-log-output');

  const selectBtns = [
    document.getElementById('bass-select-0'),
    document.getElementById('bass-select-1'),
    document.getElementById('bass-select-2'),
    document.getElementById('bass-select-3')
  ];

  // Sliders
  const sl = {
    px:    document.getElementById('bass-px'),
    py:    document.getElementById('bass-py'),
    pz:    document.getElementById('bass-pz'),
    yaw:   document.getElementById('bass-yaw'),
    pitch: document.getElementById('bass-pitch'),
    roll:  document.getElementById('bass-roll'),
    scale: document.getElementById('bass-scale'),
    color: document.getElementById('bass-color')
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

  function selectBass(idx) {
    selectedIdx = idx;
    selectBtns.forEach((btn, i) => {
      if(btn) btn.classList.toggle('active', i === selectedIdx);
    });
    snapFromBass();
  }

  // ===== Snap sliders from current bass model =====
  function snapFromBass() {
    if (typeof bassModels === 'undefined' || bassModels.length === 0) return;
    const group = bassModels[selectedIdx];
    if (!group) return;

    sl.px.value = group.position.x.toFixed(1);
    sl.py.value = group.position.y.toFixed(1);
    sl.pz.value = group.position.z.toFixed(1);

    const euler = group.rotation;
    sl.pitch.value = Math.round(euler.x * RAD2DEG);
    sl.yaw.value   = Math.round(euler.y * RAD2DEG);
    sl.roll.value  = Math.round(euler.z * RAD2DEG);

    sl.scale.value = group.scale.x.toFixed(2);

    let foundMaterial = null;
    group.traverse(child => {
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

  // ===== Apply sliders to bass model =====
  function applyToBass() {
    if (typeof bassModels === 'undefined' || bassModels.length === 0) return;
    const group = bassModels[selectedIdx];
    if (!group) return;

    group.position.set(
      parseFloat(sl.px.value),
      parseFloat(sl.py.value),
      parseFloat(sl.pz.value)
    );

    const yawRad   = parseFloat(sl.yaw.value) * DEG2RAD;
    const pitchRad = parseFloat(sl.pitch.value) * DEG2RAD;
    const rollRad  = parseFloat(sl.roll.value) * DEG2RAD;
    group.rotation.set(pitchRad, yawRad, rollRad, 'YXZ');

    const scale = parseFloat(sl.scale.value);
    group.scale.set(scale, scale, scale);

    if (sl.color.value) {
      const hexStr = sl.color.value.replace('#', '0x');
      group.userData.color = hexStr; // save for export
      const colorVal = parseInt(hexStr, 16);
      group.traverse(child => {
        if (child.material && child.material.color) {
          child.material.color.setHex(colorVal);
        }
      });
    }

    updateDisplays();
  }

  // ===== Generate coordinate log =====
  function generateLog() {
    if (typeof bassModels === 'undefined' || bassModels.length === 0) return '{}';
    
    const data = {
      _info: 'Vimicx Bass Coordinates',
      _jsSnippet: 'const DEG2RAD = Math.PI / 180;\nbassModels = [];\nconst bassDefs = [\n'
    };
    
    const defs = [];
    bassModels.forEach((group, i) => {
      const p = group.position;
      const r = group.rotation;
      const s = group.scale.x;
      
      let c = group.userData.color || sl.color.value.replace('#', '0x');
      if (typeof c === 'string' && c.startsWith('#')) c = c.replace('#', '0x');
      
      defs.push(`  { pos: [${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}], rot: [${Math.round(r.x*RAD2DEG)} * DEG2RAD, ${Math.round(r.y*RAD2DEG)} * DEG2RAD, ${Math.round(r.z*RAD2DEG)} * DEG2RAD], scale: ${s.toFixed(2)}, color: "${c}" }`);
    });
    
    data._jsSnippet += defs.join(',\n') + '\n];\n';
    data._jsSnippet += 'bassDefs.forEach(def => {\n  const group = new THREE.Group();\n  group.position.set(...def.pos);\n  group.rotation.set(def.rot[0], def.rot[1], def.rot[2], \'YXZ\');\n  group.scale.set(def.scale, def.scale, def.scale);\n  group.visible = false;\n  group.userData.color = def.color;\n  scene.add(group);\n  bassModels.push(group);\n});';
    
    const jsonStr = JSON.stringify(data, null, 2);
    return `// --- BASS SETTINGS START ---\n${jsonStr}\n// --- BASS SETTINGS END ---\n`;
  }

  window.vimicxEditorLogs['bass'] = generateLog;

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
    console.log('=== BASS COORDINATES ===');
    console.log(text);
    logOutput.style.display = logOutput.style.display === 'block' ? 'none' : 'block';
    logOutput.textContent = text;
  }

  // ===== Open / Close =====
  function openEditor() {
    isOpen = true;
    panel.style.display = 'flex';
    if(toggleBtn) toggleBtn.style.display = 'none';
    document.body.classList.add('editor-active');

    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Make sure bass is visible when editing
    if (typeof bassModels !== 'undefined' && bassModels.length > 0) {
      bassModels.forEach(g => g.visible = true);
    }

    snapFromBass();
  }

  function closeEditor() {
    isOpen = false;
    panel.style.display = 'none';
    if(toggleBtn) toggleBtn.style.display = '';
    logOutput.style.display = 'none';
    document.body.classList.remove('editor-active');
  }

  // ===== Bind events =====
  function bindEvents() {
    if(toggleBtn) toggleBtn.addEventListener('click', openEditor);
    if(closeBtn) closeBtn.addEventListener('click', closeEditor);
    if(copyBtn) copyBtn.addEventListener('click', copyCoords);
    if(logBtn) logBtn.addEventListener('click', showLog);

    selectBtns.forEach((btn, i) => {
      if(btn) btn.addEventListener('click', () => selectBass(i));
    });

    Object.keys(sl).forEach(key => {
      if(sl[key]) {
        sl[key].addEventListener('input', () => {
          updateDisplays();
          applyToBass();
        });
      }
    });

    document.addEventListener('keydown', (e) => {
      if (!isOpen) return;
      if (e.key === 'Escape') closeEditor();
    });

    // 3D Scene Picking
    const raycaster = new THREE.Raycaster();
    raycaster.params.Line.threshold = 0.5;
    const mouse = new THREE.Vector2();
    const canvas = document.getElementById('three-canvas');
    if (canvas) {
      canvas.addEventListener('pointerdown', (e) => {
        if (!isOpen) return;
        
        mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
        
        if (typeof camera !== 'undefined' && camera) {
          raycaster.setFromCamera(mouse, camera);
          
          const intersects = raycaster.intersectObjects(bassModels, true);
          if (intersects.length > 0) {
            let object = intersects[0].object;
            // Traverse up to find the group in bassModels
            while (object && !bassModels.includes(object)) {
              object = object.parent;
            }
            
            if (object) {
              const index = bassModels.indexOf(object);
              if (index !== -1) {
                selectBass(index);
              }
            }
          }
        }
      });
    }
  }

  // ===== Boot =====
  bindEvents();
  const check = setInterval(() => {
    if (typeof bassModels !== 'undefined' && bassModels.length > 0) {
      clearInterval(check);
      console.log('[Bass Editor] Ready');
    }
  }, 200);

})();
