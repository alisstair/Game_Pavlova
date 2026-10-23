import * as THREE from 'three';

// Декорации уровней: дорога или крыши, дома вокруг. На физику не влияют —
// по чему можно бегать, решают gaps и solids уровня.
export const ROAD_HALF_WIDTH = 3.75; // три полосы по 2.5 м
const SIDEWALK_WIDTH = 2;
const ROOF_DROP = 20; // насколько улица ниже крыш

const lambert = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });

// Куски «твёрдой» поверхности между ямами: [[начало, конец], ...] в метрах от старта
function solidPieces(gaps, length) {
  const sorted = [...gaps].sort((a, b) => a.from - b.from);
  const pieces = [];
  let from = -20;
  for (const gap of sorted) {
    pieces.push([from, gap.from]);
    from = gap.to;
  }
  pieces.push([from, length - 20]);
  return pieces;
}

// --- Улица ---

export function buildStreet(group, gaps, levelLength) {
  const length = levelLength + 80;
  const centerZ = -length / 2 + 20;

  const grass = new THREE.Mesh(new THREE.PlaneGeometry(200, length + 100), lambert(0xa8d58a));
  grass.rotation.x = -Math.PI / 2;
  grass.position.set(0, -0.02, centerZ);
  group.add(grass);

  // Дорога кусками, между кусками — ямы уровня
  const roadMaterial = lambert(0x8c8f9e);
  for (const [start, end] of solidPieces(gaps, length)) {
    const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF_WIDTH * 2, end - start), roadMaterial);
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0, -(start + end) / 2);
    road.receiveShadow = true;
    group.add(road);
  }

  // Пунктир между полосами
  const dashCount = Math.floor(length / 5);
  const dashes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.02, 2), lambert(0xf7f3e8), dashCount * 2);
  const m = new THREE.Matrix4();
  let n = 0;
  for (let i = 0; i < dashCount; i++) {
    const z = 20 - i * 5;
    if (gaps.some((gap) => -z + 1 > gap.from && -z - 1 < gap.to)) continue;
    m.setPosition(-ROAD_HALF_WIDTH / 3, 0.01, z);
    dashes.setMatrixAt(n++, m);
    m.setPosition(ROAD_HALF_WIDTH / 3, 0.01, z);
    dashes.setMatrixAt(n++, m);
  }
  dashes.count = n;
  dashes.receiveShadow = true;
  group.add(dashes);

  const sidewalkMaterial = lambert(0xe6d8c3);
  for (const side of [-1, 1]) {
    const sidewalk = new THREE.Mesh(new THREE.BoxGeometry(SIDEWALK_WIDTH, 0.15, length), sidewalkMaterial);
    sidewalk.position.set(side * (ROAD_HALF_WIDTH + SIDEWALK_WIDTH / 2), 0.075, centerZ);
    sidewalk.receiveShadow = true;
    group.add(sidewalk);
  }

  buildStreetHouses(group, length);
}

// Дома и деревья по обе стороны; генератор с зерном, чтобы улица всегда одинаковая
function buildStreetHouses(group, length) {
  const random = seededRandom(7);
  const colors = [0xf7c59f, 0xf4a6a6, 0xa9d6e5, 0xcdb4db, 0xfff1a8, 0xb8e0d2];
  const materials = colors.map((color) => lambert(color));
  const roofMaterial = lambert(0x8a6f63);
  const windowMaterial = lambert(0x6f8fb0);
  const trunkMaterial = lambert(0x9b6b43);
  const leavesMaterial = lambert(0x6fbf73);
  const buildingStart = ROAD_HALF_WIDTH + SIDEWALK_WIDTH + 0.5;

  for (const side of [-1, 1]) {
    let z = 20;
    while (z > -length + 20) {
      const depth = 5 + random() * 4;
      const width = 4 + random() * 3;
      const height = 4 + random() * 8;
      const house = new THREE.Group();

      const body = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, depth - 0.6),
        materials[Math.floor(random() * materials.length)],
      );
      body.position.y = height / 2;
      house.add(body);

      const roof = new THREE.Mesh(new THREE.BoxGeometry(width + 0.3, 0.4, depth - 0.3), roofMaterial);
      roof.position.y = height + 0.2;
      house.add(roof);

      // Окна со стороны дороги
      const floors = Math.floor((height - 1) / 2.2);
      for (let f = 0; f < floors; f++) {
        for (const dz of [-1.2, 1.2]) {
          const win = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1, 0.9), windowMaterial);
          win.position.set((-side * width) / 2, 1.8 + f * 2.2, dz);
          house.add(win);
        }
      }

      house.position.set(side * (buildingStart + width / 2), 0, z - depth / 2);
      group.add(house);

      if (random() < 0.45) {
        const tree = new THREE.Group();
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 1.2, 6), trunkMaterial);
        trunk.position.y = 0.6;
        const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8, 0), leavesMaterial);
        leaves.position.y = 1.7;
        leaves.castShadow = true;
        tree.add(trunk, leaves);
        tree.position.set(side * (ROAD_HALF_WIDTH + SIDEWALK_WIDTH / 2 + 0.3), 0.15, z - depth / 2);
        group.add(tree);
      }

      z -= depth;
    }
  }
}

