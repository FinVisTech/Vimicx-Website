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
let bassModels = []; // Array of Low poly bass models — locked to terrain
let treeModelGroup; // Low poly tree wireframe
let ambientLight, dirLight, pointCyan, pointMagenta;

// Dot-grid masking system — renders dots only where no 3D objects are visible
let maskRenderTarget;
let editorMode = false;
let animState = {
  screenOpacity: 1,
  terrainReveal: 0,
  fishVisibility: 0,
  treeVisibility: 0,
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
  fov: window.innerWidth < 768 ? 75 : 45
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
  renderer.autoClear = true;

  // Scene
  scene = new THREE.Scene();

  // --- CAMERA SETTINGS START ---
  // Camera
  const initialFov = window.innerWidth < 768 ? 75 : 45;
  camera = new THREE.PerspectiveCamera(initialFov, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0.0, 3.0, 8.0);
  camera.lookAt(0.00, -0.42, -1.40);
  // --- CAMERA SETTINGS END ---

  // ---- Dot-grid masking system ----
  setupDotGridMask();

  // --- SCENE SETTINGS START ---
  renderer.setClearColor(0x1e1e1e, 1);
  scene.fog = new THREE.FogExp2(0x1e1e1e, 0.018);

  // Lights
  ambientLight = new THREE.AmbientLight(0xffffff, 0.60);
  scene.add(ambientLight);

  dirLight = new THREE.DirectionalLight(0xffffff, 0.80);
  dirLight.position.set(5, 8, 5);
  scene.add(dirLight);

  pointCyan = new THREE.PointLight(0xffffff, 1.50, 20);
  pointCyan.position.set(-3, 4, 2);
  scene.add(pointCyan);

  pointMagenta = new THREE.PointLight(0xffffff, 0.80, 15);
  pointMagenta.position.set(3, 2, -2);
  scene.add(pointMagenta);
  // --- SCENE SETTINGS END ---

  // Build scene
  buildDotGridPlane(); // background dot grid in 3D scene
  buildBoat(); // screens, wireframe clones, and terrain built inside STL load callback
  buildFish();
  buildTree();
  buildParticles();

  // Setup animations
  setupScrollAnimations();
  setupRevealAnimations();
  setupNav();
  setupImageSlider();

  // Resize
  window.addEventListener('resize', onResize);

  // Start loop
  animate();
}

// ===== BOAT (loaded from STL) =====
let boatLoaded = false;

