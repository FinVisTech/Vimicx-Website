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
let editorMode = false;
let animState = {
  screenOpacity: 1,
  terrainReveal: 0,
  fishVisibility: 0,
  scanLinePos: -2,
  boatRotY: 0,
  cameraY: 3,
  cameraZ: 8,
  canvasOpacity: 1,
  waterOpacity: 1
};
let clock;

// ===== INIT =====
function init() {
  clock = new THREE.Clock();

  // Renderer
  const canvas = document.getElementById('three-canvas');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);

  // Scene
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x060612, 0.04);

  // Camera
  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 3, 8);
  camera.lookAt(0, 0.5, 0);

  // Lights
  const ambient = new THREE.AmbientLight(0x223344, 0.6);
  scene.add(ambient);

  const dirLight = new THREE.DirectionalLight(0x88aacc, 0.8);
  dirLight.position.set(5, 8, 5);
  scene.add(dirLight);

  const pointCyan = new THREE.PointLight(0x00f0ff, 1.5, 20);
  pointCyan.position.set(-3, 4, 2);
  scene.add(pointCyan);

  const pointMagenta = new THREE.PointLight(0xff00aa, 0.8, 15);
  pointMagenta.position.set(3, 2, -2);
  scene.add(pointMagenta);

  // Build scene
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
      color: 0x1a1a2e,
      specular: 0x333366,
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
      color: 0x1a1a2e, specular: 0x333366, shininess: 60,
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
    { w: 0.55, h: 0.4,  pos: [2.11, 0.41, -0.05], rot: [-0.297, 1.571, 0.244], color: 0x00f0ff },
    // Screen 2: Right console screen (angled inward)
    { w: 0.35, h: 0.28, pos: [1.85, 0.33, 0.27],  rot: [-0.122, 1.222, 0],     color: 0x00ff88 },
    // Screen 3: Upper console screen
    { w: 0.35, h: 0.28, pos: [2.24, 0.65, -0.02], rot: [0, 1.606, 0],          color: 0x00f0ff },

    // --- SEAT SCREENS (1 in front of each seat) ---
    // Screen 4: Right seat screen
    { w: 0.3,  h: 0.22, pos: [-0.09, 0.53, 0.56],  rot: [-0.454, 1.553, 0.489], color: 0x8b5cf6 },
    // Screen 5: Left seat screen
    { w: 0.3,  h: 0.22, pos: [-0.09, 0.37, -0.50], rot: [0.035, 1.571, 0],      color: 0x00ff88 },
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
      color: 0xff4500,
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

