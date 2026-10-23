import * as THREE from 'three';
import { Player } from './Player.js';
import { FISH_POINTS, Level, STAMP_POINTS, STAMPS_NEEDED } from './Level.js';
import { Crow } from './Crow.js';
import { ROAD_HALF_WIDTH } from './worlds.js';
import { intersects, playerBox } from './collision.js';
import { findFur, findHat, upgradeValue } from './catalog.js';

const MAX_DT = 0.05; // после лага шаг не больше 50 мс, чтобы кот не «телепортировался»
const BOSS_POINTS = 100; // за каждое попадание по вороне

// Свет под настроение уровня: днём на улице, на закате на крышах
const LIGHTS = {
  street: { sky: 0xffffff, ground: 0xd8c9a8, sun: 0xfff2dc, sunPower: 1.8 },
  roofs: { sky: 0xffe2c8, ground: 0x8a7a8c, sun: 0xffc48a, sunPower: 1.9 },
};

// Состояния: ready → running ⇄ paused → won / lost
export class Game {
  constructor(canvas, input) {
    this.canvas = canvas;
    this.input = input;
    this.state = 'ready';
    this.lastTime = null;
    this.elapsed = 0;
    this.score = 0;
    this.fish = 0;
    this.stamps = 0;
    this.lossReason = null;
    this.magnet = 0;
    this.showcase = false; // витрина гардероба: камера смотрит коту в мордочку
    this.level = null;
    this.crow = null;
    this.onStateChange = null;
    this.onHud = null;
    this.onEvent = null; // прыжок, предметы, ворона, победа и поражение — для звука и подсказок

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color();
    this.scene.fog = new THREE.Fog(0xffffff, 35, 110);

    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);

    this.buildLights();
    this.player = new Player(ROAD_HALF_WIDTH);
    this.scene.add(this.player.mesh);

    new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
    this.resize();

