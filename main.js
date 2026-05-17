/* ============================================
   VIMICX — Main JavaScript
   Three.js 3D Scene + GSAP Scroll Animations
   ============================================ */

// ===== GLOBALS =====
let renderer, scene, camera, orbitControls;
let boatGroup, screenMeshes = [], screenEdges = [];
let wireframeClones = [];
let fishGroup, fishBody, fishGlow, scanLine;
let waterPlane, waterGeo;
let bassModelGroup; // Low poly bass — locked to terrain, NOT riding waves

// Dot-grid masking system — renders dots only where no 3D objects are visible
let maskRenderTarget;
let editorMode = false;
let animState = {
  screenOpacity: 1,
  terrainReveal: 0,
  fishVisibility: 0,
  scanLinePos: -2,
  boatRotY: 0,
  boatRotSpeed: 1,
  boatAlignToTarget: 0,  // 0 = free spin, 1 = fully aligned to BOAT_TARGET_YAW
  cameraLockedToBoat: 0,   // 0 = free camera, 1 = camera follows boat transform
  cameraX: 0,
  cameraY: 3,
  cameraZ: 8,
  lookAtX: 0,
  lookAtY: 0.3,
  lookAtZ: 0,
  canvasOpacity: 1,
  waterOpacity: 1,
  fov: 50
};

// Boat-local camera offsets — these define WHERE on the boat the camera sits
// and WHERE it looks, in the boat's own coordinate frame.
// Derived from exported Vimicx Camera Coordinates (yaw 90°, pitch -45°).
const CAM_LOCAL_POS = new THREE.Vector3(1.7, 2.1, 0.0);
const CAM_LOCAL_LOOKAT = new THREE.Vector3(8.77, -4.97, 0.0);
const BOAT_TARGET_YAW = 0; // target yaw angle for the cinematic camera shot
let clock;

// ===== INIT =====
function init() {
  clock = new THREE.Clock();

  // Renderer — opaque background so dot grid plane is visible behind objects
  const canvas = document.getElementById('three-canvas');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x1E1E1E, 1);
  renderer.autoClear = true;

  // Scene
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x1E1E1E, 0.018);

  // Camera
  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 3, 8);
  camera.lookAt(0, 0.5, 0);

  // ---- Dot-grid masking system ----
  setupDotGridMask();

  // Lights
  const ambient = new THREE.AmbientLight(0x0a4a4a, 0.6);
  scene.add(ambient);

  const dirLight = new THREE.DirectionalLight(0x5ac8c8, 0.8);
  dirLight.position.set(5, 8, 5);
  scene.add(dirLight);

  const pointCyan = new THREE.PointLight(0x0C9AA1, 1.5, 20);
  pointCyan.position.set(-3, 4, 2);
  scene.add(pointCyan);

  const pointMagenta = new THREE.PointLight(0x7DFDFE, 0.8, 15);
  pointMagenta.position.set(3, 2, -2);
  scene.add(pointMagenta);

  // Build scene
  buildDotGridPlane(); // background dot grid in 3D scene
  buildBoat(); // screens, wireframe clones, and terrain built inside STL load callback
  buildFish();
  buildParticles();

  // Setup animations
  setupScrollAnimations();
  setupRevealAnimations();
  setupNav();
  drawAboutCanvas();

  // Resize
  window.addEventListener('resize', onResize);

  // Start loop
  animate();
}

// ===== BOAT (loaded from STL) =====
let boatLoaded = false;

function buildBoat() {
  boatGroup = new THREE.Group();
  boatGroup.position.y = 0.3;
  scene.add(boatGroup);

  const loader = new THREE.STLLoader();
  loader.load('3d assets/bass_boat.stl', function (geometry) {
    // --- Orientation fix: STL is Z-up, Three.js is Y-up ---
    geometry.rotateX(-Math.PI / 2);
    // Rotate so bow (front) points toward +Z (faces camera)
    geometry.rotateY(Math.PI);

    // Center the geometry
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    const center = new THREE.Vector3();
    box.getCenter(center);
    geometry.translate(-center.x, -center.y, -center.z);

    // Scale to fit scene (~6 units long)
    geometry.computeBoundingBox();
    const size = new THREE.Vector3();
    geometry.boundingBox.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    const targetSize = 6;
    const scaleFactor = targetSize / maxDim;
    geometry.scale(scaleFactor, scaleFactor, scaleFactor);

    // Recompute after scale and sit the boat at water level
    geometry.computeBoundingBox();
    const finalBox = geometry.boundingBox;
    const finalSize = new THREE.Vector3();
    finalBox.getSize(finalSize);
    // Shift hull so bottom sits near y=0
    geometry.translate(0, -finalBox.min.y * 0.3, 0);

    console.log('Boat final size:', finalSize, 'box:', finalBox);

    // Compute normals for nice lighting
    geometry.computeVertexNormals();

    // Store bounding info for screen placement
    geometry.computeBoundingBox();
    boatGroup.userData.hullBox = geometry.boundingBox.clone();
    boatGroup.userData.hullSize = new THREE.Vector3();
    geometry.boundingBox.getSize(boatGroup.userData.hullSize);

    // Main boat mesh
    const boatMat = new THREE.MeshPhongMaterial({
      color: 0x053030,
      specular: 0x0C9AA1,
      shininess: 60,
      transparent: true,
      opacity: 1,
      flatShading: false
    });
    const boatMesh = new THREE.Mesh(geometry, boatMat);
    boatMesh.name = 'hull';
    boatMesh.castShadow = true;
    boatMesh.receiveShadow = true;
    boatGroup.add(boatMesh);

    // Now that the STL is loaded, build dependent elements
    buildScreens();
    buildWireframeClones();
    buildWater(); // terrain topology below the hull
    boatLoaded = true;
  },
    // Progress callback
    function (xhr) {
      console.log('Boat STL: ' + (xhr.loaded / xhr.total * 100).toFixed(0) + '% loaded');
    },
    // Error callback
    function (error) {
      console.error('Error loading boat STL:', error);
      // Fallback: build a simple placeholder boat
      const fallbackGeo = new THREE.BoxGeometry(2, 0.5, 5);
      const fallbackMat = new THREE.MeshPhongMaterial({
        color: 0x053030, specular: 0x0C9AA1, shininess: 60,
        transparent: true, opacity: 1
      });
      const fallback = new THREE.Mesh(fallbackGeo, fallbackMat);
      fallback.name = 'hull';
      boatGroup.add(fallback);

      buildScreens();
      buildWireframeClones();
      buildWater();
      boatLoaded = true;
    });
}

