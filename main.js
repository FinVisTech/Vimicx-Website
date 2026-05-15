/* ============================================
   VIMICX — Main JavaScript
   Three.js 3D Scene + GSAP Scroll Animations
   ============================================ */

// ===== GLOBALS =====
let renderer, scene, camera, orbitControls;
let boatGroup, screenMeshes = [], screenEdges = [];
let wireframeClones = [];
let fishGroup, fishBody, fishGlow, scanLine;
let waterPlane;
let editorMode = false;
let animState = {
  screenOpacity: 1,
  wireframeProgress: 0,
  fishVisibility: 0,
  scanLinePos: -2,
  boatRotY: 0,
  cameraY: 3,
  cameraZ: 8,
  canvasOpacity: 1
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

// ===== WIREFRAME CLONES =====
function buildWireframeClones() {
  boatGroup.children.forEach(child => {
    if (child.isMesh && !screenMeshes.includes(child)) {
      const clone = child.clone();
      clone.material = new THREE.MeshBasicMaterial({
        color: 0x00f0ff, wireframe: true, transparent: true, opacity: 0
      });
      clone.name = 'wire_' + child.name;
      boatGroup.add(clone);
      wireframeClones.push(clone);

      // Edge highlight
      if (child.geometry) {
        const edgeGeo = new THREE.EdgesGeometry(child.geometry, 15);
        const edgeMat = new THREE.LineBasicMaterial({
          color: 0x00f0ff, transparent: true, opacity: 0
        });
        const edgeLines = new THREE.LineSegments(edgeGeo, edgeMat);
        edgeLines.position.copy(child.position);
        edgeLines.rotation.copy(child.rotation);
        edgeLines.scale.copy(child.scale);
        boatGroup.add(edgeLines);
        wireframeClones.push(edgeLines);
      }
    }
  });
}

// ===== FISH =====
function buildFish() {
  fishGroup = new THREE.Group();

  // Body using LatheGeometry
  const pts = [];
  const profile = [
    [0, 0], [0.08, 0.12], [0.2, 0.22], [0.35, 0.3], [0.55, 0.32],
    [0.8, 0.28], [1.0, 0.2], [1.15, 0.14], [1.3, 0.09], [1.4, 0.06],
    [1.45, 0.12], [1.55, 0.04], [1.6, 0]
  ];
  profile.forEach(p => pts.push(new THREE.Vector2(p[1] * 1.8, p[0] * 2.5)));

  const bodyGeo = new THREE.LatheGeometry(pts, 16);
  const bodyMat = new THREE.MeshBasicMaterial({
    color: 0xff00aa, wireframe: true, transparent: true, opacity: 0
  });
  fishBody = new THREE.Mesh(bodyGeo, bodyMat);
  fishBody.rotation.z = Math.PI / 2;
  fishBody.position.set(0, 0, 0);
  fishGroup.add(fishBody);

  // Glow body clone
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0xff00aa, transparent: true, opacity: 0, side: THREE.DoubleSide
  });
  fishGlow = new THREE.Mesh(bodyGeo.clone(), glowMat);
  fishGlow.rotation.copy(fishBody.rotation);
  fishGlow.scale.set(1.05, 1.05, 1.05);
  fishGroup.add(fishGlow);

  // Dorsal fin
  const finShape = new THREE.Shape();
  finShape.moveTo(0, 0);
  finShape.quadraticCurveTo(0.3, 0.6, 0.8, 0.3);
  finShape.lineTo(1.2, 0);
  const finGeo = new THREE.ShapeGeometry(finShape);
  const finMat = new THREE.MeshBasicMaterial({
    color: 0xff00aa, wireframe: true, transparent: true, opacity: 0, side: THREE.DoubleSide
  });
  const fin = new THREE.Mesh(finGeo, finMat);
  fin.position.set(-0.8, 0.55, 0);
  fin.rotation.y = Math.PI / 2;
  fishGroup.add(fin);

  // Tail fin
  const tailShape = new THREE.Shape();
  tailShape.moveTo(0, 0);
  tailShape.quadraticCurveTo(0.4, 0.5, 0.6, 0.4);
  tailShape.lineTo(0.2, 0);
  tailShape.lineTo(0.6, -0.4);
  tailShape.quadraticCurveTo(0.4, -0.5, 0, 0);
  const tailGeo = new THREE.ShapeGeometry(tailShape);
  const tailMat = finMat.clone();
  const tail = new THREE.Mesh(tailGeo, tailMat);
  tail.position.set(1.9, 0, 0);
  tail.rotation.y = Math.PI / 2;
  fishGroup.add(tail);

  // Scan line
  const scanGeo = new THREE.PlaneGeometry(0.05, 1.5);
  const scanMat = new THREE.MeshBasicMaterial({
    color: 0xff00aa, transparent: true, opacity: 0, side: THREE.DoubleSide
  });
  scanLine = new THREE.Mesh(scanGeo, scanMat);
  scanLine.rotation.y = Math.PI / 2;
  fishGroup.add(scanLine);

  fishGroup.position.set(0, -2.2, 0);
  fishGroup.scale.set(0.8, 0.8, 0.8);
  scene.add(fishGroup);
}

