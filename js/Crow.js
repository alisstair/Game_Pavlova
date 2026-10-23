import * as THREE from 'three';
import { box, intersects, playerBox } from './collision.js';

const AHEAD = 11; // на сколько метров ворона держится впереди кота
const FLY_HEIGHT = 3;
const DROP_TIME = 1; // сколько летит мусор; столько же видна тень-предупреждение
const DROP_INTERVAL = [0.75, 0.95, 1.2]; // пауза между бросками при 1, 2 и 3 «сердечках» — чем злее, тем чаще
// За сколько метров до трубы ворона летит садиться. Садится, когда коту остаётся ~19 м (≈1,5 с):
// игрок успевает заметить стрелку над трубой и выйти на неё.
const PERCH_RANGE = 30;
const PERCH_FLY_SPEED = 22;
const TRASH = { width: 0.7, height: 0.6, depth: 0.7 };

// Босс второго уровня. Состояния:
// waiting → fly ⇄ toPerch → perched → (попали) hurt → fly … → defeated → gone
//                           perched → (кот пробежал мимо) → fly
export class Crow {
  constructor(level, config) {
    this.level = level;
    this.maxHp = config.hp;
    this.appearAt = config.appearAt;
    this.perches = [...level.perches].sort((a, b) => a.at - b.at);

    this.group = new THREE.Group();
    level.group.add(this.group);
    this.mesh = buildCrow();
    this.group.add(this.mesh);
    this.parcelMesh = buildParcel();
    this.trashMaterials = [0x3f5f3a, 0x45505e, 0x6b4f3a].map((color) => new THREE.MeshLambertMaterial({ color }));
    this.trashGeometry = new THREE.BoxGeometry(TRASH.width, TRASH.height, TRASH.depth);
    this.shadowGeometry = new THREE.CircleGeometry(0.55, 20);
    // Тень-предупреждение красноватая, чтобы её было видно на тёмной крыше
    this.shadowMaterial = new THREE.MeshBasicMaterial({ color: 0x8a1c1c, transparent: true, opacity: 0.3, depthWrite: false });
    this.drops = [];

    // Жёлтая стрелка над трубой, на которую садится ворона: «прыгай сюда»
    this.marker = buildMarker();
    this.group.add(this.marker);
    this.reset();
  }

  reset() {
    for (const drop of [...this.drops]) this.removeDrop(drop);
    this.hp = this.maxHp;
    this.state = 'waiting';
    this.perchIndex = 0;
    this.dropTimer = 1.2;
    this.timer = 0;
    this.flap = 0;
    this.x = 0;
    this.y = FLY_HEIGHT + 1;
    this.z = -(this.appearAt + 25);
    this.mesh.visible = true;
    this.carrying = true;
    this.parcel = null;
    this.parcelMesh.removeFromParent();
    this.place();
  }

  get perch() {
    return this.perches[this.perchIndex];
  }

