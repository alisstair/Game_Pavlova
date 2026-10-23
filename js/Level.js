import * as THREE from 'three';
import { box } from './collision.js';
import { buildRoofs, buildStreet } from './worlds.js';

export const STAMPS_NEEDED = 3;
export const FISH_POINTS = 10;
export const STAMP_POINTS = 50;

const LANES = { L: -2.5, C: 0, R: 2.5 };
const CRATE_HEIGHT = 1;
const VAN_HEIGHT = 1.9;
const CHIMNEY_HEIGHT = 1;
const ON_GROUND = 0.6;
const MAGNET_SPEED = 30; // м/с, кот бежит 12
const WALK_LIMIT = 2.8; // прохожие ходят поперёк от -2.8 до 2.8

// Прохожие поперёк дороги: размеры коробки столкновения
const WALKERS = {
  dog: { width: 0.85, height: 0.75, depth: 0.45 },
  pigeon: { width: 0.5, height: 0.45, depth: 0.35 },
};

// Строит уровень по описанию из levels.js. Всё, что он создаёт, лежит в this.group,
// поэтому смена уровня — это убрать одну группу и освободить её ресурсы (dispose).
export class Level {
  constructor(def) {
    this.def = def;
    this.group = new THREE.Group();
    this.solids = [];
    this.gaps = [];
    this.walkers = [];
    this.items = [];
    this.perches = [];
    this.m = createMaterials();
    this.g = createGeometries();

    for (const entry of def.layout) this.add(entry);

    if (def.theme === 'roofs') buildRoofs(this.group, this.gaps, def.length);
    else buildStreet(this.group, this.gaps, def.length);
    if (def.goal === 'house') this.buildHouse();

    this.fishTotal = this.items.filter((item) => item.kind === 'fish').length;
  }

  add(e) {
    const x = e.x ?? LANES[e.lane];
    switch (e.type) {
      case 'fish': {
        const step = e.step ?? 3;
        for (let i = 0; i < e.count; i++) this.addItem('fish', x, e.y ?? ON_GROUND, e.from + i * step);
        break;
      }
      case 'arc':
        // Дуга рыбок по траектории прыжка
        for (const offset of [-4, -2, 0, 2, 4]) {
          const y = ON_GROUND + 1.4 * (1 - (offset / 5) ** 2);
          this.addItem('fish', x, y, e.at + offset);
        }
        break;
      case 'stamp':
        this.addItem('stamp', x, e.y, e.at);
        break;
      case 'crates':
        if (e.lanes) for (const lane of e.lanes) this.addCrates(LANES[lane], e.from, e.to);
        else this.addCrates(x, e.from, e.to);
        break;
      case 'van':
        this.addVan(x, e.from, e.to);
        break;
      case 'barrier':
        for (const lane of e.lanes) this.addBarrier(LANES[lane], e.at);
        break;
      case 'gap':
        this.addGap(e.from, e.to);
        break;
      case 'walker':
        this.addWalker(e.kind, e.at, e.speed);
        break;
      case 'chimney':
        this.addChimney(x, e.at);
        break;
      case 'perch':
        this.addChimney(x, e.at, true);
        this.perches.push({ x, at: e.at, top: CHIMNEY_HEIGHT });
        break;
      case 'vent':
        this.addVent(x, e.at, e.width);
        break;
      case 'antenna':
        this.addAntenna(x, e.at);
        break;
    }
  }

  // --- Предметы ---

  addItem(kind, x, y, d) {
    const mesh = kind === 'fish' ? this.makeFish() : this.makeStamp();
    mesh.position.set(x, y, -d);
    mesh.rotation.y = d * 0.7; // чтобы рыбки в ряду крутились не синхронно
    this.group.add(mesh);
    this.items.push({ kind, x, y, z: -d, home: { x, y, z: -d }, mesh, collected: false, pulled: false });
  }

  makeFish() {
    const fish = new THREE.Group();
    const body = new THREE.Mesh(this.g.fishBody, this.m.fish);
    body.scale.set(1.7, 1, 0.6);
    const tail = new THREE.Mesh(this.g.fishTail, this.m.fishTail);
    tail.rotation.z = Math.PI / 2;
    tail.position.x = -0.42;
    const eye = new THREE.Mesh(this.g.eye, this.m.dark);
    eye.position.set(0.24, 0.05, 0.1);
    fish.add(body, tail, eye);
    fish.scale.setScalar(1.4);
    return fish;
  }