// ===== SCREENS =====
function buildScreens() {
  // Positions from user's editor log — rotations fixed so screens face
  // the stern (-X direction) and tilt upward toward the operator.
  //
  // A PlaneGeometry faces +Z by default. To face the stern (-X):
  //   rotY = +π/2  (turns the normal from +Z toward -X)
  // Then tilt the top of the screen backward (upward angle):
  //   rotX = negative value (e.g. -0.3 = ~17° upward tilt)

  // Exact positions and rotations from user's editor session.
  // All screens face stern (-X) via rotY ≈ π/2, tilted upward via rotX.

  const screenDefs = [
    // --- BOW / CONSOLE SCREENS (3 screens at the helm) ---
    // Screen 1: Main center console (large, primary display)
    { w: 0.55, h: 0.4, pos: [2.11, 0.41, -0.05], rot: [-0.297, 1.571, 0.244], color: 0x0C9AA1 },
    // Screen 2: Right console screen (angled inward)
    { w: 0.35, h: 0.28, pos: [1.85, 0.33, 0.27], rot: [-0.122, 1.222, 0], color: 0x7DFDFE },
    // Screen 3: Upper console screen
    { w: 0.35, h: 0.28, pos: [2.24, 0.65, -0.02], rot: [0, 1.606, 0], color: 0x0C9AA1 },

    // --- SEAT SCREENS (1 in front of each seat) ---
    // Screen 4: Right seat screen
    { w: 0.3, h: 0.22, pos: [-0.09, 0.53, 0.56], rot: [-0.454, 1.553, 0.489], color: 0x7DFDFE },
    // Screen 5: Left seat screen
    { w: 0.3, h: 0.22, pos: [-0.09, 0.37, -0.50], rot: [0.035, 1.571, 0], color: 0x0C9AA1 },
  ];

  screenDefs.forEach((def, i) => {
    const geo = new THREE.PlaneGeometry(def.w, def.h);
    const mat = new THREE.MeshBasicMaterial({
      color: def.color, transparent: true, opacity: 0.7, side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(...def.pos);
    mesh.rotation.set(...def.rot);
    boatGroup.add(mesh);
    screenMeshes.push(mesh);

    // Glow border
    const edgeGeo = new THREE.EdgesGeometry(geo);
    const edgeMat = new THREE.LineBasicMaterial({ color: def.color, transparent: true, opacity: 0.9 });
    const edges = new THREE.LineSegments(edgeGeo, edgeMat);
    edges.position.copy(mesh.position);
    edges.rotation.copy(mesh.rotation);
    boatGroup.add(edges);
    screenEdges.push(edges);

    // Inner grid lines for "data" effect
    const gridGeo = new THREE.PlaneGeometry(def.w * 0.85, def.h * 0.85, 4, 3);
    const gridMat = new THREE.MeshBasicMaterial({
      color: def.color, wireframe: true, transparent: true, opacity: 0.25
    });
    const grid = new THREE.Mesh(gridGeo, gridMat);
    grid.position.copy(mesh.position);
    // Offset grid slightly in front of the screen face
    const fwd = new THREE.Vector3(0, 0, 0.002);
    fwd.applyEuler(mesh.rotation);
    grid.position.add(fwd);
    grid.rotation.copy(mesh.rotation);
    boatGroup.add(grid);
    screenMeshes.push(grid);
  });
}

// ===== WIREFRAME CLONES (disabled — boat stays solid) =====
function buildWireframeClones() {
  // No longer creating wireframe clones of the boat hull.
  // The boat remains solid throughout the entire animation.
}

// ===== FISH (Low Poly Bass STL — replaces procedural fish) =====
function buildFish() {
  // Create a group for the bass model, added to scene (not boatGroup)
  // so we can lock it to terrain-space manually
  bassModelGroup = new THREE.Group();
  bassModelGroup.position.set(0, -1.0, 0);
  bassModelGroup.visible = false; // hidden until fish reveal phase
  scene.add(bassModelGroup);



  // Load the LowPolyBass STL
  const loader = new THREE.STLLoader();
  loader.load('3d assets/LowPolyBass.stl', function (geometry) {
    // --- Orientation fix: STL is Z-up, Three.js is Y-up ---
    geometry.rotateX(-Math.PI / 2);

    // Center the geometry
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    const center = new THREE.Vector3();
    box.getCenter(center);
    geometry.translate(-center.x, -center.y, -center.z);

    // Scale to fit (~3.5 units)
    geometry.computeBoundingBox();
    const size = new THREE.Vector3();
    geometry.boundingBox.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    const targetSize = 3.5;
    const scaleFactor = targetSize / maxDim;
    geometry.scale(scaleFactor, scaleFactor, scaleFactor);

    geometry.computeVertexNormals();
    geometry.computeBoundingBox();

    console.log('LowPolyBass loaded, size:', size.multiplyScalar(scaleFactor));

    // Decimate via vertex clustering — snap vertices to a 3D grid,
    // rebuild connected triangles, then draw wireframe edges.
    // This produces a proper connected mesh wireframe (not scattered points).
    const pos = geometry.attributes.position;
    const gridSize = 0.14; // larger = fewer edges, more low-poly look
    const vertexMap = new Map();
    const newPositions = [];
    const newIndices = [];
    let newVertexCount = 0;
    const vertexRemap = new Int32Array(pos.count);

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const gx = Math.round(x / gridSize);
      const gy = Math.round(y / gridSize);
      const gz = Math.round(z / gridSize);
      const key = gx + ',' + gy + ',' + gz;

      if (!vertexMap.has(key)) {
        vertexMap.set(key, newVertexCount);
        // Use snapped grid position for cleaner mesh
        newPositions.push(gx * gridSize, gy * gridSize, gz * gridSize);
        newVertexCount++;
      }
      vertexRemap[i] = vertexMap.get(key);
    }

    // Rebuild faces — skip degenerate triangles where vertices collapsed
    const faceCount = pos.count / 3;
    const edgeSet = new Set(); // deduplicate shared edges
    const edgePoints = [];

    for (let f = 0; f < faceCount; f++) {
      const a = vertexRemap[f * 3];
      const b = vertexRemap[f * 3 + 1];
      const c = vertexRemap[f * 3 + 2];
      if (a === b || b === c || a === c) continue; // degenerate

      // Add each edge (deduplicated)
      const edges = [[a, b], [b, c], [c, a]];
      edges.forEach(([v0, v1]) => {
        const eKey = Math.min(v0, v1) + ':' + Math.max(v0, v1);
        if (!edgeSet.has(eKey)) {
          edgeSet.add(eKey);
          const i0 = v0 * 3, i1 = v1 * 3;
          edgePoints.push(
            newPositions[i0], newPositions[i0 + 1], newPositions[i0 + 2],
            newPositions[i1], newPositions[i1 + 1], newPositions[i1 + 2]
          );
        }
      });
    }

    console.log('Bass wireframe: ' + edgeSet.size + ' edges from ' + newVertexCount + ' vertices');

    const wireGeo = new THREE.BufferGeometry();
    wireGeo.setAttribute('position', new THREE.Float32BufferAttribute(edgePoints, 3));

    const wireMat = new THREE.LineBasicMaterial({
      color: 0x0C9AA1,
      transparent: true,
      opacity: 0
    });
    const wireLines = new THREE.LineSegments(wireGeo, wireMat);
    wireLines.name = 'bass_wireframe';
    bassModelGroup.add(wireLines);
  },
    function (xhr) {
      console.log('LowPolyBass STL: ' + (xhr.loaded / xhr.total * 100).toFixed(0) + '% loaded');
    },
    function (error) {
      console.error('Error loading LowPolyBass STL:', error);
    });
}

// ===== UNDERWATER TERRAIN TOPOLOGY =====
let terrainMesh, terrainEdges, terrainContours;
let terrainAnchor; // follows boat yaw only (no wave bob, no pitch/roll)

function buildWater() {
  // Water uses original dimensions; terrain is expanded separately
  const waterSizeX = 14, waterSizeZ = 10;
  const sizeX = 42, sizeZ = 30;

  // ---- LAYER 1: Opaque animated water surface (visible at start) ----
  const waterSegW = 100, waterSegH = 100;
  waterGeo = new THREE.PlaneGeometry(waterSizeX, waterSizeZ, waterSegW, waterSegH);
  waterGeo.rotateX(-Math.PI / 2);

  // Store original Y positions for ripple animation
  const wPos = waterGeo.attributes.position;
  waterGeo.userData.baseY = new Float32Array(wPos.count);
  for (let i = 0; i < wPos.count; i++) {
    waterGeo.userData.baseY[i] = wPos.getY(i);
  }

  const waterMat = new THREE.MeshPhongMaterial({
    color: 0x1E1E1E,
    specular: 0x0C9AA1,
    shininess: 90,
    transparent: true,
    opacity: 0.95,
    side: THREE.DoubleSide,
    flatShading: false
  });
  waterPlane = new THREE.Mesh(waterGeo, waterMat);
  waterPlane.position.y = -0.35 - 0.3; // offset to compensate for boatGroup.position.y
  waterPlane.name = 'water_surface';
  waterPlane.receiveShadow = true;
  boatGroup.add(waterPlane); // water moves with the boat

  // ---- LAYER 2: Terrain wiremesh topology (hidden initially, revealed on scroll) ----
  const segW = 120, segH = 120;
  const terrainGeo = new THREE.PlaneGeometry(sizeX, sizeZ * 0.8, segW, segH);
  terrainGeo.rotateX(-Math.PI / 2);

  const pos = terrainGeo.attributes.position;

  function terrainHeight(x, z) {
    let h = Math.sin(x * 0.4) * Math.cos(z * 0.5) * 0.8;
    h += Math.exp(-z * z * 0.8) * -0.5;
    h += Math.sin(x * 1.2 + z * 0.8) * 0.3;
    h += Math.cos(x * 0.7 - z * 1.5) * 0.25;
    h += Math.sin(x * 3.0 + 1.5) * Math.cos(z * 2.8 + 0.7) * 0.12;
    h += Math.sin(x * 4.5 - z * 3.2) * 0.06;
    h += Math.min(0, (z - 2.0) * 0.3);
    const dist = Math.sqrt(x * x + z * z);
    h += Math.exp(-dist * dist * 0.06) * 0.4;
    return h;
  }

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, terrainHeight(x, z));
  }
  pos.needsUpdate = true;
  terrainGeo.computeVertexNormals();

  // Create an anchor group that follows the boat's yaw but NOT its wave motion
  terrainAnchor = new THREE.Group();
  terrainAnchor.position.y = 0; // stays at fixed height
  scene.add(terrainAnchor);

  const terrainMat = new THREE.MeshBasicMaterial({
    color: 0x0C9AA1, wireframe: true, transparent: true, opacity: 0
  });
  terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.position.y = -1.8;
  terrainMesh.name = 'terrain';
  terrainAnchor.add(terrainMesh);

  const edgeGeo = new THREE.EdgesGeometry(terrainGeo, 12);
  const edgeMat = new THREE.LineBasicMaterial({
    color: 0x7DFDFE, transparent: true, opacity: 0
  });
  terrainEdges = new THREE.LineSegments(edgeGeo, edgeMat);
  terrainEdges.position.copy(terrainMesh.position);
  terrainEdges.name = 'terrain_edges';
  terrainAnchor.add(terrainEdges);

  terrainContours = new THREE.Group();
  terrainContours.position.copy(terrainMesh.position);
  terrainContours.name = 'terrain_contours';

  const contourLevels = [-0.8, -0.4, 0.0, 0.3, 0.6];
  const contourColors = [0x032828, 0x053a3a, 0x0C9AA1, 0x4dcbcf, 0x7DFDFE];

  contourLevels.forEach((level, ci) => {
    const points = [];
    const step = 0.3;
    for (let x = -sizeX / 2; x < sizeX / 2; x += step) {
      for (let z = -sizeZ / 2 * 0.8; z < sizeZ / 2 * 0.8; z += step) {
        const h = terrainHeight(x, z);
        const hR = terrainHeight(x + step, z);
        const hD = terrainHeight(x, z + step);
        if ((h - level) * (hR - level) < 0 || (h - level) * (hD - level) < 0) {
          points.push(new THREE.Vector3(x, level, z));
        }
      }
    }

    if (points.length > 0) {
      const contourGeo = new THREE.BufferGeometry().setFromPoints(points);
      const contourMat = new THREE.PointsMaterial({
        color: contourColors[ci], size: 0.04, transparent: true, opacity: 0
      });
      const contourPts = new THREE.Points(contourGeo, contourMat);
      terrainContours.add(contourPts);
    }
  });

  terrainContours.visible = false; // disabled — dots look like visual noise
  terrainAnchor.add(terrainContours);
}