  update(dt, player, time) {
    const events = [];
    const catD = -player.z;
    const perch = this.perch;

    switch (this.state) {
      case 'waiting':
        // Сидит в воздухе впереди и ждёт, пока кот добежит
        this.y = FLY_HEIGHT + 1 + Math.sin(time * 2) * 0.2;
        if (catD >= this.appearAt) {
          this.state = 'fly';
          events.push('appear');
        }
        break;

      case 'fly': {
        const k = 1 - Math.exp(-3 * dt);
        this.x += (Math.sin(time * 0.8) * 2.2 - this.x) * k;
        this.y += (FLY_HEIGHT + Math.sin(time * 2) * 0.3 - this.y) * k;
        this.z += (player.z - AHEAD - this.z) * (1 - Math.exp(-2.5 * dt));

        // Трубы, мимо которых кот уже пробежал (пока ворона приходила в себя), пропускаем
        while (this.perch && catD > this.perch.at) this.perchIndex += 1;
        if (this.perch && catD >= this.perch.at - PERCH_RANGE) {
          this.state = 'toPerch';
          events.push('perching');
          break;
        }
        this.dropTimer -= dt;
        if (this.dropTimer <= 0) {
          if (this.dropTrash(player)) events.push('drop');
          this.dropTimer = DROP_INTERVAL[this.hp - 1];
        }
        break;
      }

      case 'toPerch': {
        const target = new THREE.Vector3(perch.x, perch.top, -perch.at);
        const pos = new THREE.Vector3(this.x, this.y, this.z);
        const dist = pos.distanceTo(target);
        const step = PERCH_FLY_SPEED * dt;
        if (dist <= step) {
          ({ x: this.x, y: this.y, z: this.z } = target);
          this.state = 'perched';
          events.push('perch');
        } else {
          pos.lerp(target, step / dist);
          ({ x: this.x, y: this.y, z: this.z } = pos);
        }
        if (catD > perch.at + 1.5) this.missPerch(events);
        break;
      }

      case 'perched':
        if (catD > perch.at + 1.5) this.missPerch(events);
        break;

      case 'hurt':
        // Отлетает вверх, мигает и возвращается в погоню
        this.timer -= dt;
        this.y += 4 * dt;
        this.z += (player.z - AHEAD - this.z) * (1 - Math.exp(-2 * dt));
        if (this.timer <= 0) this.state = 'fly';
        break;

      case 'defeated':
        this.timer -= dt;
        this.y += 3 * dt;
        this.z -= 14 * dt;
        this.x += 2 * dt;
        if (this.timer <= 0) {
          this.state = 'gone';
          this.mesh.visible = false;
        }
        break;
    }

    this.updateDrops(dt, player, events);
    // Кот всё-таки проскочил мимо посылки — она «перелетает» вперёд, чтобы не застрять в погоне без конца
    if (this.parcel?.landed && this.parcel.z > player.z + 2) this.dropParcel(player);
    this.updateParcel(dt, time);
    this.flap += dt * 14;
    this.place();
    this.placeMarker(time);
    return events;
  }

  placeMarker(time) {
    const perch = this.perch;
    const show = perch && (this.state === 'toPerch' || this.state === 'perched');
    this.marker.visible = Boolean(show);
    if (!show) return;
    this.marker.position.set(perch.x, perch.top + 3 + Math.sin(time * 6) * 0.25, -perch.at);
    this.marker.rotation.y = time * 2;
  }

  missPerch(events) {
    this.perchIndex += 1;
    this.state = 'fly';
    events.push('missed');
  }

  // Кот прыгнул на сидящую ворону. Добраться до неё можно только сверху:
  // спереди и сбоку её закрывает труба.
  tryHit(player) {
    if (this.state !== 'perched') return false;
    const hitBox = box(this.x, this.y, this.z, 0.95, 0.85, 0.95);
    if (!intersects(playerBox(player), hitBox)) return false;

    this.hp -= 1;
    this.perchIndex += 1;
    if (this.hp > 0) {
      this.state = 'hurt';
      this.timer = 0.9;
    } else {
      this.state = 'defeated';
      this.timer = 2.5;
      this.dropParcel(player);
    }
    return true;
  }

  // --- Мусор ---

  dropTrash(player) {
    const catD = -player.z;
    const d = catD + Math.max(player.speed, 5) * 1.25 + 1.5;
    // Не мусорит рядом с трубой, на которую собирается сесть, — к ней должен быть свободный разбег
    const perch = this.perch;
    if (perch && d > perch.at - 14 && d < perch.at + 2) return false;

    const x = THREE.MathUtils.clamp(player.x + (Math.random() - 0.5) * 1.6, -3.1, 3.1);
    const mesh = new THREE.Mesh(this.trashGeometry, this.trashMaterials[Math.floor(Math.random() * 3)]);
    mesh.castShadow = true;
    const shadow = new THREE.Mesh(this.shadowGeometry, this.shadowMaterial.clone());
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(x, 0.03, -d);
    this.group.add(mesh, shadow);
    this.drops.push({
      mesh, shadow, x, z: -d,
      from: new THREE.Vector3(this.x, this.y - 0.3, this.z),
      t: 0, state: 'falling', solid: null,
    });
    return true;
  }