    // Единственный цикл на всю жизнь страницы: старт, пауза, рестарт и смена уровня его не пересоздают
    this.frame = this.frame.bind(this);
    requestAnimationFrame(this.frame);
  }

  // --- Уровни ---

  // Старый уровень убираем целиком и строим новый по описанию из levels.js
  loadLevel(def) {
    if (!def || this.level?.def === def) return;

    // Сначала строим новый уровень и только потом удаляем старый:
    // если сборка сломается, на экране останется рабочий уровень, а не пустота
    const level = new Level(def);
    const crow = def.boss ? new Crow(level, def.boss) : null;
    if (this.level) this.level.dispose();
    this.level = level;
    this.crow = crow;
    this.scene.add(level.group);

    this.scene.background.setHex(def.sky);
    this.scene.fog.color.setHex(def.sky);
    const light = LIGHTS[def.theme];
    this.hemi.color.setHex(light.sky);
    this.hemi.groundColor.setHex(light.ground);
    this.sun.color.setHex(light.sun);
    this.sun.intensity = light.sunPower;
    this.player.setParcelVisible(def.goal !== 'boss');

    this.resetRun();
  }

  get def() {
    return this.level.def;
  }

  // --- Управление состоянием ---

  start() {
    if (this.state !== 'ready') return;
    this.restart();
  }

  // Надетые вещи и улучшения из профиля
  applyProfile(profile) {
    this.player.applySkin(findFur(profile.fur), findHat(profile.hat).id);
    this.player.setUpgrades({
      sideSpeed: upgradeValue('agility', profile.upgrades.agility),
      shields: upgradeValue('helmet', profile.upgrades.helmet),
    });
    this.magnet = upgradeValue('magnet', profile.upgrades.magnet);
    this.reportHud(true);
  }

  // Вернуться в меню: всё как перед первым забегом
  toReady() {
    this.resetRun();
    this.setState('ready');
  }

  setShowcase(on) {
    this.showcase = on;
    this.player.mesh.rotation.set(0, 0, 0);
    if (on) this.placeShowcaseCamera();
    else {
      this.camera.clearViewOffset();
      this.snapCamera();
    }
  }

  pause() {
    if (this.state !== 'running') return;
    this.setState('paused');
  }

  resume() {
    if (this.state !== 'paused') return;
    this.setState('running');
  }

  togglePause() {
    if (this.state === 'running') this.pause();
    else if (this.state === 'paused') this.resume();
  }

  // Полный сброс кота, предметов, прохожих, вороны и счёта; цикл и обработчики остаются прежними
  restart() {
    this.resetRun();
    this.setState('running');
  }

  resetRun() {
    this.player.reset();
    this.level.reset();
    if (this.crow) this.crow.reset();
    this.elapsed = 0;
    this.score = 0;
    this.fish = 0;
    this.stamps = 0;
    this.lossReason = null;
    this.reportHud(true);
    this.snapCamera();
  }

  lose(reason) {
    this.lossReason = reason;
    if (reason !== 'fall' && reason !== 'escaped') this.player.knockOut();
    this.emit(reason);
    this.setState('lost');
  }

  win() {
    this.emit('win');
    this.setState('won');
  }

  emit(name) {
    if (this.onEvent) this.onEvent(name);
  }

  setState(state) {
    this.state = state;
    // Сбрасываем время кадра, чтобы после паузы dt не оказался огромным
    this.lastTime = null;
    this.input.active = state === 'running';
    this.input.clear();
    if (this.onStateChange) this.onStateChange(state);
  }

  // --- Игровой цикл ---

  frame(time) {
    requestAnimationFrame(this.frame);

    if (this.state === 'running') {
      if (this.lastTime === null) this.lastTime = time;
      const dt = Math.min((time - this.lastTime) / 1000, MAX_DT);
      this.lastTime = time;
      this.update(dt);
    } else if (this.showcase) {
      // Кот покачивается, чтобы было видно шляпу и бока
      this.player.mesh.rotation.y = Math.sin(time / 1200) * 0.9;
    }

    this.renderer.render(this.scene, this.camera);
  }

  update(dt) {
    const player = this.player;
    const level = this.level;
    this.elapsed += dt;
    level.update(dt, this.elapsed);
    player.update(dt, this.input, level);
    if (player.jumped) this.emit('jump');
    if (player.shielded) this.emit('shield');
    this.followCamera(dt);
    this.moveSun();

    for (const item of level.collect(player, dt, this.magnet)) {
      this.emit(item.kind);
      if (item.kind === 'fish') {
        this.fish += 1;
        this.score += FISH_POINTS;
      } else {
        this.stamps += 1;
        this.score += STAMP_POINTS;
      }
    }

    // Опасности, от которых спасает каска. Прохожие прощают касание краешком — коробку кота чуть уменьшаем.
    let hazard = null;
    const catBox = playerBox(player, 0.1);
    const walker = level.walkerBoxes().find((w) => intersects(catBox, w.box));
    if (walker) hazard = walker.kind;

    let parcelTaken = false;
    if (this.crow) {
      for (const event of this.crow.update(dt, player, this.elapsed)) {
        if (event === 'trashHit') hazard = 'trash';
        else this.emit(event);
      }
      if (this.crow.tryHit(player)) {
        this.score += BOSS_POINTS;
        player.vy = 7; // отскок от вороны, как от батута
        player.onGround = false;
        this.emit(this.crow.hp > 0 ? 'bossHit' : 'bossDown');
      }
      parcelTaken = this.crow.collectParcel(player);
    }

    if (hazard) {
      if (player.ghost) hazard = null; // только что спасла каска — пока мигает, неуязвим
      else if (player.useShield()) {
        hazard = null;
        this.emit('shield');
      }
    }
    this.reportHud();

    const passed = -player.z >= this.def.length;
    if (player.crashed) this.lose('crash');
    else if (hazard) this.lose(hazard);
    else if (player.y < -0.6) this.lose('fall');
    else if (this.def.goal === 'boss') {
      if (parcelTaken) this.win();
      else if (passed) this.lose('escaped');
    } else if (passed) {
      if (this.stamps >= STAMPS_NEEDED) this.win();
      else this.lose('stamps');
    }
  }

  reportHud(force = false) {
    if (!this.level) return;
    const distance = Math.max(0, Math.min(Math.floor(-this.player.z), this.def.length));
    const { shields, maxShields } = this.player;
    const boss = this.crow ? { hp: this.crow.hp, max: this.crow.maxHp } : null;
    const key = `${this.score}|${this.stamps}|${distance}|${shields}|${maxShields}|${boss?.hp}`;
    if ((force || key !== this.lastHud) && this.onHud) {
      this.lastHud = key;
      this.onHud({ score: this.score, stamps: this.stamps, distance, shields, maxShields, boss });
    }
  }

  // --- Камера и свет ---

  cameraTarget() {
    const p = this.player;
    return {
      position: new THREE.Vector3(p.x * 0.6, 4.2 + p.y * 0.5, p.z + 7.5),
      look: new THREE.Vector3(p.x * 0.3, 1 + p.y * 0.5, p.z - 8),
    };
  }

  // Камера перед котом. Сдвиг кадра освобождает место под панель гардероба:
  // на телефоне панель снизу — кот выше, на широком экране панель справа — кот левее.
  placeShowcaseCamera() {
    const p = this.player;
    this.camera.position.set(p.x, 1.8, p.z - 4.4);
    this.camera.lookAt(p.x, 0.9, p.z);
    const { width, height } = this.renderer.getSize(new THREE.Vector2());
    // Та же граница, что в style.css
    if (window.matchMedia('(min-width: 768px)').matches) this.camera.setViewOffset(width, height, width * 0.2, 0, width, height);
    else this.camera.setViewOffset(width, height, 0, height * 0.24, width, height);
  }

  snapCamera() {
    const { position, look } = this.cameraTarget();
    this.camera.position.copy(position);
    this.camera.lookAt(look);
    this.moveSun();
  }

  followCamera(dt) {
    const { position, look } = this.cameraTarget();
    const k = 1 - Math.exp(-8 * dt);
    this.camera.position.lerp(position, k);
    // Вперёд камера едет вместе с котом без отставания
    this.camera.position.z = position.z;
    this.camera.lookAt(look);
  }

  buildLights() {
    this.hemi = new THREE.HemisphereLight(0xffffff, 0xd8c9a8, 1.6);
    this.scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xfff2dc, 1.8);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const s = this.sun.shadow.camera;
    s.left = -8;
    s.right = 8;
    s.top = 10;
    s.bottom = -10;
    s.near = 1;
    s.far = 40;
    this.scene.add(this.sun, this.sun.target);
  }

  // Тень считается только вокруг кота, поэтому солнце едет за ним
  moveSun() {
    const z = this.player.z;
    this.sun.position.set(6, 14, z + 6);
    this.sun.target.position.set(0, 0, z - 4);
  }

  resize() {
    const parent = this.canvas.parentElement;
    const width = parent.clientWidth;
    const height = parent.clientHeight;
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    // На узком вертикальном экране шире угол, чтобы влезала вся дорога
    this.camera.fov = this.camera.aspect < 1 ? 78 : 60;
    this.camera.updateProjectionMatrix();
    if (this.showcase) this.placeShowcaseCamera();
  }
}
