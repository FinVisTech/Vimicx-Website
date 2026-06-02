/* ============================================
   CAMERA EDITOR
   Single-pose controls plus scroll camera path tools.
   Loaded only by the existing ?dev gate in index.html.
   ============================================ */

(function () {
  'use strict';

  const DEG2RAD = Math.PI / 180;
  const RAD2DEG = 180 / Math.PI;

  let isOpen = false;
  let cameraOverride = false;
  let rotationPaused = false;
  let pathPreviewActive = false;
  let previewRaf = null;
  let pathFrames = [];
  let selectedPathIndex = 0;
  let selectedSegmentIndex = null;
  let pendingMove = null;
  const MIN_PROGRESS_GAP = 0.001;

  const panel = document.getElementById('camera-editor');
  const toggleBtn = document.getElementById('camera-toggle-btn');
  const closeBtn = document.getElementById('camera-close-btn');
  const copyBtn = document.getElementById('camera-copy-btn');
  const pathCopyBtn = document.getElementById('camera-path-copy-btn');
  const logBtn = document.getElementById('camera-log-btn');
  const logOutput = document.getElementById('camera-log-output');
  const liveToggle = document.getElementById('camera-live-toggle');
  const pauseRotBtn = document.getElementById('camera-pause-rot-btn');

  const sl = {
    px: document.getElementById('cam-px'),
    py: document.getElementById('cam-py'),
    pz: document.getElementById('cam-pz'),
    yaw: document.getElementById('cam-yaw'),
    pitch: document.getElementById('cam-pitch'),
    fov: document.getElementById('cam-fov')
  };

  const vl = {
    px: document.getElementById('cv-px'),
    py: document.getElementById('cv-py'),
    pz: document.getElementById('cv-pz'),
    yaw: document.getElementById('cv-yaw'),
    pitch: document.getElementById('cv-pitch'),
    fov: document.getElementById('cv-fov')
  };

  const pathEl = {
    count: document.getElementById('cp-count'),
    openScrollBtn: document.getElementById('camera-path-open-scroll-btn'),
    selectedLabel: document.getElementById('cp-selected-label'),
    space: document.getElementById('cam-path-space'),
    spaceVal: document.getElementById('cp-space'),
    mode: document.getElementById('cam-path-mode'),
    modeVal: document.getElementById('cp-mode'),
    boatLock: document.getElementById('cam-path-boat-lock'),
    boatLockVal: document.getElementById('cp-boat-lock'),
    glassesProgress: document.getElementById('cam-path-glasses-progress'),
    glassesProgressVal: document.getElementById('cp-glasses-progress'),
    glassesTilt: document.getElementById('cam-path-glasses-tilt'),
    glassesTiltVal: document.getElementById('cp-glasses-tilt'),
    captureBtn: document.getElementById('camera-path-capture-btn'),
    jumpBtn: document.getElementById('camera-path-jump-btn'),
    previewSegmentBtn: document.getElementById('camera-path-preview-segment-btn'),
    previewFullBtn: document.getElementById('camera-path-preview-full-btn'),
    resetBtn: document.getElementById('camera-path-reset-btn')
  };

  const timelineEl = {
    panel: document.getElementById('camera-scroll-control'),
    closeBtn: document.getElementById('camera-scroll-close-btn'),
    track: document.getElementById('camera-scroll-track'),
    keyframes: document.getElementById('camera-scroll-keyframes'),
    segments: document.getElementById('camera-scroll-segments'),
    playhead: document.getElementById('camera-scroll-playhead'),
    status: document.getElementById('camera-scroll-status'),
    confirm: document.getElementById('camera-scroll-confirm'),
    confirmText: document.getElementById('camera-scroll-confirm-text'),
    acceptBtn: document.getElementById('camera-scroll-accept-btn'),
    cancelBtn: document.getElementById('camera-scroll-cancel-btn'),
    previewFullBtn: document.getElementById('camera-scroll-preview-full-btn'),
    copyBtn: document.getElementById('camera-scroll-copy-btn')
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function round(value, places = 2) {
    const scale = Math.pow(10, places);
    return Math.round(value * scale) / scale;
  }

  function vecToData(vec) {
    return { x: round(vec.x), y: round(vec.y), z: round(vec.z) };
  }

  function dataToVec(data) {
    return new THREE.Vector3(data.x, data.y, data.z);
  }

  function getLookAtFromAngles(distance = 10) {
    const yawRad = parseFloat(sl.yaw.value) * DEG2RAD;
    const pitchRad = parseFloat(sl.pitch.value) * DEG2RAD;
    const px = parseFloat(sl.px.value);
    const py = parseFloat(sl.py.value);
    const pz = parseFloat(sl.pz.value);

    const dx = Math.sin(yawRad) * Math.cos(pitchRad);
    const dy = Math.sin(pitchRad);
    const dz = -Math.cos(yawRad) * Math.cos(pitchRad);

    return new THREE.Vector3(px + dx * distance, py + dy * distance, pz + dz * distance);
  }

  function getCurrentWorldPosition() {
    return new THREE.Vector3(
      parseFloat(sl.px.value),
      parseFloat(sl.py.value),
      parseFloat(sl.pz.value)
    );
  }

  function setSlidersFromPose(position, target, fov) {
    const direction = target.clone().sub(position).normalize();
    const yaw = Math.atan2(direction.x, -direction.z) * RAD2DEG;
    const pitch = Math.asin(clamp(direction.y, -1, 1)) * RAD2DEG;

    sl.px.value = round(position.x, 1);
    sl.py.value = round(position.y, 1);
    sl.pz.value = round(position.z, 1);
    sl.yaw.value = Math.round(yaw);
    sl.pitch.value = Math.round(pitch);
    sl.fov.value = Math.round(fov);
    updateDisplays();
    if (cameraOverride) applyToCamera();
  }

  function snapFromCamera() {
    if (typeof camera === 'undefined') return;
    const target = new THREE.Vector3();
    camera.getWorldDirection(target);
    target.multiplyScalar(10).add(camera.position);
    setSlidersFromPose(camera.position.clone(), target, camera.fov);
  }

  function updateDisplays() {
    vl.px.textContent = parseFloat(sl.px.value).toFixed(1);
    vl.py.textContent = parseFloat(sl.py.value).toFixed(1);
    vl.pz.textContent = parseFloat(sl.pz.value).toFixed(1);
    vl.yaw.textContent = sl.yaw.value + 'deg';
    vl.pitch.textContent = sl.pitch.value + 'deg';
    vl.fov.textContent = sl.fov.value + 'deg';
  }

  function applyToCamera() {
    if (typeof camera === 'undefined' || !cameraOverride) return;

    camera.position.set(
      parseFloat(sl.px.value),
      parseFloat(sl.py.value),
      parseFloat(sl.pz.value)
    );

    const yawRad = parseFloat(sl.yaw.value) * DEG2RAD;
    const pitchRad = parseFloat(sl.pitch.value) * DEG2RAD;
    camera.rotation.set(pitchRad, -yawRad, 0, 'YXZ');

    const newFov = parseFloat(sl.fov.value);
    if (Math.abs(camera.fov - newFov) > 0.01) {
      camera.fov = newFov;
      camera.updateProjectionMatrix();
    }

    updateDisplays();
  }

  function getPathApi() {
    return window.vimicxCameraPath || null;
  }

  function pathReady() {
    return Boolean(getPathApi() && typeof THREE !== 'undefined');
  }

  function cloneFrames(frames) {
    return JSON.parse(JSON.stringify(frames));
  }

  function loadPathFrames(useDefault = false) {
    if (!pathReady()) return;
    const api = getPathApi();
    pathFrames = useDefault ? api.getDefaultPath() : api.getPath();
    selectedPathIndex = clamp(selectedPathIndex, 0, Math.max(0, pathFrames.length - 1));
    selectedSegmentIndex = null;
    pendingMove = null;
    renderTimeline();
    syncPathInputsFromFrame();
  }

  function getVisualProgress(index) {
    if (pendingMove && pendingMove.index === index) return pendingMove.to;
    return pathFrames[index] ? pathFrames[index].progress : 0;
  }

  function getProgressBounds(index) {
    const previous = index > 0 ? getVisualProgress(index - 1) + MIN_PROGRESS_GAP : 0;
    const next = index < pathFrames.length - 1 ? getVisualProgress(index + 1) - MIN_PROGRESS_GAP : 1;
    return {
      min: clamp(previous, 0, 1),
      max: clamp(next, 0, 1)
    };
  }

  function selectKeyframe(index) {
    selectedPathIndex = clamp(index, 0, Math.max(0, pathFrames.length - 1));
    selectedSegmentIndex = null;
    if (pathReady()) applyPathProgress(getVisualProgress(selectedPathIndex));
    syncPathInputsFromFrame();
    renderTimeline();
  }

  function selectSegment(index) {
    selectedSegmentIndex = clamp(index, 0, Math.max(0, pathFrames.length - 2));
    selectedPathIndex = selectedSegmentIndex;
    if (pathReady() && pathFrames[selectedSegmentIndex + 1]) {
      const midpoint = (getVisualProgress(selectedSegmentIndex) + getVisualProgress(selectedSegmentIndex + 1)) / 2;
      applyPathProgress(midpoint);
    }
    syncPathInputsFromFrame();
    renderTimeline();
  }

  function renderTimeline() {
    if (!timelineEl.keyframes || !timelineEl.segments) return;
    timelineEl.keyframes.innerHTML = '';
    timelineEl.segments.innerHTML = '';

    pathFrames.forEach((frame, index) => {
      const visualProgress = getVisualProgress(index);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'camera-keyframe';
      if (index === selectedPathIndex && selectedSegmentIndex === null) button.classList.add('is-selected');
      if (pendingMove && pendingMove.index === index) button.classList.add('is-pending');
      button.style.left = `${visualProgress * 100}%`;
      button.dataset.index = String(index);
      button.title = `${frame.label || frame.id}: ${visualProgress.toFixed(3)}`;
      button.innerHTML = [
        '<span class="camera-keyframe-dot"></span>',
        `<span class="camera-keyframe-index">${index + 1}</span>`,
        `<span class="camera-keyframe-progress">${visualProgress.toFixed(3)}</span>`
      ].join('');
      timelineEl.keyframes.appendChild(button);
    });

    for (let index = 0; index < pathFrames.length - 1; index++) {
      const left = getVisualProgress(index);
      const right = getVisualProgress(index + 1);
      const segment = document.createElement('button');
      segment.type = 'button';
      segment.className = 'camera-segment';
      if (selectedSegmentIndex === index) segment.classList.add('is-selected');
      segment.style.left = `${left * 100}%`;
      segment.style.width = `${Math.max(0.5, (right - left) * 100)}%`;
      segment.dataset.index = String(index);
      segment.title = `Segment ${index + 1}: ${pathFrames[index].mode}`;
      segment.innerHTML = `<span class="camera-segment-label">${pathFrames[index].mode}</span>`;
      timelineEl.segments.appendChild(segment);
    }

    updateTimelineStatus();
    updateMoveConfirm();
  }

  function updateTimelineStatus() {
    if (!timelineEl.status) return;
    const frame = pathFrames[selectedPathIndex];
    if (!frame) {
      timelineEl.status.textContent = 'No camera path loaded.';
      return;
    }
    if (selectedSegmentIndex !== null) {
      const next = pathFrames[selectedSegmentIndex + 1];
      timelineEl.status.textContent = `Segment ${selectedSegmentIndex + 1}: ${frame.label || frame.id} to ${next ? next.label || next.id : 'end'} (${frame.mode})`;
      return;
    }
    timelineEl.status.textContent = `Keyframe ${selectedPathIndex + 1}: ${frame.label || frame.id} at ${getVisualProgress(selectedPathIndex).toFixed(3)}`;
  }

  function updateMoveConfirm() {
    if (!timelineEl.confirm) return;
    const hasMove = Boolean(pendingMove);
    timelineEl.confirm.style.display = hasMove ? 'flex' : 'none';
    if (hasMove && timelineEl.confirmText) {
      const frame = pathFrames[pendingMove.index];
      timelineEl.confirmText.textContent = `Move ${frame.label || frame.id} from ${pendingMove.from.toFixed(3)} to ${pendingMove.to.toFixed(3)}?`;
    }
  }

  function openTimeline() {
    if (!pathReady()) return;
    loadPathFrames(false);
    if (timelineEl.panel) timelineEl.panel.style.display = 'block';
  }

  function closeTimeline() {
    if (timelineEl.panel) timelineEl.panel.style.display = 'none';
  }

  function acceptPendingMove() {
    if (!pendingMove || !pathReady()) return;
    pathFrames[pendingMove.index].progress = pendingMove.to;
    pathFrames = getPathApi().setPath(pathFrames);
    selectedPathIndex = pendingMove.index;
    pendingMove = null;
    renderTimeline();
    syncPathInputsFromFrame();
  }

  function cancelPendingMove() {
    pendingMove = null;
    renderTimeline();
    syncPathInputsFromFrame();
  }

  function trackProgressFromEvent(event) {
    if (!timelineEl.track) return 0;
    const rect = timelineEl.track.getBoundingClientRect();
    return clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
  }

  function beginKeyframeDrag(event) {
    const handle = event.target.closest('.camera-keyframe');
    if (!handle) return;
    event.preventDefault();
    const index = parseInt(handle.dataset.index, 10);
    selectKeyframe(index);
    const startProgress = pathFrames[index].progress;
    const bounds = getProgressBounds(index);

    function move(moveEvent) {
      const nextProgress = clamp(trackProgressFromEvent(moveEvent), bounds.min, bounds.max);
      pendingMove = { index, from: startProgress, to: round(nextProgress, 3) };
      renderTimeline();
    }

    function end() {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', end);
      if (pendingMove && Math.abs(pendingMove.to - pendingMove.from) < MIN_PROGRESS_GAP) {
        pendingMove = null;
      }
      renderTimeline();
    }

    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', end);
  }

  function handleTimelineClick(event) {
    const keyframe = event.target.closest('.camera-keyframe');
    if (keyframe) {
      selectKeyframe(parseInt(keyframe.dataset.index, 10));
      return;
    }
    const segment = event.target.closest('.camera-segment');
    if (segment) {
      selectSegment(parseInt(segment.dataset.index, 10));
    }
  }

  function renderPathOptions() {
    if (pathEl.count) pathEl.count.textContent = String(pathFrames.length);
    renderTimeline();
  }

  function syncPathInputsFromFrame() {
    const frame = pathFrames[selectedPathIndex];
    if (!frame || !pathEl.space) return;

    pathEl.space.value = frame.space;
    pathEl.mode.value = frame.mode;
    pathEl.boatLock.value = frame.boatLock || 0;
    pathEl.glassesProgress.value = frame.glassesProgress || 0;
    pathEl.glassesTilt.value = frame.glassesTilt || 0;
    updatePathDisplays();
  }

  function updatePathDisplays() {
    if (!pathEl.space) return;
    const frame = pathFrames[selectedPathIndex];
    if (pathEl.count) pathEl.count.textContent = String(pathFrames.length);
    if (pathEl.selectedLabel && frame) {
      const subject = selectedSegmentIndex !== null ? `Segment ${selectedSegmentIndex + 1}` : `Keyframe ${selectedPathIndex + 1}`;
      pathEl.selectedLabel.textContent = `${subject}: ${frame.label || frame.id} (${getVisualProgress(selectedPathIndex).toFixed(3)})`;
    }
    pathEl.spaceVal.textContent = pathEl.space.value;
    pathEl.modeVal.textContent = pathEl.mode.value;
    pathEl.boatLockVal.textContent = parseFloat(pathEl.boatLock.value).toFixed(2);
    pathEl.glassesProgressVal.textContent = parseFloat(pathEl.glassesProgress.value).toFixed(2);
    pathEl.glassesTiltVal.textContent = parseFloat(pathEl.glassesTilt.value).toFixed(2);
  }

  function updateSelectedFrameFromInputs() {
    const frame = pathFrames[selectedPathIndex];
    if (!frame || !pathReady()) return;

    frame.space = pathEl.space.value;
    frame.mode = pathEl.mode.value;
    frame.boatLock = parseFloat(pathEl.boatLock.value);
    frame.glassesProgress = parseFloat(pathEl.glassesProgress.value);
    frame.glassesTilt = parseFloat(pathEl.glassesTilt.value);

    const api = getPathApi();
    pathFrames = api.setPath(pathFrames);
    selectedPathIndex = pathFrames.findIndex(item => item.id === frame.id);
    if (selectedPathIndex < 0) selectedPathIndex = 0;
    renderPathOptions();
    syncPathInputsFromFrame();
  }

  function captureCurrentKeyframe() {
    if (!pathReady()) return;
    const frame = pathFrames[selectedPathIndex];
    if (!frame) return;

    const worldPos = getCurrentWorldPosition();
    const worldTarget = getLookAtFromAngles();
    const space = pathEl.space.value;
    let savedPos = worldPos.clone();
    let savedTarget = worldTarget.clone();

    if (space === 'boat' && typeof boatGroup !== 'undefined' && boatGroup) {
      boatGroup.updateMatrixWorld();
      const inverse = new THREE.Matrix4().copy(boatGroup.matrixWorld).invert();
      savedPos.applyMatrix4(inverse);
      savedTarget.applyMatrix4(inverse);
    }

    frame.position = vecToData(savedPos);
    frame.target = vecToData(savedTarget);
    frame.fov = parseFloat(sl.fov.value);
    frame.space = space;
    frame.mode = pathEl.mode.value;
    if (pendingMove && pendingMove.index === selectedPathIndex) {
      frame.progress = pendingMove.to;
      pendingMove = null;
    }
    frame.boatLock = parseFloat(pathEl.boatLock.value);
    frame.glassesProgress = parseFloat(pathEl.glassesProgress.value);
    frame.glassesTilt = parseFloat(pathEl.glassesTilt.value);

    if (frame.mode === 'orbit' && !frame.orbitCenter) {
      frame.orbitCenter = { x: 0, y: 0.4, z: 0 };
    }

    pathFrames = getPathApi().setPath(pathFrames);
    renderPathOptions();
    syncPathInputsFromFrame();
  }

  function applyPathProgress(progress) {
    if (!pathReady()) return;
    const api = getPathApi();
    pathPreviewActive = true;
    cameraOverride = true;
    liveToggle.checked = true;
    api.setProgress(progress);
    const pose = api.evaluate(progress);
    setSlidersFromPose(pose.position, pose.target, pose.fov);
  }

  function jumpToSelectedKeyframe() {
    updateSelectedFrameFromInputs();
    const frame = pathFrames[selectedPathIndex];
    if (!frame) return;
    applyPathProgress(frame.progress);
  }

  function stopPreview() {
    if (previewRaf) cancelAnimationFrame(previewRaf);
    previewRaf = null;
    pathPreviewActive = false;
  }

  function previewProgressRange(startProgress, endProgress, durationMs) {
    if (!pathReady()) return;
    stopPreview();
    cameraOverride = true;
    liveToggle.checked = true;
    pathPreviewActive = true;
    const start = performance.now();

    function step(now) {
      const t = clamp((now - start) / durationMs, 0, 1);
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      applyPathProgress(startProgress + (endProgress - startProgress) * eased);
      if (t < 1) {
        previewRaf = requestAnimationFrame(step);
      } else {
        previewRaf = null;
      }
    }

    previewRaf = requestAnimationFrame(step);
  }

  function previewSelectedSegment() {
    updateSelectedFrameFromInputs();
    const current = pathFrames[selectedPathIndex];
    const next = pathFrames[Math.min(pathFrames.length - 1, selectedPathIndex + 1)];
    if (!current || !next) return;
    previewProgressRange(current.progress, next.progress, 1400);
  }

  function previewFullPath() {
    updateSelectedFrameFromInputs();
    previewProgressRange(0, 1, 5200);
  }

  function resetPathToDefault() {
    if (!pathReady()) return;
    stopPreview();
    pathFrames = getPathApi().setPath(getPathApi().getDefaultPath());
    selectedPathIndex = 0;
    renderPathOptions();
    syncPathInputsFromFrame();
  }

  function generateCameraLog() {
    const lookAt = getLookAtFromAngles();
    const data = {
      _info: 'Vimicx Camera Coordinates - paste into your next prompt',
      position: {
        x: round(parseFloat(sl.px.value)),
        y: round(parseFloat(sl.py.value)),
        z: round(parseFloat(sl.pz.value))
      },
      rotation: {
        yaw: parseInt(sl.yaw.value, 10),
        pitch: parseInt(sl.pitch.value, 10)
      },
      lookAt: vecToData(lookAt),
      fov: parseFloat(sl.fov.value),
      _jsSnippet:
        `camera.position.set(${parseFloat(sl.px.value).toFixed(1)}, ${parseFloat(sl.py.value).toFixed(1)}, ${parseFloat(sl.pz.value).toFixed(1)});\n` +
        `camera.fov = ${sl.fov.value}; camera.updateProjectionMatrix();\n` +
        `camera.lookAt(${lookAt.x.toFixed(2)}, ${lookAt.y.toFixed(2)}, ${lookAt.z.toFixed(2)});`
    };
    return `// --- CAMERA SETTINGS START ---\n${JSON.stringify(data, null, 2)}\n// --- CAMERA SETTINGS END ---\n`;
  }

  function generatePathLog() {
    if (!pathReady()) return '// Camera path API not ready.';
    updateSelectedFrameFromInputs();
    const path = cloneFrames(pathFrames);
    return [
      '// --- VIMICX CAMERA PATH START ---',
      JSON.stringify(path, null, 2),
      '',
      '// Runtime preview snippet:',
      `window.vimicxCameraPath.setPath(${JSON.stringify(path)});`,
      '// --- VIMICX CAMERA PATH END ---'
    ].join('\n');
  }

  function writeClipboard(text, fallbackButton) {
    navigator.clipboard.writeText(text).then(() => {
      if (!fallbackButton) return;
      const original = fallbackButton.textContent;
      fallbackButton.textContent = 'Copied';
      setTimeout(() => { fallbackButton.textContent = original; }, 1600);
    }).catch(() => {
      logOutput.style.display = 'block';
      logOutput.textContent = text;
    });
  }

  function copyCoords() {
    writeClipboard(generateCameraLog(), copyBtn);
  }

  function copyPath() {
    writeClipboard(generatePathLog(), pathCopyBtn);
  }

  function showLog() {
    const text = `${generateCameraLog()}\n\n${generatePathLog()}`;
    console.log('=== CAMERA AND PATH SETTINGS ===');
    console.log(text);
    logOutput.style.display = logOutput.style.display === 'block' ? 'none' : 'block';
    logOutput.textContent = text;
  }

  if (window.vimicxEditorLogs) {
    window.vimicxEditorLogs.camera = generateCameraLog;
    window.vimicxEditorLogs.cameraPath = generatePathLog;
  }

  function openEditor() {
    isOpen = true;
    panel.style.display = 'flex';
    toggleBtn.style.display = 'none';

    window.scrollTo({ top: 0, behavior: 'smooth' });

    const canvas = document.getElementById('three-canvas');
    if (canvas) canvas.style.opacity = '1';

    snapFromCamera();
    loadPathFrames(false);
    cameraOverride = true;
    liveToggle.checked = true;
  }

  function closeEditor() {
    isOpen = false;
    cameraOverride = false;
    pathPreviewActive = false;
    stopPreview();
    closeTimeline();
    panel.style.display = 'none';
    toggleBtn.style.display = '';
    logOutput.style.display = 'none';
  }

  Object.defineProperty(window, 'cameraEditorActive', {
    get: () => cameraOverride
  });

  Object.defineProperty(window, 'cameraPathEditorActive', {
    get: () => pathPreviewActive
  });

  Object.defineProperty(window, 'rotationPaused', {
    get: () => rotationPaused
  });

  function updatePlayhead() {
    if (!timelineEl.playhead) return;
    const timelineVisible = timelineEl.panel && timelineEl.panel.style.display !== 'none';
    if (!timelineVisible || cameraOverride) {
      timelineEl.playhead.style.display = 'none';
      return;
    }
    const api = getPathApi();
    if (!api) {
      timelineEl.playhead.style.display = 'none';
      return;
    }
    timelineEl.playhead.style.display = 'block';
    timelineEl.playhead.style.left = `${api.getProgress() * 100}%`;
  }

  function tick() {
    if (isOpen && typeof camera !== 'undefined') {
      if (cameraOverride) {
        applyToCamera();
      } else {
        snapFromCamera();
      }
    }
    updatePlayhead();
    requestAnimationFrame(tick);
  }
  tick();

  function bindEvents() {
    toggleBtn.addEventListener('click', openEditor);
    closeBtn.addEventListener('click', closeEditor);
    copyBtn.addEventListener('click', copyCoords);
    if (pathCopyBtn) pathCopyBtn.addEventListener('click', copyPath);
    logBtn.addEventListener('click', showLog);

    liveToggle.addEventListener('change', () => {
      cameraOverride = liveToggle.checked;
      if (!cameraOverride) pathPreviewActive = false;
      if (cameraOverride) applyToCamera();
    });

    pauseRotBtn.addEventListener('click', () => {
      rotationPaused = !rotationPaused;
      pauseRotBtn.textContent = rotationPaused ? 'Resume Rotation' : 'Pause Rotation';
    });

    Object.keys(sl).forEach(key => {
      sl[key].addEventListener('input', () => {
        updateDisplays();
        if (cameraOverride) applyToCamera();
      });
    });

    ['space', 'mode', 'boatLock', 'glassesProgress', 'glassesTilt'].forEach(key => {
      if (!pathEl[key]) return;
      pathEl[key].addEventListener('input', () => {
        updatePathDisplays();
        updateSelectedFrameFromInputs();
      });
      pathEl[key].addEventListener('change', () => {
        updatePathDisplays();
        updateSelectedFrameFromInputs();
      });
    });

    if (pathEl.captureBtn) pathEl.captureBtn.addEventListener('click', captureCurrentKeyframe);
    if (pathEl.jumpBtn) pathEl.jumpBtn.addEventListener('click', jumpToSelectedKeyframe);
    if (pathEl.previewSegmentBtn) pathEl.previewSegmentBtn.addEventListener('click', previewSelectedSegment);
    if (pathEl.previewFullBtn) pathEl.previewFullBtn.addEventListener('click', previewFullPath);
    if (pathEl.resetBtn) pathEl.resetBtn.addEventListener('click', resetPathToDefault);
    if (pathEl.openScrollBtn) pathEl.openScrollBtn.addEventListener('click', openTimeline);
    if (timelineEl.closeBtn) timelineEl.closeBtn.addEventListener('click', closeTimeline);
    if (timelineEl.acceptBtn) timelineEl.acceptBtn.addEventListener('click', acceptPendingMove);
    if (timelineEl.cancelBtn) timelineEl.cancelBtn.addEventListener('click', cancelPendingMove);
    if (timelineEl.previewFullBtn) timelineEl.previewFullBtn.addEventListener('click', previewFullPath);
    if (timelineEl.copyBtn) timelineEl.copyBtn.addEventListener('click', copyPath);
    if (timelineEl.track) {
      timelineEl.track.addEventListener('click', handleTimelineClick);
      timelineEl.track.addEventListener('pointerdown', beginKeyframeDrag);
    }

    document.addEventListener('keydown', (e) => {
      if (!isOpen) return;
      if (e.key === 'Escape' && timelineEl.panel && timelineEl.panel.style.display !== 'none') {
        closeTimeline();
        return;
      }
      if (e.key === 'Escape') closeEditor();
    });
  }

  // Expose refresh so save-manager can restore camera path and re-sync the editor UI
  window.vimicxCameraEditorRefresh = () => { if (isOpen) loadPathFrames(false); };

  bindEvents();
  const check = setInterval(() => {
    if (typeof camera !== 'undefined' && pathReady()) {
      clearInterval(check);
      loadPathFrames(false);
      console.log('[Camera Editor] Ready - click Camera to start');
    }
  }, 200);
})();