  makeStamp() {
    const stamp = new THREE.Group();
    const paper = new THREE.Mesh(this.g.stampPaper, this.m.stampPaper);
    const picture = new THREE.Mesh(this.g.stampPicture, this.m.stampPicture);
    const sun = new THREE.Mesh(this.g.stampSun, this.m.stampSun);
    sun.rotation.x = Math.PI / 2;
    sun.position.y = 0.05;
    stamp.add(paper, picture, sun);
    stamp.scale.setScalar(1.5);
    return stamp;
  }

  // Возвращает собранные за кадр предметы
  // magnet — радиус магнита в метрах (0 — без магнита). Притянутая рыбка летит к коту.
  collect(player, dt, magnet = 0) {
    const found = [];
    const cx = player.x;
    const cy = player.y + player.height / 2;
    const cz = player.z;
    for (const item of this.items) {
      if (item.collected) continue;

      if (magnet > 0 && item.kind === 'fish' && !item.pulled) {
        const ahead = cz - item.z; // рыбка впереди или рядом
        item.pulled =
          Math.abs(item.x - cx) < magnet + player.halfWidth &&
          ahead > -1 && ahead < magnet + 2 &&
          Math.abs(item.y - cy) < magnet + 1;
      }
      if (item.pulled) {
        // Летит быстрее, чем бежит кот, иначе не догонит
        const dx = cx - item.x;
        const dy = cy - item.y;
        const dz = cz - item.z;
        const dist = Math.hypot(dx, dy, dz);
        const k = dist > 0 ? Math.min(1, (MAGNET_SPEED * dt) / dist) : 1;
        item.x += dx * k;
        item.y += dy * k;
        item.z += dz * k;
        item.mesh.position.set(item.x, item.y, item.z);
      }

      const near =
        Math.abs(item.x - player.x) < player.halfWidth + 0.35 &&
        Math.abs(item.z - player.z) < player.halfDepth + 0.35 &&
        item.y + 0.3 > player.y &&
        item.y - 0.3 < player.y + player.height;
      if (near) {
        item.collected = true;
        item.mesh.visible = false;
        found.push(item);
      }
    }
    return found;
  }

  // --- Препятствия улицы ---

  addCrates(x, from, to) {
    const length = to - from;
    const count = Math.round(length / 1.2);
    const size = length / count;
    for (let i = 0; i < count; i++) {
      const crate = new THREE.Mesh(this.g.unit, this.m.crate);
      crate.scale.set(2.2, CRATE_HEIGHT, size - 0.05);
      crate.position.set(x, CRATE_HEIGHT / 2, -(from + size * (i + 0.5)));
      crate.castShadow = crate.receiveShadow = true;
      const lid = new THREE.Mesh(this.g.unit, this.m.crateDark);
      lid.scale.set(1.02, 0.12, 1.02);
      lid.position.y = 0.44;
      crate.add(lid);
      this.group.add(crate);
    }
    this.solids.push(box(x, 0, -(from + to) / 2, 2.2, CRATE_HEIGHT, length));
  }

  addVan(x, from, to) {
    const length = to - from;
    const van = new THREE.Group();
    const body = new THREE.Mesh(this.g.unit, this.m.van);
    body.scale.set(2.1, VAN_HEIGHT - 0.35, length);
    body.position.y = 0.35 + (VAN_HEIGHT - 0.35) / 2;
    const stripe = new THREE.Mesh(this.g.unit, this.m.vanStripe);
    stripe.scale.set(2.12, 0.3, length * 0.98);
    stripe.position.y = 1.1;
    const glass = new THREE.Mesh(this.g.unit, this.m.glass);
    glass.scale.set(1.7, 0.6, 0.05);
    glass.position.set(0, 1.4, length / 2);
    van.add(body, stripe, glass);
    for (const wx of [-0.95, 0.95]) {
      for (const wz of [-length / 2 + 1, length / 2 - 1]) {
        const wheel = new THREE.Mesh(this.g.wheel, this.m.dark);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(wx, 0.35, wz);
        van.add(wheel);
      }
    }
    van.traverse((o) => { o.castShadow = o.receiveShadow = true; });
    van.position.set(x, 0, -(from + to) / 2);
    this.group.add(van);
    this.solids.push(box(x, 0, -(from + to) / 2, 2.1, VAN_HEIGHT, length));
  }