// ===== PARTICLES =====
function buildParticles() {
  const count = 300;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 30;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 20;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 30;
  }
  const particleGeo = new THREE.BufferGeometry();
  particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const particleMat = new THREE.PointsMaterial({
    color: 0x7DFDFE, size: 0.04, transparent: true, opacity: 0.4
  });
  const particles = new THREE.Points(particleGeo, particleMat);
  particles.name = 'ambient_particles'; // excluded from dot-grid mask
  scene.add(particles);
}

// ===== ABOUT CANVAS (decorative mesh graphic) =====
function drawAboutCanvas() {
  const c = document.getElementById('about-mesh-canvas');
  if (!c) return;
  const ctx = c.getContext('2d');
  c.width = 500; c.height = 400;

  function draw() {
    ctx.clearRect(0, 0, 500, 400);
    ctx.strokeStyle = 'rgba(12, 154, 161, 0.15)';
    ctx.lineWidth = 1;
    const t = Date.now() * 0.001;
    for (let x = 0; x < 500; x += 20) {
      for (let y = 0; y < 400; y += 20) {
        const dx = Math.sin(t + x * 0.01 + y * 0.005) * 5;
        const dy = Math.cos(t + y * 0.01) * 5;
        ctx.beginPath();
        ctx.arc(x + dx, y + dy, 1.5, 0, Math.PI * 2);
        ctx.stroke();
        if (x < 480) {
          ctx.beginPath();
          ctx.moveTo(x + dx, y + dy);
          const dx2 = Math.sin(t + (x + 20) * 0.01 + y * 0.005) * 5;
          const dy2 = Math.cos(t + y * 0.01) * 5;
          ctx.lineTo(x + 20 + dx2, y + dy2);
          ctx.stroke();
        }
        if (y < 380) {
          ctx.beginPath();
          ctx.moveTo(x + dx, y + dy);
          const dx3 = Math.sin(t + x * 0.01 + (y + 20) * 0.005) * 5;
          const dy3 = Math.cos(t + (y + 20) * 0.01) * 5;
          ctx.lineTo(x + dx3, y + 20 + dy3);
          ctx.stroke();
        }
      }
    }
    requestAnimationFrame(draw);
  }
  draw();
}