  updateDrops(dt, player, events) {
    for (const drop of [...this.drops]) {
      if (drop.state === 'falling') {
        drop.t += dt;
        const p = Math.min(drop.t / DROP_TIME, 1);
        drop.mesh.position.set(
          drop.from.x + (drop.x - drop.from.x) * p,
          drop.from.y + (TRASH.height / 2 - drop.from.y) * p * p,
          drop.from.z + (drop.z - drop.from.z) * p,
        );
        drop.mesh.rotation.x = p * 4;
        drop.shadow.scale.setScalar(0.4 + p * 0.8);
        drop.shadow.material.opacity = 0.3 + p * 0.4;
        if (p >= 1) this.landDrop(drop, player, events);
      } else if (drop.state === 'lost') {
        // Попал в провал — падает на улицу
        drop.mesh.position.y -= 15 * dt;
        if (drop.mesh.position.y < -20) this.removeDrop(drop);
      } else if (drop.z > player.z + 12) {
        this.removeDrop(drop); // остался далеко позади
      }
    }
  }

  landDrop(drop, player, events) {
    drop.shadow.removeFromParent();
    if (this.level.isOverGap(drop.z)) {
      drop.state = 'lost';
      return;
    }
    drop.state = 'landed';
    drop.mesh.rotation.set(0, Math.random(), 0);
    drop.mesh.position.set(drop.x, TRASH.height / 2, drop.z);
    drop.solid = box(drop.x, 0, drop.z, TRASH.width, TRASH.height, TRASH.depth);
    this.level.solids.push(drop.solid);
    events.push('land');
    // Упало прямо на кота
    if (intersects(playerBox(player, 0.1), drop.solid)) events.push('trashHit');
  }

  removeDrop(drop) {
    drop.mesh.removeFromParent();
    drop.shadow.removeFromParent();
    drop.shadow.material.dispose();
    if (drop.solid) this.level.solids.splice(this.level.solids.indexOf(drop.solid), 1);
    this.drops.splice(this.drops.indexOf(drop), 1);
  }

  // --- Посылка ---

  dropParcel(player) {
    this.carrying = false;
    // Падает перед котом, но не в провал
    let d = -player.z + 9;
    while (this.level.isOverGap(-d) || this.level.isOverGap(-d - 0.6) || this.level.isOverGap(-d + 0.6)) d += 1;
    // Прямо на пути кота: после победы над вороной посылку не должно быть легко пропустить
    this.parcel = {
      x: THREE.MathUtils.clamp(player.x, -2.8, 2.8),
      y: this.y,
      z: -d,
      vy: 0,
      landed: false,
    };
    this.group.add(this.parcelMesh);
  }

  updateParcel(dt, time) {
    const parcel = this.parcel;
    if (!parcel) return;
    if (!parcel.landed) {
      parcel.vy -= 20 * dt;
      parcel.y += parcel.vy * dt;
      if (parcel.y <= 0.35) {
        parcel.y = 0.35;
        parcel.landed = true;
      }
    }
    const bob = parcel.landed ? Math.sin(time * 4) * 0.08 : 0;
    this.parcelMesh.position.set(parcel.x, parcel.y + bob, parcel.z);
    this.parcelMesh.rotation.y += dt * 1.5;
  }

  collectParcel(player) {
    const parcel = this.parcel;
    if (!parcel) return false;
    // Ловится с большим запасом: достаточно пробежать рядом
    const near =
      Math.abs(parcel.x - player.x) < player.halfWidth + 1.2 &&
      Math.abs(parcel.z - player.z) < player.halfDepth + 0.6 &&
      parcel.y < player.y + player.height + 1 &&
      parcel.y + 0.6 > player.y;
    if (near) {
      this.parcel = null;
      this.parcelMesh.removeFromParent();
    }
    return near;
  }

  // --- Отрисовка ---

  place() {
    const m = this.mesh;
    m.position.set(this.x, this.y, this.z);
    // В полёте смотрит вперёд, на трубе — на кота
    m.rotation.y = this.state === 'perched' ? Math.PI : 0;
    const { wings, head, parcel } = m.userData;
    const flapping = this.state !== 'perched';
    parcel.visible = this.carrying && flapping; // на трубе посылка «стоит» внутри неё — прячем
    // Сидя складывает крылья вдоль боков
    wings[0].rotation.z = flapping ? Math.sin(this.flap) * 0.8 : 1.35;
    wings[1].rotation.z = flapping ? -Math.sin(this.flap) * 0.8 : -1.35;
    head.position.y = 0.62 + (flapping ? 0 : Math.abs(Math.sin(this.flap * 0.4)) * 0.05);
    m.visible = this.state === 'gone' ? false : this.state !== 'hurt' || Math.floor(this.timer * 12) % 2 === 0;
  }
}