// ===== UNDERWATER TERRAIN TOPOLOGY =====
let terrainMesh, terrainEdges, terrainContours;

function buildWater() {
  // Procedural lake-bottom terrain — wireframe topology below the boat
  // Uses layered noise for ridges, channels, and drop-offs

  const segW = 80, segH = 80;
  const sizeX = 12, sizeZ = 8;   // wider along boat length, narrower across beam
  const terrainGeo = new THREE.PlaneGeometry(sizeX, sizeZ, segW, segH);
  terrainGeo.rotateX(-Math.PI / 2); // lay flat

  const pos = terrainGeo.attributes.position;

  // Layered noise function for terrain height
  function terrainHeight(x, z) {
    // Large-scale rolling hills / ridges
    let h = Math.sin(x * 0.4) * Math.cos(z * 0.5) * 0.8;
    // Channel running along the boat's path
    h += Math.exp(-z * z * 0.8) * -0.5;
    // Medium features — rocky ridges
    h += Math.sin(x * 1.2 + z * 0.8) * 0.3;
    h += Math.cos(x * 0.7 - z * 1.5) * 0.25;
    // Fine detail — bumps and texture
    h += Math.sin(x * 3.0 + 1.5) * Math.cos(z * 2.8 + 0.7) * 0.12;
    h += Math.sin(x * 4.5 - z * 3.2) * 0.06;
    // Drop-off on one side (deeper toward +Z)
    h += Math.min(0, (z - 2.0) * 0.3);
    // Slight mound under the boat
    const dist = Math.sqrt(x * x + z * z);
    h += Math.exp(-dist * dist * 0.06) * 0.4;
    return h;
  }

  // Apply terrain heights
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, terrainHeight(x, z));
  }
  pos.needsUpdate = true;
  terrainGeo.computeVertexNormals();

  // Main wireframe mesh
  const terrainMat = new THREE.MeshBasicMaterial({
    color: 0x00f0ff,
    wireframe: true,
    transparent: true,
    opacity: 0.12
  });
  terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.position.y = -1.8; // below the hull
  terrainMesh.name = 'terrain';
  boatGroup.add(terrainMesh);

  // Edge highlights for prominent ridges
  const edgeGeo = new THREE.EdgesGeometry(terrainGeo, 12);
  const edgeMat = new THREE.LineBasicMaterial({
    color: 0x00f0ff,
    transparent: true,
    opacity: 0.2
  });
  terrainEdges = new THREE.LineSegments(edgeGeo, edgeMat);
  terrainEdges.position.copy(terrainMesh.position);
  terrainEdges.name = 'terrain_edges';
  boatGroup.add(terrainEdges);

  // Depth contour rings — concentric lines at different depth levels
  terrainContours = new THREE.Group();
  terrainContours.position.copy(terrainMesh.position);
  terrainContours.name = 'terrain_contours';

  const contourLevels = [-0.8, -0.4, 0.0, 0.3, 0.6];
  const contourColors = [0x003344, 0x005566, 0x007788, 0x00aacc, 0x00f0ff];

  contourLevels.forEach((level, ci) => {
    const points = [];
    const step = 0.15;
    // Trace contour lines by scanning the terrain
    for (let x = -sizeX / 2; x < sizeX / 2; x += step) {
      for (let z = -sizeZ / 2; z < sizeZ / 2; z += step) {
        const h = terrainHeight(x, z);
        // Check if this cell crosses the contour level
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
        color: contourColors[ci],
        size: 0.04,
        transparent: true,
        opacity: 0.25
      });
      const contourPts = new THREE.Points(contourGeo, contourMat);
      terrainContours.add(contourPts);
    }
  });

  boatGroup.add(terrainContours);

  // Subtle sonar sweep glow plane (sits at water surface level)
  const waterSurfaceGeo = new THREE.PlaneGeometry(sizeX * 1.3, sizeZ * 1.3);
  const waterSurfaceMat = new THREE.MeshBasicMaterial({
    color: 0x041428,
    transparent: true,
    opacity: 0.3,
    side: THREE.DoubleSide
  });
  waterPlane = new THREE.Mesh(waterSurfaceGeo, waterSurfaceMat);
  waterPlane.rotation.x = -Math.PI / 2;
  waterPlane.position.y = -0.5;
  waterPlane.name = 'water_surface';
  boatGroup.add(waterPlane);
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

  // Phase 1: Screens flicker and fade (0-25%)
  tl.to(animState, { screenOpacity: 0.3, duration: 0.05 })
    .to(animState, { screenOpacity: 0.8, duration: 0.02 })
    .to(animState, { screenOpacity: 0.1, duration: 0.03 })
    .to(animState, { screenOpacity: 0.6, duration: 0.02 })
    .to(animState, { screenOpacity: 0, duration: 0.08 });

  // Show problem text
  tl.to('#t-text-1', { opacity: 1, duration: 0.08 }, 0.05)
    .to('#t-text-1', { opacity: 0, duration: 0.05 }, 0.2);

  // Phase 2: Wireframe transition (25-55%)
  tl.to(animState, { wireframeProgress: 1, duration: 0.25 }, 0.25)
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