// ===== SCROLL ANIMATIONS =====
function setupScrollAnimations() {
  gsap.registerPlugin(ScrollTrigger);

  // Hero text parallax out
  gsap.to('.hero-content', {
    scrollTrigger: {
      trigger: '#hero',
      start: 'top top',
      end: 'bottom top',
      scrub: true
    },
    opacity: 0, y: -120
  });

  gsap.to('.scroll-indicator', {
    scrollTrigger: {
      trigger: '#hero',
      start: '10% top',
      end: '30% top',
      scrub: true
    },
    opacity: 0
  });

  // ===== TRANSFORMATION TIMELINE =====
  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: '#transformation',
      start: 'top top',
      end: '+=4500',
      scrub: 1,
      pin: true,
      anticipatePin: 1
    }
  });

  // Phase 1: Screens AND water flicker and fade together (0-20%)
  tl.to(animState, { screenOpacity: 0.3, waterOpacity: 0.4, duration: 0.04 })
    .to(animState, { screenOpacity: 0.8, waterOpacity: 0.9, duration: 0.015 })
    .to(animState, { screenOpacity: 0.1, waterOpacity: 0.15, duration: 0.025 })
    .to(animState, { screenOpacity: 0.6, waterOpacity: 0.7, duration: 0.015 })
    .to(animState, { screenOpacity: 0, waterOpacity: 0, duration: 0.065 });

  // Show problem text
  tl.to('#t-text-1', { opacity: 1, duration: 0.06 }, 0.04)
    .to('#t-text-1', { opacity: 0, duration: 0.04 }, 0.16);

  // Phase 2: Terrain wiremesh topology revealed (20-60%) — extended dwell time
  tl.to(animState, { terrainReveal: 1, duration: 0.20 }, 0.20)
    .to(animState, { cameraX: 1.7, cameraZ: 0, duration: 0.15 }, 0.20)
    .to(animState, { cameraY: 2.4, duration: 0.15 }, 0.25)
    .to(animState, { lookAtX: 8.77, lookAtY: -4.67, lookAtZ: 0, duration: 0.15 }, 0.20)
    .to(animState, { fov: 70, duration: 0.15, ease: 'power2.inOut' }, 0.20);

  // Show solution text
  tl.to('#t-text-2', { opacity: 1, duration: 0.06 }, 0.25)
    .to('#t-text-2', { opacity: 0, duration: 0.04 }, 0.42);

  // Slow the boat spin and begin smooth alignment to cinematic angle
  tl.to(animState, { boatRotSpeed: 0, duration: 0.10, ease: 'power2.out' }, 0.28);
  // Smoothly steer the boat toward BOAT_TARGET_YAW (shortest arc, handled in updateScene)
  tl.to(animState, { boatAlignToTarget: 1, duration: 0.18, ease: 'power3.inOut' }, 0.30);

  // Lock camera to boat — starts after alignment is well underway
  tl.to(animState, { cameraLockedToBoat: 1, duration: 0.15, ease: 'power2.inOut' }, 0.44);

  // Phase 3: Fish reveal (68-88%) — pushed later for more wireframe viewing time
  tl.to(animState, { fishVisibility: 1, duration: 0.15 }, 0.68)
    .to(animState, { cameraY: 2.4, duration: 0.12 }, 0.72)
    .to(animState, { scanLinePos: 3, duration: 0.12 }, 0.74);

  // Show fish text ("See what others can't")
  tl.to('#t-text-3', { opacity: 1, duration: 0.06 }, 0.72)
    .to('#t-text-3', { opacity: 0, duration: 0.06 }, 0.88);

  // Phase 4: Fade out canvas (90-100%)
  tl.to(animState, { canvasOpacity: 0, duration: 0.10 }, 0.90);

  // ===== CONTENT SECTION CANVAS FADE =====
  ScrollTrigger.create({
    trigger: '.content-section',
    start: 'top 90%',
    onEnter: () => {
      gsap.to('#three-canvas', { opacity: 0, duration: 0.5 });
    },
    onLeaveBack: () => {
      gsap.to('#three-canvas', { opacity: 1, duration: 0.5 });
    }
  });
}

