/**
 * generate_bass_wireframe.js
 * 
 * Converts LowPolyBass.stl into a pre-computed wireframe OBJ file.
 * Uses the same vertex-clustering decimation algorithm that was previously
 * running at runtime in main.js, but saves the result as an OBJ for
 * instant loading — eliminating the ~8MB STL download + CPU-intensive
 * decimation step from the client.
 *
 * Usage:  node dev/generate_bass_wireframe.js
 * Output: 3d assets/bass_wireframe.obj
 */

const fs = require('fs');
const path = require('path');

// ===== Parse binary STL =====
function parseSTL(buffer) {
  // Skip 80-byte header
  const dv = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const numTriangles = dv.getUint32(80, true);
  console.log(`STL: ${numTriangles} triangles`);

  const positions = new Float32Array(numTriangles * 9); // 3 verts × 3 coords
  let offset = 84;

  for (let i = 0; i < numTriangles; i++) {
    // Skip normal (12 bytes)
    offset += 12;
    // Read 3 vertices (each 12 bytes = 3 floats)
    for (let v = 0; v < 9; v++) {
      positions[i * 9 + v] = dv.getFloat32(offset, true);
      offset += 4;
    }
    // Skip attribute byte count (2 bytes)
    offset += 2;
  }

  return { positions, count: numTriangles * 3 };
}

// ===== Orientation fix: STL is Z-up → Three.js Y-up (rotateX -π/2) =====
function rotateXNeg90(positions) {
  for (let i = 0; i < positions.length; i += 3) {
    const y = positions[i + 1];
    const z = positions[i + 2];
    // rotateX(-π/2): y' = z, z' = -y
    positions[i + 1] = z;
    positions[i + 2] = -y;
  }
}

// ===== Center geometry =====
function centerGeometry(positions) {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (let i = 0; i < positions.length; i += 3) {
    minX = Math.min(minX, positions[i]);
    maxX = Math.max(maxX, positions[i]);
    minY = Math.min(minY, positions[i + 1]);
    maxY = Math.max(maxY, positions[i + 1]);
    minZ = Math.min(minZ, positions[i + 2]);
    maxZ = Math.max(maxZ, positions[i + 2]);
  }

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const cz = (minZ + maxZ) / 2;

  for (let i = 0; i < positions.length; i += 3) {
    positions[i] -= cx;
    positions[i + 1] -= cy;
    positions[i + 2] -= cz;
  }

  return {
    size: [maxX - minX, maxY - minY, maxZ - minZ],
    center: [cx, cy, cz]
  };
}

// ===== Scale geometry =====
function scaleGeometry(positions, factor) {
  for (let i = 0; i < positions.length; i++) {
    positions[i] *= factor;
  }
}

// ===== Vertex-clustering decimation (matches runtime algorithm) =====
function decimateToWireframe(positions, vertexCount, gridSize) {
  const vertexMap = new Map();
  const newPositions = [];
  let newVertexCount = 0;
  const vertexRemap = new Int32Array(vertexCount);

  for (let i = 0; i < vertexCount; i++) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];
    const gx = Math.round(x / gridSize);
    const gy = Math.round(y / gridSize);
    const gz = Math.round(z / gridSize);
    const key = `${gx},${gy},${gz}`;

    if (!vertexMap.has(key)) {
      vertexMap.set(key, newVertexCount);
      newPositions.push(gx * gridSize, gy * gridSize, gz * gridSize);
      newVertexCount++;
    }
    vertexRemap[i] = vertexMap.get(key);
  }

  // Rebuild faces — skip degenerate triangles
  const faceCount = vertexCount / 3;
  const edgeSet = new Set();
  const edges = []; // pairs of vertex indices

  for (let f = 0; f < faceCount; f++) {
    const a = vertexRemap[f * 3];
    const b = vertexRemap[f * 3 + 1];
    const c = vertexRemap[f * 3 + 2];
    if (a === b || b === c || a === c) continue;

    const triEdges = [[a, b], [b, c], [c, a]];
    triEdges.forEach(([v0, v1]) => {
      const eKey = `${Math.min(v0, v1)}:${Math.max(v0, v1)}`;
      if (!edgeSet.has(eKey)) {
        edgeSet.add(eKey);
        edges.push([v0, v1]);
      }
    });
  }

  console.log(`Decimation: ${newVertexCount} vertices, ${edges.length} edges`);

  return { vertices: newPositions, edges, vertexCount: newVertexCount };
}

// ===== Write OBJ (line segments) =====
function writeOBJ(outputPath, vertices, edges) {
  let obj = '# Bass wireframe — pre-computed from LowPolyBass.stl\n';
  obj += `# ${vertices.length / 3} vertices, ${edges.length} edges\n`;
  obj += 'o bass_wireframe\n';

  // Write vertices
  for (let i = 0; i < vertices.length; i += 3) {
    obj += `v ${vertices[i].toFixed(6)} ${vertices[i + 1].toFixed(6)} ${vertices[i + 2].toFixed(6)}\n`;
  }

  // Write edges as line elements (OBJ indices are 1-based)
  for (const [a, b] of edges) {
    obj += `l ${a + 1} ${b + 1}\n`;
  }

  fs.writeFileSync(outputPath, obj);
  const sizeKB = (Buffer.byteLength(obj) / 1024).toFixed(1);
  console.log(`Written: ${outputPath} (${sizeKB} KB)`);
}

// ===== MAIN =====
const stlPath = path.join(__dirname, '..', '3d assets', 'LowPolyBass.stl');
const objPath = path.join(__dirname, '..', '3d assets', 'bass_wireframe.obj');

console.log('Reading STL:', stlPath);
const stlBuffer = fs.readFileSync(stlPath);
const { positions, count } = parseSTL(stlBuffer);

// Apply same transforms as main.js buildFish()
rotateXNeg90(positions);
const { size } = centerGeometry(positions);

// Scale to fit ~3.5 units (matching runtime)
const maxDim = Math.max(...size);
const targetSize = 3.5;
const scaleFactor = targetSize / maxDim;
scaleGeometry(positions, scaleFactor);

console.log(`Scaled size: ${(size[0] * scaleFactor).toFixed(2)} × ${(size[1] * scaleFactor).toFixed(2)} × ${(size[2] * scaleFactor).toFixed(2)}`);

// Decimation grid size matches the runtime value exactly
const gridSize = 0.14;
const { vertices, edges } = decimateToWireframe(positions, count, gridSize);

writeOBJ(objPath, vertices, edges);
console.log('Done! Bass wireframe OBJ generated successfully.');