  addBarrier(x, d) {
    const barrier = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const part = new THREE.Mesh(this.g.unit, i % 2 ? this.m.white : this.m.red);
      part.scale.set(0.48, 0.28, 0.2);
      part.position.set(-0.96 + i * 0.48, 0.55, 0);
      barrier.add(part);
    }
    for (const lx of [-1, 1]) {
      const leg = new THREE.Mesh(this.g.unit, this.m.dark);
      leg.scale.set(0.12, 0.45, 0.4);
      leg.position.set(lx, 0.22, 0);
      barrier.add(leg);
    }
    barrier.traverse((o) => { o.castShadow = true; });
    barrier.position.set(x, 0, -d);
    this.group.add(barrier);
    this.solids.push(box(x, 0, -d, 2.4, 0.7, 0.3));
  }

  addGap(from, to) {
    this.gaps.push({ from, to });
    if (this.def.theme === 'roofs') return; // на крышах провал виден и так — до улицы далеко

    const hole = new THREE.Mesh(this.g.unit, this.m.hole);
    hole.scale.set(7.5, 0.01, to - from);
    hole.position.set(0, -0.012, -(from + to) / 2);
    this.group.add(hole);
    // Конусы на тротуаре предупреждают о ремонте
    for (const side of [-1, 1]) {
      for (const d of [from - 0.5, to + 0.5]) {
        const cone = new THREE.Mesh(this.g.cone, this.m.cone);
        cone.position.set(side * 4.3, 0.45, -d);
        cone.castShadow = true;
        this.group.add(cone);
      }
    }
  }

  // Маленький запас по краям, чтобы кот не падал, задев яму кончиком лапы
  isOverGap(z) {
    const d = -z;
    return this.gaps.some((gap) => d > gap.from + 0.25 && d < gap.to - 0.25);
  }

  // --- Препятствия крыш ---

  // Кирпичная труба: можно запрыгнуть сверху. На трубы-насесты садится ворона.
  addChimney(x, d, perch = false) {
    const chimney = new THREE.Group();
    const body = new THREE.Mesh(this.g.unit, perch ? this.m.brickDark : this.m.brick);
    body.scale.set(1.2, CHIMNEY_HEIGHT, 1.2);
    body.position.y = CHIMNEY_HEIGHT / 2;
    const cap = new THREE.Mesh(this.g.unit, this.m.edge);
    cap.scale.set(1.35, 0.12, 1.35);
    cap.position.y = CHIMNEY_HEIGHT - 0.04;
    chimney.add(body, cap);
    chimney.traverse((o) => { o.castShadow = o.receiveShadow = true; });
    chimney.position.set(x, 0, -d);
    this.group.add(chimney);
    this.solids.push(box(x, 0, -d, 1.2, CHIMNEY_HEIGHT, 1.2));
  }

  // Короб вентиляции: низкий и широкий, перепрыгивается
  addVent(x, d, width) {
    const vent = new THREE.Mesh(this.g.unit, this.m.metal);
    vent.scale.set(width, 0.55, 0.8);
    vent.position.set(x, 0.275, -d);
    vent.castShadow = vent.receiveShadow = true;
    this.group.add(vent);
    for (let i = 0; i < Math.floor(width / 0.5); i++) {
      const slot = new THREE.Mesh(this.g.unit, this.m.dark);
      slot.scale.set(0.25, 0.3, 0.02);
      slot.position.set(x - width / 2 + 0.35 + i * 0.5, 0.3, -d + 0.41);
      this.group.add(slot);
    }
    this.solids.push(box(x, 0, -d, width, 0.55, 0.8));
  }

  // Антенна: высокая и тонкая, только обходить
  addAntenna(x, d) {
    const antenna = new THREE.Group();
    const pole = new THREE.Mesh(this.g.unit, this.m.metal);
    pole.scale.set(0.12, 2.8, 0.12);
    pole.position.y = 1.4;
    antenna.add(pole);
    for (const [y, w] of [[2.2, 1.4], [2.6, 1], [1.8, 1.8]]) {
      const bar = new THREE.Mesh(this.g.unit, this.m.metal);
      bar.scale.set(w, 0.06, 0.06);
      bar.position.y = y;
      antenna.add(bar);
    }
    antenna.traverse((o) => { o.castShadow = true; });
    antenna.position.set(x, 0, -d);
    this.group.add(antenna);
    this.solids.push(box(x, 0, -d, 0.35, 2.8, 0.35));
  }

  // --- Прохожие: собаки на улице, голуби на крышах ---

  addWalker(kind, d, speed) {
    const mesh = kind === 'pigeon' ? this.makePigeon() : this.makeDog();
    const walker = { kind, mesh, d, speed, startX: -WALK_LIMIT, x: -WALK_LIMIT, dir: 1, phase: 0 };
    this.group.add(mesh);
    this.walkers.push(walker);
    this.placeWalker(walker);
  }

  makeDog() {
    const dog = new THREE.Group();
    const add = this.partAdder(dog);
    add(this.g.unit, this.m.dog, 0.45, 0.4, 0.85, 0, 0.5, 0);
    add(this.g.unit, this.m.dog, 0.4, 0.38, 0.4, 0, 0.78, -0.5);
    add(this.g.unit, this.m.dogLight, 0.22, 0.18, 0.2, 0, 0.71, -0.75);
    add(this.g.unit, this.m.dark, 0.1, 0.08, 0.05, 0, 0.77, -0.86);
    add(this.g.unit, this.m.dogEar, 0.1, 0.25, 0.15, -0.22, 0.8, -0.5);
    add(this.g.unit, this.m.dogEar, 0.1, 0.25, 0.15, 0.22, 0.8, -0.5);
    add(this.g.unit, this.m.red, 0.42, 0.08, 0.1, 0, 0.6, -0.33);
    add(this.g.unit, this.m.dog, 0.08, 0.08, 0.35, 0, 0.72, 0.5).rotation.x = -0.6;
    dog.userData.legs = [[-0.13, -0.3], [0.13, -0.3], [-0.13, 0.3], [0.13, 0.3]].map(([x, z]) =>
      add(this.g.leg, this.m.dog, 1, 1, 1, x, 0.32, z),
    );
    return dog;
  }

  makePigeon() {
    const pigeon = new THREE.Group();
    const add = this.partAdder(pigeon);
    add(this.g.unit, this.m.pigeon, 0.28, 0.26, 0.42, 0, 0.26, 0);
    add(this.g.unit, this.m.pigeonNeck, 0.2, 0.2, 0.18, 0, 0.42, -0.2);
    add(this.g.unit, this.m.pigeon, 0.18, 0.16, 0.16, 0, 0.55, -0.24);
    add(this.g.unit, this.m.beak, 0.05, 0.05, 0.1, 0, 0.53, -0.36);
    add(this.g.unit, this.m.dark, 0.2, 0.04, 0.04, 0, 0.58, -0.3);
    add(this.g.unit, this.m.pigeonWing, 0.06, 0.18, 0.34, -0.16, 0.28, 0.02);
    add(this.g.unit, this.m.pigeonWing, 0.06, 0.18, 0.34, 0.16, 0.28, 0.02);
    add(this.g.unit, this.m.pigeonWing, 0.24, 0.06, 0.2, 0, 0.24, 0.28);
    pigeon.userData.legs = [-0.07, 0.07].map((x) => add(this.g.leg, this.m.beak, 0.6, 0.4, 0.6, x, 0.13, 0));
    return pigeon;
  }

  partAdder(parent) {
    return (geometry, material, sx, sy, sz, x, y, z) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.scale.set(sx, sy, sz);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      parent.add(mesh);
      return mesh;
    };
  }

  placeWalker(w) {
    w.mesh.position.set(w.x, 0, -w.d);
    // Модели смотрят в -z, разворачиваем по направлению движения
    w.mesh.rotation.y = w.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
    const swing = Math.sin(w.phase) * 0.6;
    const legs = w.mesh.userData.legs;
    legs.forEach((leg, i) => { leg.rotation.x = (i === 0 || i === 3) ? swing : -swing; });
    if (w.kind === 'pigeon') w.mesh.children[2].position.z = -0.24 - Math.abs(Math.sin(w.phase)) * 0.06; // кивает головой
  }

  walkerBoxes() {
    return this.walkers.map((w) => {
      const s = WALKERS[w.kind];
      return { kind: w.kind, box: box(w.x, 0, -w.d, s.width, s.height, s.depth) };
    });
  }

  // --- Финиш улицы ---

  buildHouse() {
    const z = -(this.def.length + 4);
    const house = new THREE.Group();

    const walls = new THREE.Mesh(this.g.unit, this.m.houseWall);
    walls.scale.set(12, 6, 6);
    walls.position.y = 3;
    const roof = new THREE.Mesh(this.g.roof, this.m.houseRoof);
    roof.rotation.y = Math.PI / 4;
    roof.scale.set(1, 1, 0.55);
    roof.position.y = 7.5;
    const door = new THREE.Mesh(this.g.unit, this.m.door);
    door.scale.set(1.6, 2.6, 0.1);
    door.position.set(0, 1.3, 3.02);
    house.add(walls, roof, door);

    for (const wx of [-3.6, 3.6]) {
      const win = new THREE.Mesh(this.g.unit, this.m.glass);
      win.scale.set(1.6, 1.4, 0.1);
      win.position.set(wx, 3.4, 3.02);
      house.add(win);
    }
    house.traverse((o) => { o.castShadow = o.receiveShadow = true; });
    house.position.set(0, 0, z - 3);
    this.group.add(house);

    // Клетчатая линия финиша
    const checker = new THREE.Group();
    for (let i = 0; i < 15; i++) {
      for (let j = 0; j < 2; j++) {
        const tile = new THREE.Mesh(this.g.unit, (i + j) % 2 ? this.m.white : this.m.dark);
        tile.scale.set(0.5, 0.02, 0.5);
        tile.position.set(-3.5 + i * 0.5, 0.01, j * 0.5);
        checker.add(tile);
      }
    }
    checker.position.z = -this.def.length;
    this.group.add(checker);
  }

  // --- Кадр, сброс, удаление ---

  update(dt, time) {
    for (const item of this.items) {
      if (item.collected) continue;
      item.mesh.rotation.y += dt * 2.5;
      if (!item.pulled) item.mesh.position.y = item.home.y + Math.sin(time * 3 + item.home.z) * 0.08;
    }
    for (const w of this.walkers) {
      w.x += w.dir * w.speed * dt;
      if (w.x > WALK_LIMIT) w.dir = -1;
      if (w.x < -WALK_LIMIT) w.dir = 1;
      w.x = THREE.MathUtils.clamp(w.x, -WALK_LIMIT, WALK_LIMIT);
      w.phase += dt * w.speed * 5;
      this.placeWalker(w);
    }
  }

  reset() {
    for (const item of this.items) {
      item.collected = false;
      item.pulled = false;
      Object.assign(item, item.home);
      item.mesh.position.set(item.x, item.y, item.z);
      item.mesh.visible = true;
    }
    for (const w of this.walkers) {
      w.x = w.startX;
      w.dir = 1;
      w.phase = 0;
      this.placeWalker(w);
    }
  }

  // Освободить видеопамять: геометрии и материалы сами не удаляются
  dispose() {
    this.group.removeFromParent();
    const materials = new Set();
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) materials.add(o.material);
    });
    materials.forEach((m) => m.dispose());
  }
}

