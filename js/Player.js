import * as THREE from 'three';
import { resolveForward, resolveSide, resolveVertical } from './collision.js';

// Скорости — в метрах (единицах сцены) в секунду
export const RUN_SPEED = 12;
const SLOW_SPEED = 6.5; // пока зажато S / ↓
const SPEED_CHANGE = 6; // насколько быстро кот разгоняется и тормозит (чем больше, тем резче)
const JUMP_SPEED = 10;
const GRAVITY = -28;
const GHOST_TIME = 1.2; // сколько секунд после спасения каской кот проходит сквозь препятствия
const DEFAULT_EYES = 0x2b2020;

export class Player {
  constructor(roadHalfWidth) {
    this.halfWidth = 0.4;
    this.halfDepth = 0.55;
    this.height = 1.25;
    this.maxX = roadHalfWidth - this.halfWidth;
    this.sideSpeed = 8;
    this.maxShields = 0;

    this.mesh = buildCat();
    this.legs = this.mesh.userData.legs;
    this.tail = this.mesh.userData.tail;
    this.hat = null;
    this.reset();
  }

  // Улучшения из гардероба: скорость вбок и число касок на забег
  setUpgrades({ sideSpeed, shields }) {
    this.sideSpeed = sideSpeed;
    this.maxShields = shields;
    this.shields = shields;
  }

  applySkin(fur, hatId) {
    const m = this.mesh.userData.materials;
    m.fur.color.setHex(fur.fur);
    m.light.color.setHex(fur.light);
    m.accent.color.setHex(fur.accent);
    m.eyes.color.setHex(fur.eyes ?? DEFAULT_EYES);

    const head = this.mesh.userData.head;
    if (this.hat) head.remove(this.hat);
    this.hat = buildHat(hatId);
    if (this.hat) head.add(this.hat);
  }

  reset() {
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.vy = 0;
    this.speed = RUN_SPEED;
    this.onGround = true;
    this.crashed = false;
    this.shields = this.maxShields;
    this.ghost = 0;
    this.runPhase = 0;
    this.lean = 0;
    this.mesh.rotation.set(0, 0, 0);
    this.mesh.visible = true;
    this.syncMesh();
  }

  // На крышах посылку несёт ворона, поэтому со спины кота её убираем
  setParcelVisible(visible) {
    this.mesh.userData.parcel.visible = visible;
  }

  // Тратит каску; true — кот спасён и ненадолго неуязвим
  useShield() {
    if (this.shields <= 0) return false;
    this.shields -= 1;
    this.ghost = GHOST_TIME;
    return true;
  }

  // Двигаем по одной оси за раз и сразу проверяем столкновения по ней
  update(dt, input, world) {
    const dir = input.direction;
    this.ghost = Math.max(0, this.ghost - dt);
    this.shielded = false;

    // Прыжок только с опоры: земли, ящика или крыши фургона
    this.jumped = false;
    if (input.consumeJump() && this.onGround) {
      this.vy = JUMP_SPEED;
      this.onGround = false;
      this.jumped = true;
    }

    const prevY = this.y;
    this.vy += GRAVITY * dt;
    this.y += this.vy * dt;
    resolveVertical(this, prevY, world);

    // Вбок — плавно, пока зажата клавиша; дорога ограничивает
    const prevX = this.x;
    this.x = THREE.MathUtils.clamp(this.x + dir * this.sideSpeed * dt, -this.maxX, this.maxX);
    if (!this.ghost) resolveSide(this, prevX, world);

    // Вперёд кот бежит сам, S / ↓ притормаживает.
    // Если врезался, но есть каска — бежит дальше сквозь препятствие.
    this.speed = THREE.MathUtils.damp(this.speed, input.slow ? SLOW_SPEED : RUN_SPEED, SPEED_CHANGE, dt);
    const prevZ = this.z;
    const nextZ = this.z - this.speed * dt;
    this.z = nextZ;
    this.crashed = !this.ghost && resolveForward(this, prevZ, world);
    if (this.crashed && this.useShield()) {
      this.crashed = false;
      this.shielded = true;
      this.z = nextZ;
    }

    this.animate(dt, dir);
    this.syncMesh();
    // Мигает, пока неуязвим
    this.mesh.visible = !this.ghost || Math.floor(this.ghost * 12) % 2 === 0;
  }

  // Врезался — падает на бок
  knockOut() {
    this.mesh.visible = true;
    this.mesh.rotation.z = Math.PI / 2;
    this.mesh.position.y = this.y + this.halfWidth;
  }

  animate(dt, dir) {
    this.runPhase += dt * this.speed * 1.3;
    const swing = this.onGround ? Math.sin(this.runPhase) * 0.7 : 0.5;
    this.legs[0].rotation.x = swing;
    this.legs[1].rotation.x = -swing;
    this.legs[2].rotation.x = -swing;
    this.legs[3].rotation.x = swing;
    this.tail.rotation.z = Math.sin(this.runPhase * 0.5) * 0.3;

    // Наклон в сторону движения
    this.lean = THREE.MathUtils.damp(this.lean, -dir * 0.18, 10, dt);
    this.mesh.rotation.z = this.lean;
  }

  syncMesh() {
    const bob = this.onGround ? Math.abs(Math.sin(this.runPhase)) * 0.06 : 0;
    this.mesh.position.set(this.x, this.y + bob, this.z);
  }
}