// Ворона из простых фигур, смотрит в -z. Ноги — в нуле, как у кота.
function buildCrow() {
  const crow = new THREE.Group();
  const black = new THREE.MeshLambertMaterial({ color: 0x23232b });
  const sheen = new THREE.MeshLambertMaterial({ color: 0x3a3d52 });
  const beak = new THREE.MeshLambertMaterial({ color: 0x5a5a5a });
  const white = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const add = (geometry, material, x, y, z, parent = crow) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };

  add(new THREE.BoxGeometry(0.5, 0.42, 0.8), black, 0, 0.4, 0);
  add(new THREE.BoxGeometry(0.42, 0.12, 0.6), sheen, 0, 0.62, 0.02);
  const head = add(new THREE.BoxGeometry(0.36, 0.34, 0.36), black, 0, 0.62, -0.46);
  const beakMesh = add(new THREE.ConeGeometry(0.09, 0.32, 4), beak, 0, -0.04, -0.32, head);
  beakMesh.rotation.x = -Math.PI / 2;
  for (const side of [-1, 1]) {
    add(new THREE.BoxGeometry(0.02, 0.09, 0.09), white, side * 0.185, 0.05, -0.08, head);
    add(new THREE.BoxGeometry(0.025, 0.045, 0.045), black, side * 0.19, 0.05, -0.1, head);
  }
  const tail = add(new THREE.BoxGeometry(0.34, 0.06, 0.4), black, 0, 0.42, 0.55);
  tail.rotation.x = 0.3;
  for (const side of [-1, 1]) {
    const leg = add(new THREE.BoxGeometry(0.05, 0.22, 0.05), beak, side * 0.12, 0.11, 0);
    leg.castShadow = false;
  }

  // Крылья машут вокруг плеча
  const wings = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.25, 0.5, 0);
    const geometry = new THREE.BoxGeometry(0.75, 0.05, 0.55);
    geometry.translate(side * 0.375, 0, 0);
    add(geometry, black, 0, 0, 0, pivot);
    crow.add(pivot);
    return pivot;
  });

  // Украденная посылка в лапах
  const parcel = buildParcel(0.42);
  parcel.position.set(0, -0.05, 0);
  crow.add(parcel);

  crow.scale.setScalar(1.6);
  crow.userData = { wings, head, parcel };
  return crow;
}

// Стрелка остриём вниз. MeshBasicMaterial не зависит от света — яркая даже на закате.
function buildMarker() {
  const marker = new THREE.Group();
  const yellow = new THREE.MeshBasicMaterial({ color: 0xffd23f });
  const outline = new THREE.MeshBasicMaterial({ color: 0x7a4b00 });
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.65, 4), yellow);
  tip.rotation.x = Math.PI; // остриём вниз
  const stem = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.5, 0.26), yellow);
  stem.position.y = 0.55;
  const rim = new THREE.Mesh(new THREE.ConeGeometry(0.47, 0.7, 4), outline);
  rim.rotation.x = Math.PI;
  rim.position.y = 0.04;
  rim.scale.setScalar(1.02);
  marker.add(rim, tip, stem);
  marker.scale.setScalar(1.7);
  return marker;
}

function buildParcel(size = 0.55) {
  const parcel = new THREE.Group();
  const cardboard = new THREE.Mesh(
    new THREE.BoxGeometry(size, size * 0.7, size),
    new THREE.MeshLambertMaterial({ color: 0xc69255, emissive: 0x2a1600 }),
  );
  const tape = new THREE.Mesh(
    new THREE.BoxGeometry(size * 1.02, size * 0.72, size * 0.18),
    new THREE.MeshLambertMaterial({ color: 0xf6e7c8 }),
  );
  cardboard.castShadow = true;
  parcel.add(cardboard, tape);
  return parcel;
}