// ===== REVEAL ANIMATIONS =====
function setupRevealAnimations() {
  // Use IntersectionObserver for reliable reveal
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

  document.querySelectorAll('.reveal').forEach((el, i) => {
    // Add stagger delay via CSS variable
    el.style.transitionDelay = ((i % 4) * 0.1) + 's';
    observer.observe(el);
  });
}

// ===== NAV =====
function setupNav() {
  const nav = document.getElementById('main-nav');
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 50);
  });

  // Mobile toggle
  const toggle = document.getElementById('nav-toggle');
  const links = document.querySelector('.nav-links');
  if (toggle) {
    toggle.addEventListener('click', () => {
      links.style.display = links.style.display === 'flex' ? 'none' : 'flex';
    });
  }
}

// ===== WAVE HEIGHT FUNCTION (reused by water mesh + boat) =====
function getWaveHeight(x, z, t) {
  const windDirX = 0.85, windDirZ = 0.53;
  const windDot = x * windDirX + z * windDirZ;
  const crossDot = x * (-windDirZ) + z * windDirX;

  let h = Math.sin(windDot * 0.6 + t * 1.1) * 0.12;
  h += Math.sin(windDot * 0.9 - t * 0.85) * 0.08;
  h += Math.sin(windDot * 0.4 + t * 0.6) * 0.06;
  h += Math.sin(crossDot * 1.1 + t * 1.2) * 0.055;
  h += Math.sin(crossDot * 1.6 - t * 0.9) * 0.035;
  h += Math.sin(windDot * 2.2 + crossDot * 0.8 + t * 1.8) * 0.04;
  h += Math.sin(windDot * 1.7 - crossDot * 1.3 + t * 1.5) * 0.03;
  h += Math.cos(windDot * 2.8 + crossDot * 1.5 - t * 2.1) * 0.02;
  h += Math.sin(x * 4.5 + z * 3.2 + t * 3.5) * 0.012;
  h += Math.cos(x * 5.8 - z * 4.1 - t * 4.0) * 0.008;
  h += Math.sin(x * 7.0 + z * 6.5 + t * 4.5) * 0.005;
  h += Math.sin(x * 1.1 + z * 0.7 + t * 0.5) * Math.cos(x * 0.5 - z * 1.2 + t * 0.6) * 0.025;
  return h;
}