function buildBoat() {
  boatGroup = new THREE.Group();
  scene.add(boatGroup);
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
      specular: 0xffffff,
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

    // --- BOAT SETTINGS START ---
    const DEG2RAD = Math.PI / 180;
    boatGroup.position.set(0.00, 0.30, 0.00);
    boatGroup.rotation.set(2 * DEG2RAD, 180 * DEG2RAD, 1 * DEG2RAD, 'YXZ');
    boatGroup.scale.set(1.00, 1.00, 1.00);
    const hull = boatGroup.children.find(c => c.name === 'hull');
    if (hull) hull.material.color.setHex(0x3b0202);
    // --- BOAT SETTINGS END ---

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
        color: 0x053030, specular: 0xffffff, shininess: 60,
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

  // --- SCREEN SETTINGS START ---
  const screenDefs = [
    // --- BOW / CONSOLE SCREENS (3 screens at the helm) ---
    // Screen 1: Main center console (large, primary display)
    { w: 0.55, h: 0.4, pos: [2.11, 0.41, -0.05], rot: [-0.297, 1.571, 0.244], color: 0x00f0ff },
    // Screen 2: Right console screen (angled inward)
    { w: 0.35, h: 0.28, pos: [1.85, 0.33, 0.27], rot: [-0.122, 1.222, 0], color: 0x00ff88 },
    // Screen 3: Upper console screen
    { w: 0.35, h: 0.28, pos: [2.24, 0.65, -0.02], rot: [0, 1.606, 0], color: 0x00f0ff },

    // --- SEAT SCREENS (1 in front of each seat) ---
    // Screen 4: Right seat screen
    { w: 0.3, h: 0.22, pos: [-0.09, 0.53, 0.56], rot: [-0.454, 1.553, 0.489], color: 0x8b5cf6 },
    // Screen 5: Left seat screen
    { w: 0.3, h: 0.22, pos: [-0.09, 0.37, -0.50], rot: [0.035, 1.571, 0], color: 0x00ff88 },
  ];
  // --- SCREEN SETTINGS END ---

  screenDefs.forEach((def, i) => {
    const geo = new THREE.PlaneGeometry(def.w, def.h);
    const mat = new THREE.MeshBasicMaterial({
      color: def.color, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(...def.pos);
    mesh.rotation.set(...def.rot);
    mesh.renderOrder = 10;
    boatGroup.add(mesh);
    screenMeshes.push(mesh);

    // Glow border
    const edgeGeo = new THREE.EdgesGeometry(geo);
    const edgeMat = new THREE.LineBasicMaterial({ color: def.color, transparent: true, opacity: 0.9, depthWrite: false });
    const edges = new THREE.LineSegments(edgeGeo, edgeMat);
    edges.position.copy(mesh.position);
    edges.rotation.copy(mesh.rotation);
    edges.renderOrder = 11;
    boatGroup.add(edges);
    screenEdges.push(edges);

    // Inner grid lines for "data" effect
    const gridGeo = new THREE.PlaneGeometry(def.w * 0.85, def.h * 0.85, 4, 3);
    const gridMat = new THREE.MeshBasicMaterial({
      color: def.color, wireframe: true, transparent: true, opacity: 0.25, depthWrite: false
    });
    const grid = new THREE.Mesh(gridGeo, gridMat);
    grid.position.copy(mesh.position);
    // Offset grid slightly in front of the screen face
    const fwd = new THREE.Vector3(0, 0, 0.002);
    fwd.applyEuler(mesh.rotation);
    grid.position.add(fwd);
    grid.rotation.copy(mesh.rotation);
    grid.renderOrder = 12;
    boatGroup.add(grid);
    screenMeshes.push(grid);
  });
}

// ===== WIREFRAME CLONES (disabled — boat stays solid) =====
function buildWireframeClones() {
  // No longer creating wireframe clones of the boat hull.
  // The boat remains solid throughout the entire animation.
}

// ===== FISH (Low Poly Bass — Loaded as Pre-computed Wireframe OBJ) =====
function buildFish() {
  // --- BASS SETTINGS START ---
  const DEG2RAD = Math.PI / 180;
  bassModels = [];

  // Define 4 initial bases.
  const bassDefs = [
    { pos: [5.50, -1.40, -2.60], rot: [0, 59 * DEG2RAD, 0], scale: 0.35, color: 0xff3300 },
    { pos: [3.50, -1.80, -3.00], rot: [0, 30 * DEG2RAD, 0], scale: 0.30, color: 0xff3300 },
    { pos: [7.50, -1.10, -1.50], rot: [0, 80 * DEG2RAD, 0], scale: 0.35, color: 0xff3300 },
    { pos: [9.50, -2.10, 1.60], rot: [0, 45 * DEG2RAD, 0], scale: 0.25, color: 0xff3300 },
  ];

  bassDefs.forEach(def => {
    const group = new THREE.Group();
    group.position.set(...def.pos);
    group.rotation.set(def.rot[0], def.rot[1], def.rot[2], 'YXZ');
    group.scale.set(def.scale, def.scale, def.scale);
    group.visible = false; // hidden until fish reveal phase
    // Store original color inside the group for easy access in editor
    group.userData.color = def.color;
    scene.add(group);
    bassModels.push(group);
  });
  // --- BASS SETTINGS END ---

  // Load the pre-computed bass wireframe OBJ (replaces runtime STL decimation)
  const loader = new THREE.OBJLoader();
  loader.load('3d assets/bass_wireframe.obj', function (object) {
    // OBJLoader returns a Group containing line segments
    object.traverse(function (child) {
      if (child.isLineSegments || child.isLine) {
        // Apply to each bass model group with its own color
        bassModels.forEach((group, index) => {
          const clonedLines = child.clone();
          clonedLines.material = new THREE.LineBasicMaterial({
            color: group.userData.color,
            transparent: true,
            opacity: 0
          });
          clonedLines.name = 'bass_wireframe_' + index;
          group.add(clonedLines);
        });
      }
    });

    console.log('Bass wireframe OBJ loaded');
  },
    function (xhr) {
      console.log('Bass Wireframe OBJ: ' + (xhr.loaded / xhr.total * 100).toFixed(0) + '% loaded');
    },
    function (error) {
      console.error('Error loading Bass Wireframe OBJ:', error);
    });
}

// ===== TREE (Loaded as Pre-computed Wireframe OBJ) =====
function buildTree() {
  treeModelGroup = new THREE.Group();
  scene.add(treeModelGroup);

  const loader = new THREE.OBJLoader();
  loader.load('3d assets/tree_wireframe.obj', function (object) {
    // OBJLoader returns a Group containing meshes or line segments
    object.traverse(function (child) {
      if (child.isLineSegments || child.isLine) {
        child.material = new THREE.LineBasicMaterial({
          color: 0x04ff00,
          transparent: true,
          opacity: 0
        });
      }
    });

    // Scale to fit visually
    object.scale.set(1, 1, 1);

    treeModelGroup.add(object);
    treeModelGroup.visible = false; // hidden until phase 4

    // --- TREE SETTINGS START ---
    const DEG2RAD = Math.PI / 180;
    treeModelGroup.position.set(8.50, -2.50, 0.90);
    treeModelGroup.rotation.set(0 * DEG2RAD, 0 * DEG2RAD, 0 * DEG2RAD, 'YXZ');
    treeModelGroup.scale.set(0.30, 0.30, 0.30);
    treeModelGroup.traverse(c => { if (c.material && c.material.color) c.material.color.setHex(0x04ff00); });
    // --- TREE SETTINGS END ---

    console.log('Tree wireframe loaded');
  },
    function (xhr) {
      console.log('Tree Wireframe OBJ: ' + (xhr.loaded / xhr.total * 100).toFixed(0) + '% loaded');
    },
    function (error) {
      console.error('Error loading Tree Wireframe OBJ:', error);
    });
}

// ===== UNDERWATER TERRAIN TOPOLOGY =====
let terrainMesh, terrainEdges, terrainContours;
let terrainAnchor; // follows boat yaw only (no wave bob, no pitch/roll)

function buildWater() {
  // Water size is now slightly larger than the terrain (42x24)
  const waterSizeX = 46, waterSizeZ = 28;
  const sizeX = 42, sizeZ = 30;

  // ---- LAYER 1: Opaque animated water surface (visible at start) ----
  const waterSegW = 150, waterSegH = 150;
  waterGeo = new THREE.PlaneGeometry(waterSizeX, waterSizeZ, waterSegW, waterSegH);
  waterGeo.rotateX(-Math.PI / 2);

  // Store original Y positions for ripple animation
  const wPos = waterGeo.attributes.position;
  waterGeo.userData.baseY = new Float32Array(wPos.count);
  for (let i = 0; i < wPos.count; i++) {
    waterGeo.userData.baseY[i] = wPos.getY(i);
  }

  // --- WATER SETTINGS START ---
  const waterMat = new THREE.MeshPhongMaterial({
    color: 0x22374f,
    specular: 0x79a0fb,
    shininess: 90,
    transparent: true,
    opacity: 1.00,
    side: THREE.DoubleSide,
    flatShading: false
  });
  // --- WATER SETTINGS END ---
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

  // Anchor follows boat yaw + Y wave offset (per-frame in updateScene) so terrain
  // appears locked from the camera, which also rides the boat's Y bob
  terrainAnchor = new THREE.Group();
  terrainAnchor.position.y = 0; // initial value; overwritten each frame
  scene.add(terrainAnchor);

  const terrainMat = new THREE.MeshBasicMaterial({
    color: 0x0C9AA1, wireframe: true, transparent: true, opacity: 0
  });
  terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.position.y = -2.4;
  terrainMesh.name = 'terrain';
  terrainAnchor.add(terrainMesh);

  // Invisible solid mesh that only writes to depth buffer to occlude objects behind the terrain
  const occluderMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true });
  const terrainOccluder = new THREE.Mesh(terrainGeo, occluderMat);
  terrainOccluder.position.copy(terrainMesh.position);
  terrainOccluder.name = 'terrain_occluder';
  terrainOccluder.renderOrder = -1; // render before other objects to populate depth buffer
  terrainAnchor.add(terrainOccluder);

  const edgeGeo = new THREE.EdgesGeometry(terrainGeo, 12);
  const edgeMat = new THREE.LineBasicMaterial({
    color: 0x7DFDFE, transparent: true, opacity: 0
  });
  terrainEdges = new THREE.LineSegments(edgeGeo, edgeMat);
  terrainEdges.position.copy(terrainMesh.position);
  terrainEdges.name = 'terrain_edges';
  terrainAnchor.add(terrainEdges);

  // Terrain contours removed — permanently disabled, generated ~2000 points for no visual effect
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

// ===== IMAGE COMPARISON SLIDER =====
function setupImageSlider() {
  const slider = document.getElementById('slider-range');
  const beforeContainer = document.getElementById('slider-before-container');
  const handle = document.getElementById('slider-handle');

  if (!slider || !beforeContainer || !handle) return;

  slider.addEventListener('input', (e) => {
    const value = e.target.value;
    beforeContainer.style.clipPath = `polygon(0 0, ${value}% 0, ${value}% 100%, 0 100%)`;
    handle.style.left = `${value}%`;
  });
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

  // Phase 1: Screens flicker and fade (0-20%)
  tl.to(animState, { screenOpacity: 0.3, duration: 0.04 })
    .to(animState, { screenOpacity: 0.8, duration: 0.015 })
    .to(animState, { screenOpacity: 0.1, duration: 0.025 })
    .to(animState, { screenOpacity: 0.6, duration: 0.015 })
    .to(animState, { screenOpacity: 0, duration: 0.065 });

  // Show problem text
  tl.to('#t-text-1', { opacity: 1, duration: 0.06 }, 0.04)
    .to('#t-text-1', { opacity: 0, duration: 0.04 }, 0.16);

  // Phase 2: Terrain wiremesh topology revealed (20-60%) — extended dwell time
  tl.to(animState, { terrainReveal: 1, duration: 0.20 }, 0.20)
    .to(animState, { cameraX: 1.7, cameraZ: 0, duration: 0.15 }, 0.20)
    .to(animState, { cameraY: 2.4, duration: 0.15 }, 0.25)
    .to(animState, { lookAtX: 8.77, lookAtY: -4.67, lookAtZ: 0, duration: 0.15 }, 0.20)
    .to(animState, { fov: window.innerWidth < 768 ? 120 : 70, duration: 0.15, ease: 'power2.inOut' }, 0.20);

  // Show solution text
  tl.to('#t-text-2', { opacity: 1, duration: 0.06 }, 0.25)
    .to('#t-text-2', { opacity: 0, duration: 0.04 }, 0.42);

  // Slow the boat spin and begin smooth alignment to cinematic angle
  tl.to(animState, { boatRotSpeed: 0, duration: 0.10, ease: 'power2.out' }, 0.28);
  // Smoothly steer the boat toward BOAT_TARGET_YAW (shortest arc, handled in updateScene)
  tl.to(animState, { boatAlignToTarget: 1, duration: 0.18, ease: 'power3.inOut' }, 0.30);

  // Lock camera to boat — starts earlier so it finishes before fish/tree appear
  tl.to(animState, { cameraLockedToBoat: 1, duration: 0.15, ease: 'power2.inOut' }, 0.36);

  // Phase 3: Fish reveal — delayed until camera is fully settled on boat
  tl.to(animState, { fishVisibility: 1, duration: 0.12 }, 0.60)
    .to(animState, { scanLinePos: 3, duration: 0.12 }, 0.65);

  // Show fish text ("See things differently") and fade water
  tl.to('#t-text-3', { opacity: 1, duration: 0.06 }, 0.63)
    .to(animState, { waterOpacity: 0, duration: 0.06 }, 0.63)
    .to('#t-text-3', { opacity: 0, duration: 0.06 }, 0.80);

  // Phase 4: Tree reveal (same timing as fish)
  tl.to(animState, { treeVisibility: 1, duration: 0.12 }, 0.60);

  // Phase 5: Tree and fish fade out together, then terrain, then canvas
  tl.to(animState, { treeVisibility: 0, duration: 0.08, ease: 'power2.in' }, 0.80);
  tl.to(animState, { fishVisibility: 0, duration: 0.08, ease: 'power2.in' }, 0.80);
  // Terrain fades out (88-95%)
  tl.to(animState, { terrainReveal: 0, duration: 0.07, ease: 'power2.in' }, 0.88);
  // Canvas fades to transparent last (92-100%) — no black, scene dissolves away
  tl.to(animState, { canvasOpacity: 0, duration: 0.08, ease: 'power1.in' }, 0.92);

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

  // Auto-close mobile nav when a link is clicked
  if (links) {
    links.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        if (window.innerWidth <= 900) {
          links.style.display = 'none';
        }
      });
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
    // Boat rides the waves — freeze ALL motion when camera or boat editor is active
    if (boatGroup && !window.cameraEditorActive && !window.boatEditorActive) {
      // Sample wave at boat origin and nearby points for slope
      const bx = 0, bz = 0; // boat center in local coords
      const sampleDist = 1.5; // distance to sample for tilt

      // Fade wave motion out as terrain reveals — camera is locked to boat, so any
      // Y-bob or pitch/roll makes the fixed-world terrain appear to heave.
      const waveBlend = Math.max(0, 1 - animState.terrainReveal);

      const hCenter = getWaveHeight(bx, bz, t) * waveBlend;
      const hFront = getWaveHeight(bx + sampleDist, bz, t) * waveBlend;
      const hBack = getWaveHeight(bx - sampleDist, bz, t) * waveBlend;
      const hLeft = getWaveHeight(bx, bz - sampleDist, t) * waveBlend;
      const hRight = getWaveHeight(bx, bz + sampleDist, t) * waveBlend;

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

      // Shortest-path alignment toward cinematic target yaw
      // Uses GSAP-driven value directly — no per-frame lerp to avoid drift
      const align = animState.boatAlignToTarget;

      if (align > 0.001) {
        // Normalize current yaw into [-PI, PI] range
        let current = animState.boatRotY % (Math.PI * 2);
        if (current > Math.PI) current -= Math.PI * 2;
        if (current < -Math.PI) current += Math.PI * 2;

        // Find shortest delta to target
        let delta = BOAT_TARGET_YAW - current;
        if (delta > Math.PI) delta -= Math.PI * 2;
        if (delta < -Math.PI) delta += Math.PI * 2;

        // Steer toward target — blend strength follows GSAP alignment factor
        animState.boatRotY += delta * align * 0.06;
      }

      boatGroup.rotation.y = animState.boatRotY + Math.sin(t * 0.3) * 0.015 * animState.boatRotSpeed;
      boatGroup.rotation.x += (pitch - boatGroup.rotation.x) * 0.06;
      boatGroup.rotation.z += (roll - boatGroup.rotation.z) * 0.06;
    }

    // Bass model is independent in the scene — stays fixed, doesn't bob
    // (position set once during load, no per-frame updates needed)

    // Sync terrain anchor yaw to boat yaw only
    if (terrainAnchor && boatGroup) {
      terrainAnchor.rotation.y = boatGroup.rotation.y;
    }

    // Camera (skip when camera editor has live control)
    if (!window.cameraEditorActive) {
      const lockCam = animState.cameraLockedToBoat;

      // Persistent lookAt vector (avoids allocating every frame)
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

        // Minimal smoothing for boat-locked mode (dampens wave bob jitter only)
        const camLerp = 0.5;
        camera.position.x += (targetX - camera.position.x) * camLerp;
        camera.position.y += (targetY - camera.position.y) * camLerp;
        camera.position.z += (targetZ - camera.position.z) * camLerp;

        // LookAt blend for boat-locked mode
        const freeLX = animState.lookAtX, freeLY = animState.lookAtY, freeLZ = animState.lookAtZ;
        const rawLookX = freeLX * (1 - lockCam) + worldLookAt.x * lockCam;
        const rawLookY = freeLY * (1 - lockCam) + worldLookAt.y * lockCam;
        const rawLookZ = freeLZ * (1 - lockCam) + worldLookAt.z * lockCam;

        updateScene._smoothLookAt.x += (rawLookX - updateScene._smoothLookAt.x) * 0.5;
        updateScene._smoothLookAt.y += (rawLookY - updateScene._smoothLookAt.y) * 0.5;
        updateScene._smoothLookAt.z += (rawLookZ - updateScene._smoothLookAt.z) * 0.5;
        camera.lookAt(updateScene._smoothLookAt);
      } else {
        // Free camera: set directly from animState — GSAP scrub already smooths these
        camera.position.set(animState.cameraX, animState.cameraY, animState.cameraZ);

        updateScene._smoothLookAt.set(animState.lookAtX, animState.lookAtY, animState.lookAtZ);
        camera.lookAt(updateScene._smoothLookAt);
      }
    }
  }

  // Screen opacity (skip in editor — screens always full visible)
  if (!editorMode) {
    screenMeshes.forEach(m => {
      m.material.opacity = animState.screenOpacity * (m.material.wireframe ? 0.25 : 0.7);
      m.visible = animState.screenOpacity > 0.01;
    });
    screenEdges.forEach(e => {
      e.material.opacity = animState.screenOpacity * 0.9;
      e.visible = animState.screenOpacity > 0.01;
    });
  }

  // ---- Wind-driven lake water ripples (freeze when camera editor active) ----
  if (waterGeo && waterPlane && !window.cameraEditorActive) {
    // Update visibility first — skip expensive vertex work when water is hidden
    if (!window.waterEditorActive) {
      waterPlane.material.opacity = animState.waterOpacity * 0.95;
    }
    waterPlane.visible = animState.waterOpacity > 0.01 || window.waterEditorActive;

    // Only animate vertices when water is actually visible
    if (waterPlane.visible) {
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
    }
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
  if (bassModels.length > 0) {
    const bassPulse = Math.sin(t * 2.0) * 0.05 + 0.85;
    bassModels.forEach(group => {
      group.visible = fv > 0.01;
      group.children.forEach(child => {
        if (child.material) {
          child.material.opacity = bassPulse * fv * 0.85;
        }
      });
    });
  }

  // Tree wireframe — revealed during Phase 4
  const tv = animState.treeVisibility;
  if (treeModelGroup) {
    treeModelGroup.visible = tv > 0.01;
    const treePulse = Math.sin(t * 1.8) * 0.05 + 0.85;
    treeModelGroup.traverse(child => {
      if (child.material) {
        child.material.opacity = treePulse * tv * 0.85;
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
  camera.fov = window.innerWidth < 768 ? 75 : 45;
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
let maskOverrideMat, maskOverrideLineMat, maskOverridePointMat, maskInvisibleMat;

function setupDotGridMask() {
  // Create a low-res render target for the mask
  const pr = Math.min(window.devicePixelRatio, 2);
  maskRenderTarget = new THREE.WebGLRenderTarget(
    Math.floor(window.innerWidth * pr * 0.5),
    Math.floor(window.innerHeight * pr * 0.5)
  );

  // Pre-create override materials for the mask pass (reused every frame)
  maskOverrideMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  maskOverrideLineMat = new THREE.LineBasicMaterial({ color: 0xffffff });
  maskOverridePointMat = new THREE.PointsMaterial({ color: 0xffffff, size: 3 });
  maskInvisibleMat = new THREE.MeshBasicMaterial({ visible: false });

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

  scene.traverse(function (obj) {
    if (!obj.visible) return;
    if (obj === scene) return;

    // Skip elements that should NOT mask the dot grid:
    // - ambient particles (decorative floating points)
    // - bass wireframe model (thin lines cause unstable masking)
    // - tree wireframe model
    // - terrain occluder (invisible depth mask)
    if (obj.name === 'ambient_particles') return;
    if (obj.name === 'terrain_occluder') return;
    if (bassModels.includes(obj)) return;
    if (obj === treeModelGroup) return;
    // Skip anything parented under bassModels or treeModelGroup
    let skipParent = obj.parent;
    while (skipParent) {
      if (bassModels.includes(skipParent) || skipParent === treeModelGroup) return;
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
        // Reuse pre-created invisible material (no per-frame allocation)
        obj.material = maskInvisibleMat;
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