// ===== UPDATE FUNCTIONS =====
function updateScene() {
  const t = clock.getElapsedTime();

  // In editor mode, skip auto-rotation and camera overrides
  if (!editorMode) {
    // Boat gentle float
    if (boatGroup) {
      boatGroup.rotation.y = animState.boatRotY + Math.sin(t * 0.5) * 0.02;
      boatGroup.position.y = 0.3 + Math.sin(t * 0.8) * 0.05;
      animState.boatRotY += 0.001;
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

  // Wireframe transition (skip terrain and water objects)
  const wp = animState.wireframeProgress;
  const skipNames = ['terrain', 'terrain_edges', 'terrain_contours', 'water_surface'];
  boatGroup.children.forEach(child => {
    if (child.isMesh && !screenMeshes.includes(child) && !child.name.startsWith('wire_') && !skipNames.includes(child.name)) {
      if (child.material && child.material.opacity !== undefined) {
        child.material.opacity = 1 - wp;
      }
    }
  });
  wireframeClones.forEach(clone => {
    clone.material.opacity = wp * 0.7;
  });

  // Fish
  const fv = animState.fishVisibility;
  if (fishGroup) {
    fishGroup.children.forEach(child => {
      if (child.material) child.material.opacity = fv * 0.8;
    });
    fishBody.material.opacity = fv * 0.6;

    // Scan line
    if (scanLine) {
      scanLine.position.x = animState.scanLinePos - 2;
      scanLine.material.opacity = fv * 0.9;
    }

    // Fish pulse
    const pulse = Math.sin(t * 3) * 0.05 + 1;
    fishGlow.scale.set(pulse, pulse, pulse);
    fishGlow.material.opacity = fv * 0.15;
  }

  // Terrain sonar sweep effect — flickers with screens
  if (terrainMesh && terrainMesh.material) {
    const so = editorMode ? 1 : (1 - animState.screenOpacity); // inverse of screens
    const pulse = Math.sin(t * 1.5) * 0.03 + 0.12;
    terrainMesh.material.opacity = pulse * so;

    if (terrainEdges) {
      terrainEdges.material.opacity = pulse * 1.6 * so;
    }
    if (terrainContours) {
      terrainContours.children.forEach((child, i) => {
        child.material.opacity = (0.15 + Math.sin(t * 2 + i * 0.8) * 0.1) * so;
      });
    }
    if (waterPlane) {
      waterPlane.material.opacity = 0.3 * so;
    }
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