function createMaterials() {
  const lambert = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
  return {
    fish: lambert(0x7ec8e3),
    fishTail: lambert(0x4f9fc4),
    dark: lambert(0x2b2525),
    white: lambert(0xf7f3e8),
    red: lambert(0xe85d5d),
    stampPaper: lambert(0xfffaf0, { emissive: 0x332a10 }),
    stampPicture: lambert(0x5aa9e6, { emissive: 0x0d2233 }),
    stampSun: lambert(0xffd23f, { emissive: 0x553f00 }),
    crate: lambert(0xd9a066),
    crateDark: lambert(0xb07a45),
    van: lambert(0xf2f2f2),
    vanStripe: lambert(0xf08a4b),
    glass: lambert(0x7fb3d5),
    hole: lambert(0x3a2e2a),
    cone: lambert(0xff8a3d),
    dog: lambert(0x9c6b4e),
    dogLight: lambert(0xd9b99b),
    dogEar: lambert(0x5e3f30),
    pigeon: lambert(0x8d93a6),
    pigeonNeck: lambert(0x6f8f86),
    pigeonWing: lambert(0x6c7182),
    beak: lambert(0xe0a070),
    brick: lambert(0xb5573f),
    brickDark: lambert(0x8f3f2e),
    edge: lambert(0x4f4850),
    metal: lambert(0xa7adb5),
    houseWall: lambert(0xffe0b5),
    houseRoof: lambert(0xc0504d),
    door: lambert(0x7a4b32),
  };
}

function createGeometries() {
  const leg = new THREE.BoxGeometry(0.1, 0.32, 0.1);
  leg.translate(0, -0.16, 0);
  return {
    unit: new THREE.BoxGeometry(1, 1, 1),
    fishBody: new THREE.SphereGeometry(0.2, 10, 8),
    fishTail: new THREE.ConeGeometry(0.16, 0.25, 4),
    eye: new THREE.SphereGeometry(0.035, 6, 4),
    stampPaper: new THREE.BoxGeometry(0.6, 0.72, 0.05),
    stampPicture: new THREE.BoxGeometry(0.46, 0.56, 0.06),
    stampSun: new THREE.CylinderGeometry(0.11, 0.11, 0.08, 12),
    wheel: new THREE.CylinderGeometry(0.35, 0.35, 0.3, 12),
    cone: new THREE.ConeGeometry(0.25, 0.6, 8),
    roof: new THREE.ConeGeometry(8.6, 3, 4),
    leg,
  };
}