// --- Крыши ---

// Кот бежит по крышам домов, стоящих в ряд; между домами — провалы до улицы.
export function buildRoofs(group, gaps, levelLength) {
  const length = levelLength + 80;
  const random = seededRandom(11);
  const wallColors = [0xe8a888, 0xdcc4ac, 0xbcc6da, 0xefc28e, 0xd1ad9b].map((c) => lambert(c));
  const roofMaterial = lambert(0x7a707c);
  const edgeMaterial = lambert(0x4f4850);
  const windowMaterial = lambert(0xffd98a, { emissive: 0x6b4a10 });

  // Дома под ногами у кота
  solidPieces(gaps, length).forEach(([start, end], i) => {
    const len = end - start;
    const z = -(start + end) / 2;
    const house = new THREE.Group();

    const walls = new THREE.Mesh(new THREE.BoxGeometry(ROAD_HALF_WIDTH * 2 + 0.6, ROOF_DROP, len), wallColors[i % wallColors.length]);
    walls.position.y = -ROOF_DROP / 2 - 0.05;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(ROAD_HALF_WIDTH * 2, 0.1, len), roofMaterial);
    roof.position.y = -0.05;
    roof.receiveShadow = true;
    house.add(walls, roof);

    // Бортики по краям крыши и у провалов
    for (const side of [-1, 1]) {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.35, len), edgeMaterial);
      edge.position.set(side * (ROAD_HALF_WIDTH + 0.15), 0.12, 0);
      edge.receiveShadow = true;
      house.add(edge);
    }
    for (const dz of [len / 2 - 0.1, -len / 2 + 0.1]) {
      const lip = new THREE.Mesh(new THREE.BoxGeometry(ROAD_HALF_WIDTH * 2, 0.08, 0.2), edgeMaterial);
      lip.position.set(0, 0.03, dz);
      house.add(lip);
    }

    // Окна на торцах, видных в провалах
    for (const dz of [len / 2 + 0.01, -len / 2 - 0.01]) {
      for (let f = 1; f < 5; f++) {
        for (const dx of [-2, 0, 2]) {
          const win = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1, 0.05), windowMaterial);
          win.position.set(dx, -f * 2.6, dz);
          house.add(win);
        }
      }
    }

    house.position.z = z;
    group.add(house);
  });

  // Улица далеко внизу
  const street = new THREE.Mesh(new THREE.PlaneGeometry(200, length + 100), lambert(0x7d7f8c));
  street.rotation.x = -Math.PI / 2;
  street.position.set(0, -ROOF_DROP, -length / 2 + 20);
  group.add(street);

  // Соседние дома по бокам: одни ниже крыши, другие выше — получается силуэт города
  for (const side of [-1, 1]) {
    let z = 20;
    while (z > -length + 20) {
      const depth = 6 + random() * 6;
      const width = 6 + random() * 6;
      const top = -6 + random() * 14;
      const height = top + ROOF_DROP;
      const tower = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, depth - 1),
        wallColors[Math.floor(random() * wallColors.length)],
      );
      const x = side * (ROAD_HALF_WIDTH + 3 + width / 2 + random() * 3);
      tower.position.set(x, -ROOF_DROP + height / 2, z - depth / 2);
      group.add(tower);

      const cap = new THREE.Mesh(new THREE.BoxGeometry(width + 0.3, 0.3, depth - 0.7), roofMaterial);
      cap.position.set(x, top + 0.15, z - depth / 2);
      group.add(cap);

      // Светящиеся окна со стороны кота
      for (let y = top - 2; y > top - 14; y -= 2.6) {
        if (random() < 0.4) continue;
        const win = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1, 1), windowMaterial);
        win.position.set(x - (side * width) / 2 - side * 0.03, y, z - depth / 2 + (random() - 0.5) * (depth - 3));
        group.add(win);
      }
      z -= depth;
    }
  }
}

export function seededRandom(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