// ===== UPDATE FUNCTIONS =====
function updateScene() {
  const t = clock.getElapsedTime();

  // In editor mode, skip auto-rotation and camera overrides
  if (!editorMode) {
    // Boat rides the waves — freeze ALL motion when camera editor is active
    if (boatGroup && !window.cameraEditorActive) {
      // Sample wave at boat origin and nearby points for slope
      const bx = 0, bz = 0; // boat center in local coords
      const sampleDist = 1.5; // distance to sample for tilt

      const hCenter = getWaveHeight(bx, bz, t);
      const hFront = getWaveHeight(bx + sampleDist, bz, t);
      const hBack = getWaveHeight(bx - sampleDist, bz, t);
      const hLeft = getWaveHeight(bx, bz - sampleDist, t);
      const hRight = getWaveHeight(bx, bz + sampleDist, t);

      // Pitch (nose up/down) from front-to-back slope
      const pitch = Math.atan2(hFront - hBack, sampleDist * 2) * 0.8;
      // Roll (side-to-side) from left-to-right slope
      const roll = Math.atan2(hRight - hLeft, sampleDist * 2) * 0.8;

      // Smooth the boat position/rotation for natural feel
      const waterSurfaceY = -0.35; // matches waterPlane.position.y
      const targetY = 0.3 + hCenter + waterSurfaceY * 0.3;
      boatGroup.position.y += (targetY - boatGroup.position.y) * 0.08;

      // Slow yaw rotation + wave-driven pitch and roll
      if (!window.rotationPaused) {
        animState.boatRotY += 0.001 * animState.boatRotSpeed;
      }

      // Smooth shortest-path alignment toward cinematic target yaw
      // Buffer the scroll-driven value through a per-frame lerp to kill jitter
      if (!updateScene._smoothAlign) updateScene._smoothAlign = 0;
      updateScene._smoothAlign += (animState.boatAlignToTarget - updateScene._smoothAlign) * 0.05;
      const align = updateScene._smoothAlign;

      if (align > 0.001) {
        // Normalize current yaw into [-PI, PI] range
        let current = animState.boatRotY % (Math.PI * 2);
        if (current > Math.PI) current -= Math.PI * 2;
        if (current < -Math.PI) current += Math.PI * 2;

        // Find shortest delta to target
        let delta = BOAT_TARGET_YAW - current;
        if (delta > Math.PI) delta -= Math.PI * 2;
        if (delta < -Math.PI) delta += Math.PI * 2;

        // Steer toward target — blend strength increases with smoothed align factor
        animState.boatRotY += delta * align * 0.04;
      }

      boatGroup.rotation.y = animState.boatRotY + Math.sin(t * 0.3) * 0.015 * animState.boatRotSpeed;
      boatGroup.rotation.x += (pitch - boatGroup.rotation.x) * 0.06;
      boatGroup.rotation.z += (roll - boatGroup.rotation.z) * 0.06;
    }

    // Bass model is independent in the scene — stays fixed, doesn't bob
    // (position set once during load, no per-frame updates needed)

    // Sync terrain anchor to boat's yaw only (no pitch, roll, or Y bobbing)
    if (terrainAnchor && boatGroup) {
      terrainAnchor.rotation.y = boatGroup.rotation.y;
    }

    // Camera (skip when camera editor has live control)
    if (!window.cameraEditorActive) {
      // Smooth the lock factor through a per-frame lerp to decouple from scroll jitter
      if (!updateScene._smoothLockCam) updateScene._smoothLockCam = 0;
      updateScene._smoothLockCam += (animState.cameraLockedToBoat - updateScene._smoothLockCam) * 0.045;
      const lockCam = updateScene._smoothLockCam;

      // Smoothed lookAt target (persists across frames to prevent snap)
      if (!updateScene._smoothLookAt) {
        updateScene._smoothLookAt = new THREE.Vector3(animState.lookAtX, animState.lookAtY, animState.lookAtZ);
      }

      if (lockCam > 0.001 && boatGroup) {
        // Compute world-space targets from boat-local offsets
        boatGroup.updateMatrixWorld();
        const worldCamPos = CAM_LOCAL_POS.clone().applyMatrix4(boatGroup.matrixWorld);
        const worldLookAt = CAM_LOCAL_LOOKAT.clone().applyMatrix4(boatGroup.matrixWorld);

        // Blend between free camera (animState values) and boat-locked camera
        const freeX = animState.cameraX, freeY = animState.cameraY, freeZ = animState.cameraZ;
        const targetX = freeX * (1 - lockCam) + worldCamPos.x * lockCam;
        const targetY = freeY * (1 - lockCam) + worldCamPos.y * lockCam;
        const targetZ = freeZ * (1 - lockCam) + worldCamPos.z * lockCam;

        // Smooth camera position blend
        const camLerp = 0.04;
        camera.position.x += (targetX - camera.position.x) * camLerp;
        camera.position.y += (targetY - camera.position.y) * camLerp;
        camera.position.z += (targetZ - camera.position.z) * camLerp;

        // Smooth lookAt blend — lerp the target point each frame instead of snapping
        const freeLX = animState.lookAtX, freeLY = animState.lookAtY, freeLZ = animState.lookAtZ;
        const rawLookX = freeLX * (1 - lockCam) + worldLookAt.x * lockCam;
        const rawLookY = freeLY * (1 - lockCam) + worldLookAt.y * lockCam;
        const rawLookZ = freeLZ * (1 - lockCam) + worldLookAt.z * lockCam;

        updateScene._smoothLookAt.x += (rawLookX - updateScene._smoothLookAt.x) * 0.04;
        updateScene._smoothLookAt.y += (rawLookY - updateScene._smoothLookAt.y) * 0.04;
        updateScene._smoothLookAt.z += (rawLookZ - updateScene._smoothLookAt.z) * 0.04;
        camera.lookAt(updateScene._smoothLookAt);
      } else {
        camera.position.x += (animState.cameraX - camera.position.x) * 0.05;
        camera.position.y += (animState.cameraY - camera.position.y) * 0.05;
        camera.position.z += (animState.cameraZ - camera.position.z) * 0.05;

        // Also smooth lookAt in free mode
        updateScene._smoothLookAt.x += (animState.lookAtX - updateScene._smoothLookAt.x) * 0.06;
        updateScene._smoothLookAt.y += (animState.lookAtY - updateScene._smoothLookAt.y) * 0.06;
        updateScene._smoothLookAt.z += (animState.lookAtZ - updateScene._smoothLookAt.z) * 0.06;
        camera.lookAt(updateScene._smoothLookAt);
      }
    }
  }

  // Screen opacity (skip in editor — screens always full visible)
  if (!editorMode) {
    screenMeshes.forEach(m => {
      m.material.opacity = animState.screenOpacity * (m.material.wireframe ? 0.25 : 0.7);
    });
    screenEdges.forEach(e => {
      e.material.opacity = animState.screenOpacity * 0.9;
    });
  }

  // ---- Wind-driven lake water ripples (freeze when camera editor active) ----
  if (waterGeo && waterPlane && !window.cameraEditorActive) {
    const wPos = waterGeo.attributes.position;
    const baseY = waterGeo.userData.baseY;

    for (let i = 0; i < wPos.count; i++) {
      const x = wPos.getX(i);
      const z = wPos.getZ(i);

      // Shared wave height
      let h = getWaveHeight(x, z, t);

      // Boat wake — water-only effect (concentric + V-wake)
      const dist = Math.sqrt(x * x + z * z);
      h += Math.sin(dist * 2.5 - t * 2.8) * 0.035 * Math.exp(-dist * 0.18);
      if (x < 0) {
        const wake = Math.exp(-Math.abs(z - x * 0.3) * 2.0) * Math.exp(x * 0.3);
        h += Math.sin(x * 3.0 - t * 3.0) * 0.045 * wake;
      }

      wPos.setY(i, baseY[i] + h);
    }
    wPos.needsUpdate = true;
    waterGeo.computeVertexNormals();
    // Water opacity follows animState
    waterPlane.material.opacity = animState.waterOpacity * 0.95;
    waterPlane.visible = animState.waterOpacity > 0.01;
  }

  // Terrain wiremesh topology — revealed after screens disappear and water fades
  // Hide entirely until terrainReveal kicks in to prevent z-fighting with water
  if (terrainAnchor) {
    const tr = animState.terrainReveal;
    terrainAnchor.visible = tr > 0.01;
  }
  if (terrainMesh && terrainMesh.material) {
    const tr = animState.terrainReveal;
    const pulse = Math.sin(t * 1.5) * 0.03 + 0.12;
    terrainMesh.material.opacity = pulse * tr;

    if (terrainEdges) {
      terrainEdges.material.opacity = pulse * 1.6 * tr;
    }
    // Contour points disabled — they appear as distracting random blue dots
  }

  // Low Poly Bass wireframe — revealed during fish phase (Phase 3)
  const fv = animState.fishVisibility;
  if (bassModelGroup) {
    bassModelGroup.visible = fv > 0.01;
    const bassPulse = Math.sin(t * 2.0) * 0.05 + 0.85;
    bassModelGroup.children.forEach(child => {
      if (child.material) {
        child.material.opacity = bassPulse * fv * 0.85;
      }
    });


  }

  // Animate FOV (skip when camera editor is actively controlling it)
  if (!window.cameraEditorActive && camera.fov !== animState.fov) {
    camera.fov = animState.fov;
    camera.updateProjectionMatrix();
  }

  // Canvas opacity (force full opacity when camera editor is active)
  renderer.domElement.style.opacity = window.cameraEditorActive ? 1 : animState.canvasOpacity;
}