function buildWater() {
  const sizeX = 14, sizeZ = 10;

  // ---- LAYER 1: Opaque animated water surface (visible at start) ----
  const waterSegW = 100, waterSegH = 100;
  waterGeo = new THREE.PlaneGeometry(sizeX, sizeZ, waterSegW, waterSegH);
  waterGeo.rotateX(-Math.PI / 2);

  // Store original Y positions for ripple animation
  const wPos = waterGeo.attributes.position;
  waterGeo.userData.baseY = new Float32Array(wPos.count);
  for (let i = 0; i < wPos.count; i++) {
    waterGeo.userData.baseY[i] = wPos.getY(i);
  }

  const waterMat = new THREE.MeshPhongMaterial({
    color: 0x041830,
    specular: 0x0088aa,
    shininess: 90,
    transparent: true,
    opacity: 0.95,
    side: THREE.DoubleSide,
    flatShading: false
  });
  waterPlane = new THREE.Mesh(waterGeo, waterMat);
  waterPlane.position.y = -0.35;
  waterPlane.name = 'water_surface';
  waterPlane.receiveShadow = true;
  boatGroup.add(waterPlane);

  // ---- LAYER 2: Terrain wiremesh topology (hidden initially, revealed on scroll) ----
  const segW = 80, segH = 80;
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

  const terrainMat = new THREE.MeshBasicMaterial({
    color: 0x00f0ff, wireframe: true, transparent: true, opacity: 0
  });
  terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.position.y = -1.8;
  terrainMesh.name = 'terrain';
  boatGroup.add(terrainMesh);

  const edgeGeo = new THREE.EdgesGeometry(terrainGeo, 12);
  const edgeMat = new THREE.LineBasicMaterial({
    color: 0x00f0ff, transparent: true, opacity: 0
  });
  terrainEdges = new THREE.LineSegments(edgeGeo, edgeMat);
  terrainEdges.position.copy(terrainMesh.position);
  terrainEdges.name = 'terrain_edges';
  boatGroup.add(terrainEdges);

  terrainContours = new THREE.Group();
  terrainContours.position.copy(terrainMesh.position);
  terrainContours.name = 'terrain_contours';

  const contourLevels = [-0.8, -0.4, 0.0, 0.3, 0.6];
  const contourColors = [0x003344, 0x005566, 0x007788, 0x00aacc, 0x00f0ff];

  contourLevels.forEach((level, ci) => {
    const points = [];
    const step = 0.15;
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

  boatGroup.add(terrainContours);
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
    color: 0x00f0ff, size: 0.04, transparent: true, opacity: 0.4
  });
  const particles = new THREE.Points(particleGeo, particleMat);
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
    ctx.strokeStyle = 'rgba(0,240,255,0.12)';
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
      end: '+=3500',
      scrub: 1,
      pin: true,
      anticipatePin: 1
    }
  });

  // Phase 1: Screens AND water flicker and fade together (0-25%)
  tl.to(animState, { screenOpacity: 0.3, waterOpacity: 0.4, duration: 0.05 })
    .to(animState, { screenOpacity: 0.8, waterOpacity: 0.9, duration: 0.02 })
    .to(animState, { screenOpacity: 0.1, waterOpacity: 0.15, duration: 0.03 })
    .to(animState, { screenOpacity: 0.6, waterOpacity: 0.7, duration: 0.02 })
    .to(animState, { screenOpacity: 0, waterOpacity: 0, duration: 0.08 });

  // Show problem text
  tl.to('#t-text-1', { opacity: 1, duration: 0.08 }, 0.05)
    .to('#t-text-1', { opacity: 0, duration: 0.05 }, 0.2);

  // Phase 2: Terrain wiremesh topology revealed (25-55%)
  tl.to(animState, { terrainReveal: 1, duration: 0.25 }, 0.25)
    .to(animState, { cameraZ: 10, duration: 0.2 }, 0.25)
    .to(animState, { cameraY: 4, duration: 0.2 }, 0.3);

  // Show solution text
  tl.to('#t-text-2', { opacity: 1, duration: 0.08 }, 0.3)
    .to('#t-text-2', { opacity: 0, duration: 0.05 }, 0.5);

  // Phase 3: Fish reveal (55-80%)
  tl.to(animState, { fishVisibility: 1, duration: 0.2 }, 0.55)
    .to(animState, { cameraY: 2, duration: 0.15 }, 0.6)
    .to(animState, { scanLinePos: 3, duration: 0.15 }, 0.65);

  // Show fish text
  tl.to('#t-text-3', { opacity: 1, duration: 0.08 }, 0.6)
    .to('#t-text-3', { opacity: 0, duration: 0.08 }, 0.85);

  // Phase 4: Fade out canvas (85-100%)
  tl.to(animState, { canvasOpacity: 0, duration: 0.15 }, 0.85);

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
    // Boat rides the waves — sample wave height at boat center and compute tilt
    if (boatGroup) {
      // Sample wave at boat origin and nearby points for slope
      const bx = 0, bz = 0; // boat center in local coords
      const sampleDist = 1.5; // distance to sample for tilt

      const hCenter = getWaveHeight(bx, bz, t);
      const hFront  = getWaveHeight(bx + sampleDist, bz, t);
      const hBack   = getWaveHeight(bx - sampleDist, bz, t);
      const hLeft   = getWaveHeight(bx, bz - sampleDist, t);
      const hRight  = getWaveHeight(bx, bz + sampleDist, t);

      // Pitch (nose up/down) from front-to-back slope
      const pitch = Math.atan2(hFront - hBack, sampleDist * 2) * 0.8;
      // Roll (side-to-side) from left-to-right slope
      const roll = Math.atan2(hRight - hLeft, sampleDist * 2) * 0.8;

      // Smooth the boat position/rotation for natural feel
      const waterSurfaceY = -0.35; // matches waterPlane.position.y
      const targetY = 0.3 + hCenter + waterSurfaceY * 0.3;
      boatGroup.position.y += (targetY - boatGroup.position.y) * 0.08;

      // Slow yaw rotation + wave-driven pitch and roll
      animState.boatRotY += 0.001;
      boatGroup.rotation.y = animState.boatRotY + Math.sin(t * 0.3) * 0.015;
      boatGroup.rotation.x += (pitch - boatGroup.rotation.x) * 0.06;
      boatGroup.rotation.z += (roll - boatGroup.rotation.z) * 0.06;
    }

    // Bass model locked to terrain — mirrors boatGroup rotation/position
    // so it stays fixed relative to the topographic mesh
    if (bassModelGroup && boatGroup) {
      bassModelGroup.rotation.copy(boatGroup.rotation);
      bassModelGroup.position.x = boatGroup.position.x;
      bassModelGroup.position.y = boatGroup.position.y - 1.5;
      bassModelGroup.position.z = boatGroup.position.z;
    }

    // Camera
    camera.position.y += (animState.cameraY - camera.position.y) * 0.05;
    camera.position.z += (animState.cameraZ - camera.position.z) * 0.05;
    camera.lookAt(0, 0.3, 0);
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

  // ---- Wind-driven lake water ripples ----
  if (waterGeo && waterPlane) {
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
  if (terrainMesh && terrainMesh.material) {
    const tr = animState.terrainReveal;
    const pulse = Math.sin(t * 1.5) * 0.03 + 0.12;
    terrainMesh.material.opacity = pulse * tr;

    if (terrainEdges) {
      terrainEdges.material.opacity = pulse * 1.6 * tr;
    }
    if (terrainContours) {
      terrainContours.children.forEach((child, i) => {
        child.material.opacity = (0.15 + Math.sin(t * 2 + i * 0.8) * 0.1) * tr;
      });
    }
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

  // Canvas opacity
  renderer.domElement.style.opacity = animState.canvasOpacity;
}

// ===== RENDER LOOP =====
function animate() {
  requestAnimationFrame(animate);
  if (orbitControls && editorMode) orbitControls.update();
  updateScene();
  renderer.render(scene, camera);
}

// ===== RESIZE =====
function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
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