// Кот из простых фигур, смотрит в сторону -z (вперёд по дороге)
function buildCat() {
  const cat = new THREE.Group();
  const materials = {
    fur: new THREE.MeshLambertMaterial(),
    light: new THREE.MeshLambertMaterial(),
    accent: new THREE.MeshLambertMaterial(),
    eyes: new THREE.MeshLambertMaterial({ color: DEFAULT_EYES }),
  };
  const { fur, light, accent, eyes } = materials;
  const pink = new THREE.MeshLambertMaterial({ color: 0xff8fa3 });
  const box = new THREE.MeshLambertMaterial({ color: 0xc69255 });
  const tape = new THREE.MeshLambertMaterial({ color: 0xf6e7c8 });

  const add = (geometry, material, x, y, z, parent = cat) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };

  add(new THREE.BoxGeometry(0.7, 0.55, 1.1), fur, 0, 0.62, 0);
  add(new THREE.BoxGeometry(0.5, 0.2, 0.9), light, 0, 0.38, 0);

  const head = add(new THREE.BoxGeometry(0.62, 0.55, 0.55), fur, 0, 0.95, -0.6);
  add(new THREE.BoxGeometry(0.3, 0.18, 0.06), light, 0, -0.12, -0.28, head);
  add(new THREE.BoxGeometry(0.08, 0.1, 0.04), eyes, -0.14, 0.05, -0.29, head);
  add(new THREE.BoxGeometry(0.08, 0.1, 0.04), eyes, 0.14, 0.05, -0.29, head);
  add(new THREE.BoxGeometry(0.08, 0.06, 0.04), pink, 0, -0.07, -0.31, head);

  const earGeometry = new THREE.ConeGeometry(0.14, 0.24, 4);
  const earLeft = add(earGeometry, accent, -0.19, 0.36, 0, head);
  const earRight = add(earGeometry, accent, 0.19, 0.36, 0, head);
  earLeft.rotation.y = earRight.rotation.y = Math.PI / 4;

  // Посылка на спине
  const parcel = add(new THREE.BoxGeometry(0.55, 0.38, 0.55), box, 0, 1.08, 0.12);
  add(new THREE.BoxGeometry(0.56, 0.39, 0.1), tape, 0, 0, 0, parcel);

  // Лапы крутятся вокруг верхней точки, поэтому сдвинуты внутри своей группы
  const legGeometry = new THREE.BoxGeometry(0.16, 0.38, 0.16);
  legGeometry.translate(0, -0.19, 0);
  const legs = [
    [-0.22, -0.38],
    [0.22, -0.38],
    [-0.22, 0.38],
    [0.22, 0.38],
  ].map(([x, z]) => add(legGeometry, accent, x, 0.4, z));

  const tailGeometry = new THREE.BoxGeometry(0.12, 0.6, 0.12);
  tailGeometry.translate(0, 0.3, 0);
  const tail = add(tailGeometry, accent, 0, 0.72, 0.52);
  tail.rotation.x = 0.6;

  cat.userData = { legs, tail, head, materials, parcel };
  return cat;
}

// Шляпы садятся на голову между ушами; верх головы — y = 0.275, перед — -z
function buildHat(id) {
  const lambert = (color) => new THREE.MeshLambertMaterial({ color });
  const hat = new THREE.Group();
  const add = (geometry, material, x, y, z) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    hat.add(mesh);
    return mesh;
  };

  switch (id) {
    case 'cap': {
      const blue = lambert(0x3d6fd1);
      add(new THREE.BoxGeometry(0.4, 0.16, 0.42), blue, 0, 0.35, 0.02);
      add(new THREE.BoxGeometry(0.38, 0.04, 0.24), blue, 0, 0.29, -0.3);
      add(new THREE.BoxGeometry(0.14, 0.1, 0.02), lambert(0xf08a4b), 0, 0.36, -0.2);
      break;
    }
    case 'tophat': {
      const black = lambert(0x24242a);
      add(new THREE.CylinderGeometry(0.27, 0.27, 0.03, 16), black, 0, 0.29, 0);
      add(new THREE.CylinderGeometry(0.17, 0.17, 0.36, 16), black, 0, 0.47, 0);
      add(new THREE.CylinderGeometry(0.175, 0.175, 0.06, 16), lambert(0xc0504d), 0, 0.34, 0);
      break;
    }
    case 'crown': {
      const gold = lambert(0xf2c230);
      add(new THREE.CylinderGeometry(0.19, 0.19, 0.14, 8, 1, true), gold, 0, 0.35, 0).material.side = THREE.DoubleSide;
      for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2;
        add(new THREE.ConeGeometry(0.05, 0.12, 4), gold, Math.sin(angle) * 0.17, 0.48, Math.cos(angle) * 0.17);
      }
      add(new THREE.SphereGeometry(0.04, 8, 6), lambert(0xe85d5d), 0, 0.36, -0.19);
      break;
    }
    case 'bow': {
      const pink = lambert(0xff6f9f);
      const left = add(new THREE.ConeGeometry(0.09, 0.16, 4), pink, 0.15, 0.32, -0.05);
      left.rotation.z = -Math.PI / 2; // остриями к узелку
      const right = add(new THREE.ConeGeometry(0.09, 0.16, 4), pink, 0.33, 0.32, -0.05);
      right.rotation.z = Math.PI / 2;
      add(new THREE.SphereGeometry(0.05, 8, 6), pink, 0.24, 0.32, -0.05);
      break;
    }
    default:
      return null;
  }
  return hat;
}