// ===== RENDER LOOP =====
function animate() {
  requestAnimationFrame(animate);
  if (orbitControls && editorMode) orbitControls.update();
  updateScene();
  renderer.render(scene, camera);
  // Overlay the masked dot grid on top
  renderDotGridOverlay();
}

// ===== RESIZE =====
function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  // Resize dot grid mask
  if (maskRenderTarget) {
    const pr = Math.min(window.devicePixelRatio, 2);
    maskRenderTarget.setSize(
      Math.floor(window.innerWidth * pr * 0.5),
      Math.floor(window.innerHeight * pr * 0.5)
    );
  }
  if (dotGridQuad && dotGridQuad.material.uniforms) {
    dotGridQuad.material.uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
    dotGridQuad.material.uniforms.uMaskRes.value.set(maskRenderTarget.width, maskRenderTarget.height);
  }
}

// ===== DOT GRID MASKING SYSTEM =====
// Renders the dot grid ONLY where 3D objects are NOT visible.
// Uses a two-pass approach entirely on the GPU:
//  1. Mask pass: render all scene objects as white silhouettes on black
//  2. Dot pass: a full-screen shader quad draws dots procedurally,
//     sampling the mask texture to skip dots where objects are visible.
// No CPU pixel readback — everything runs on the GPU for maximum performance.

let dotGridScene, dotGridQuad;
let maskOverrideMat, maskOverrideLineMat, maskOverridePointMat;

function setupDotGridMask() {
  // Create a low-res render target for the mask
  const pr = Math.min(window.devicePixelRatio, 2);
  maskRenderTarget = new THREE.WebGLRenderTarget(
    Math.floor(window.innerWidth * pr * 0.5),
    Math.floor(window.innerHeight * pr * 0.5)
  );

  // Pre-create override materials for the mask pass
  maskOverrideMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  maskOverrideLineMat = new THREE.LineBasicMaterial({ color: 0xffffff });
  maskOverridePointMat = new THREE.PointsMaterial({ color: 0xffffff, size: 3 });

  // Create dot grid shader material
  const dotGridMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uMask: { value: maskRenderTarget.texture },
      uMaskRes: { value: new THREE.Vector2(maskRenderTarget.width, maskRenderTarget.height) },
      uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
      uSpacing: { value: 40.0 },
      uDotRadius: { value: 1.2 },
      uDotColor: { value: new THREE.Vector3(0.357, 0.4, 0.404) }, // #5B6668
      uOpacity: { value: 1.0 }
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D uMask;
      uniform vec2 uMaskRes;
      uniform vec2 uResolution;
      uniform float uSpacing;
      uniform float uDotRadius;
      uniform vec3 uDotColor;
      uniform float uOpacity;
      varying vec2 vUv;

      void main() {
        // Convert UV to pixel coordinates
        vec2 pixel = vUv * uResolution;

        // Compute distance to nearest dot center
        vec2 dotCenter = (floor(pixel / uSpacing) + 0.5) * uSpacing;
        float dist = length(pixel - dotCenter);

        // Smooth dot shape
        float dot = 1.0 - smoothstep(uDotRadius - 0.5, uDotRadius + 0.5, dist);

        // Sample mask with a small kernel for stable edges.
        // Average 5 samples (center + 4 neighbors) to smooth out
        // flickering at object boundaries like the water surface.
        vec2 texelSize = 1.0 / uMaskRes;
        float mask = texture2D(uMask, vUv).r;
        mask += texture2D(uMask, vUv + vec2(texelSize.x * 2.0, 0.0)).r;
        mask += texture2D(uMask, vUv - vec2(texelSize.x * 2.0, 0.0)).r;
        mask += texture2D(uMask, vUv + vec2(0.0, texelSize.y * 2.0)).r;
        mask += texture2D(uMask, vUv - vec2(0.0, texelSize.y * 2.0)).r;
        mask *= 0.2; // average of 5 samples

        // Wide smoothstep for stable edge transitions
        float maskFade = 1.0 - smoothstep(0.02, 0.25, mask);

        float alpha = dot * maskFade * uOpacity;

        if (alpha < 0.01) discard;
        gl_FragColor = vec4(uDotColor, alpha);
      }
    `
  });

  // Create a full-screen quad — uses NDC coordinates directly
  const quadGeo = new THREE.PlaneGeometry(2, 2);
  dotGridQuad = new THREE.Mesh(quadGeo, dotGridMaterial);
  dotGridQuad.frustumCulled = false;

  // Separate scene for the dot grid quad (rendered independently)
  dotGridScene = new THREE.Scene();
  dotGridScene.add(dotGridQuad);
}


function renderDotGridOverlay() {
  if (!maskRenderTarget || !dotGridScene) return;

  // Skip when canvas is faded out (content sections visible)
  const canvasOp = window.cameraEditorActive ? 1 : animState.canvasOpacity;
  if (canvasOp < 0.01) return;

  // Update dot grid opacity
  dotGridQuad.material.uniforms.uOpacity.value = canvasOp;

  // --- MASK PASS: render all scene objects as white silhouettes ---
  const origFog = scene.fog;
  scene.fog = null;

  const overrides = [];
  const hiddenMats = [];

  scene.traverse(function (obj) {
    if (!obj.visible) return;
    if (obj === scene) return;

    // Skip elements that should NOT mask the dot grid:
    // - ambient particles (decorative floating points)
    // - bass wireframe model (thin lines cause unstable masking)
    if (obj.name === 'ambient_particles') return;
    if (obj === bassModelGroup) return;
    // Skip anything parented under bassModelGroup
    let skipParent = obj.parent;
    while (skipParent) {
      if (skipParent === bassModelGroup) return;
      skipParent = skipParent.parent;
    }

    if (obj.material) {
      const mat = obj.material;
      const opacity = mat.opacity !== undefined ? mat.opacity : 1;
      overrides.push({ obj: obj, mat: mat });

      if (opacity > 0.05) {
        if (obj.isLineSegments || obj.isLine) {
          obj.material = maskOverrideLineMat;
        } else if (obj.isPoints) {
          obj.material = maskOverridePointMat;
        } else {
          obj.material = maskOverrideMat;
        }
      } else {
        // Create a temporary invisible material
        const invisMat = new THREE.MeshBasicMaterial({ visible: false });
        obj.material = invisMat;
        hiddenMats.push(invisMat);
      }
    }
  });

  // Render mask to offscreen target
  const origTarget = renderer.getRenderTarget();
  renderer.setRenderTarget(maskRenderTarget);
  renderer.setClearColor(0x000000, 1);
  renderer.clear();
  renderer.render(scene, camera);

  // Restore
  renderer.setRenderTarget(origTarget);
  renderer.setClearColor(0x1E1E1E, 1);

  overrides.forEach(function (entry) {
    entry.obj.material = entry.mat;
  });
  scene.fog = origFog;

  // Dispose temporary invisible materials
  hiddenMats.forEach(function (m) { m.dispose(); });

  // --- DOT GRID PASS: render the shader quad using the mask ---
  // Use a simple orthographic camera for the full-screen quad
  // (the quad vertex shader outputs NDC directly, so any camera works)
  renderer.autoClear = false;
  renderer.render(dotGridScene, camera);
  renderer.autoClear = true;
}

// ===== DOT GRID BACKGROUND PLANE (placeholder) =====
function buildDotGridPlane() {
  // Dot grid is rendered via the shader-based mask system above.
  // No in-scene background plane needed.
}

// ===== LENIS SMOOTH SCROLL =====
function initLenis() {
  const lenis = new Lenis({
    duration: 1.2,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    orientation: 'vertical',
    smoothWheel: true
  });

  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
}

// ===== BOOT =====
window.addEventListener('DOMContentLoaded', () => {
  init();
  initLenis();
});
