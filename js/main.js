import { Game } from './Game.js';
import { Input } from './input.js';
import { STAMPS_NEEDED } from './Level.js';
import { LEVELS, STREET, findLevel } from './levels.js';
import { WIN_BONUS } from './catalog.js';
import { Shop } from './shop.js';
import { Sound } from './sound.js';
import {
  clearProgress,
  defaultProfile,
  loadMuted,
  loadProfile,
  loadRecord,
  saveMuted,
  saveProfile,
  saveRecord,
} from './storage.js';

const $ = (id) => document.getElementById(id);

const input = new Input(document.querySelector('.touch'));
const game = new Game($('game'), input);
const sound = new Sound(loadMuted());
const profile = loadProfile();

// Рекорды у каждого уровня свои
const records = Object.fromEntries(LEVELS.map((level) => [level.id, loadRecord(level.id)]));
let isNewRecord = false;
let recordSaved = true;
let earned = 0;
let unlockedNow = null; // уровень, открытый только что этой победой

const overlay = $('overlay');
const screens = [...overlay.querySelectorAll('[data-screen]')];
const shopPanel = $('shop');
const pauseBtn = $('pauseBtn');
const restartBtn = $('restartBtn');
const resetBtn = $('resetBtn');
const toast = $('toast');

const nextLevel = () => LEVELS[LEVELS.indexOf(game.def) + 1];

// --- Экраны меню ---

let screen = 'menu';
let backTo = 'menu'; // куда ведёт «Назад» из «Как играть», «Настроек» и выбора уровня

function showScreen(name, focusFirst = false) {
  screen = name;
  overlay.hidden = !name;
  for (const el of screens) el.hidden = el.dataset.screen !== name;
  if (name !== 'settings') disarmReset();
  if (name === 'levels') renderLevels();
  // Если меню листают с клавиатуры, фокус переходит на первую кнопку нового экрана
  if (name && focusFirst) overlay.querySelector(`[data-screen="${name}"] button:not(:disabled)`)?.focus();
}

// Значения, которые показаны в нескольких местах сразу
function renderBinds() {
  const passed = LEVELS.filter((level) => profile.completed.includes(level.id)).length;
  document.querySelectorAll('[data-bind="record"]').forEach((el) => { el.textContent = records[game.def.id]; });
  document.querySelectorAll('[data-bind="wallet"]').forEach((el) => { el.textContent = profile.fish; });
  document.querySelectorAll('[data-bind="progress"]').forEach((el) => { el.textContent = `${passed}/${LEVELS.length}`; });
  document.querySelectorAll('[data-bind="soundLabel"]').forEach((el) => { el.textContent = sound.muted ? 'Выкл' : 'Вкл'; });
  document.querySelectorAll('.btn--sound').forEach((el) => el.setAttribute('aria-pressed', String(!sound.muted)));
  $('soundBtn').textContent = sound.muted ? 'Звук выкл' : 'Звук вкл';
}

// Карточки уровней: открытые можно выбрать, закрытые подсказывают, как открыть
function renderLevels() {
  const list = $('levelList');
  list.innerHTML = '';
  LEVELS.forEach((level, i) => {
    const open = profile.unlocked.includes(level.id);
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'level-card';
    card.dataset.action = 'level';
    card.dataset.level = level.id;
    card.disabled = !open;

    const num = document.createElement('span');
    num.className = 'level-card__num';
    num.textContent = open ? level.number : '🔒';
    const name = document.createElement('span');
    name.className = 'level-card__name';
    name.textContent = level.name;
    const info = document.createElement('span');
    info.className = 'level-card__info';
    if (!open) info.textContent = `Пройди уровень «${LEVELS[i - 1].name}», чтобы открыть`;
    else info.textContent = records[level.id] ? `${level.intro} Рекорд: ${records[level.id]}` : level.intro;

    card.append(num, name, info);
    list.append(card);
  });
}

// --- Подсказки во время забега ---

let toastTimer = null;
let perchHintShown = false;

// alert — важная подсказка: жёлтая, крупнее, висит дольше
function showToast(text, alert = false) {
  toast.textContent = text;
  toast.hidden = false;
  toast.classList.toggle('toast--alert', alert);
  // Перезапускаем анимацию появления
  toast.style.animation = 'none';
  void toast.offsetWidth;
  toast.style.animation = '';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, alert ? 3000 : 2200);
}

// [текст, важная ли подсказка]
const eventToasts = {
  appear: () => ['Ворона! Догоняй и уворачивайся от мусора — смотри на тени', false],
  // Ворона только полетела к трубе — до неё ещё ~2,5 с бега
  perching: () => {
    const first = !perchHintShown;
    perchHintShown = true;
    return [first ? 'Ворона садится на трубу — прыгай под стрелку!' : 'Ворона садится — прыгай!', true];
  },
  bossHit: () => [`Попал! Вороне осталось ${game.crow.hp}`, false],
  bossDown: () => ['Ворона уронила посылку — хватай!', true],
  missed: () => {
    const left = game.crow.perches.length - game.crow.perchIndex;
    const need = game.crow.hp;
    if (left < need) return ['Труб больше не хватит — ворона улетит', false];
    return [`Мимо! Труб впереди: ${left}, нужно попаданий: ${need}`, false];
  },
  shield: () => ['Каска спасла!', false],
};

game.onEvent = (name) => {
  sound.play(name);
  const hint = eventToasts[name]?.();
  if (hint) showToast(...hint);
};

// --- Итоги забега ---

const lossTexts = {
  crash: ['Бум!', 'Кот врезался в препятствие. Перепрыгни или обеги его.'],
  dog: ['Гав!', 'Собака напугала кота. Подожди, пока она пробежит, или перепрыгни.'],
  pigeon: ['Курлык!', 'Голубь спугнул кота. Голубя можно перепрыгнуть.'],
  trash: ['Шмяк!', 'Мусор упал коту на голову. Тень показывает, куда он упадёт, — отойди от неё.'],
  fall: ['Плюх!', 'Кот упал в провал. Перед ним нужно прыгать.'],
  escaped: ['Ворона улетела', 'Крыши кончились, а посылка всё ещё у вороны. Прыгай на неё, когда она садится на трубу.'],
};

// Рекорд — лучший счёт за забег на этом уровне, и победный, и проигранный
function updateRecord(state) {
  isNewRecord = false;
  const id = game.def.id;
  if ((state === 'won' || state === 'lost') && game.score > records[id]) {
    records[id] = game.score;
    isNewRecord = true;
    recordSaved = saveRecord(id, game.score);
  }
}

// Рыбки из законченного забега уходят в копилку; брошенный забег («Заново», «В меню») не считается.
// Победа открывает следующий уровень.
function payout(state) {
  earned = 0;
  unlockedNow = null;
  if (state !== 'won' && state !== 'lost') return;
  earned = game.fish + (state === 'won' ? WIN_BONUS : 0);
  profile.fish += earned;
  if (state === 'won') {
    if (!profile.completed.includes(game.def.id)) profile.completed.push(game.def.id);
    const next = nextLevel();
    if (next && !profile.unlocked.includes(next.id)) {
      profile.unlocked.push(next.id);
      unlockedNow = next;
    }
  }
  saveProfile(profile);
}

function fillResult(state) {
  let title;
  let text;
  if (state === 'won' && game.def.goal === 'boss') {
    title = 'Посылка спасена!';
    text = `Ворона повержена. Счёт: ${game.score}. Рыбок: ${game.fish} из ${game.level.fishTotal}. Время: ${game.elapsed.toFixed(1)} с.`;
  } else if (state === 'won') {
    title = 'Посылка доставлена!';
    text = `Счёт: ${game.score}. Рыбок: ${game.fish} из ${game.level.fishTotal}. Время: ${game.elapsed.toFixed(1)} с.`;
  } else if (game.lossReason === 'stamps') {
    title = 'Посылку не приняли';
    text = `Нужно ${STAMPS_NEEDED} марки, а у кота только ${game.stamps}. Марки лежат на ящиках и над ямой.`;
  } else {
    [title, text] = lossTexts[game.lossReason];
  }
  if (unlockedNow) text += ` Открыт уровень ${unlockedNow.number}: «${unlockedNow.name}»!`;
  $('resultTitle').textContent = title;
  $('resultText').textContent = text;

  // После победы главная кнопка ведёт на следующий уровень, если он есть
  const next = state === 'won' ? nextLevel() : null;
  const nextBtn = $('nextBtn');
  const againBtn = $('againBtn');
  nextBtn.hidden = !next;
  if (next) nextBtn.textContent = `Дальше: ${next.name}`;
  againBtn.textContent = state === 'won' ? 'Ещё раз' : 'Заново';
  againBtn.classList.toggle('btn--ghost', Boolean(next));

  const recordLine = $('resultRecord');
  if (isNewRecord) recordLine.textContent = recordSaved ? 'Новый рекорд!' : 'Новый рекорд! Но браузер не дал его сохранить.';
  else recordLine.textContent = `Рекорд: ${records[game.def.id]}`;
  recordLine.hidden = false;
  recordLine.classList.toggle('is-new', isNewRecord);

  const bonus = state === 'won' ? ` (с бонусом за победу ${WIN_BONUS})` : '';
  $('resultReward').textContent = `+${earned} 🐟 в копилку${bonus}, всего ${profile.fish}`;
}

game.onStateChange = (state) => {
  updateRecord(state);
  payout(state);
  renderBinds();

  if (state !== 'running') toast.hidden = true;
  if (state === 'running' && game.elapsed === 0) perchHintShown = false; // новый забег — подсказки заново

  if (!shopPanel.hidden) closeShop(false);
  if (state === 'ready') showScreen('menu');
  else if (state === 'paused') showScreen('pause');
  else if (state === 'won' || state === 'lost') {
    fillResult(state);
    showScreen('result');
  } else showScreen(null);

  pauseBtn.disabled = state !== 'running' && state !== 'paused';
  pauseBtn.textContent = state === 'paused' ? 'Продолжить' : 'Пауза';
  restartBtn.disabled = state === 'ready';
};

game.onHud = ({ score, stamps, distance, shields, maxShields, boss }) => {
  $('score').textContent = score;
  $('stamps').textContent = `${stamps}/${STAMPS_NEEDED}`;
  $('distance').textContent = distance;
  $('shields').textContent = shields;
  $('shieldsStat').hidden = maxShields === 0;
  // На улице считаем марки, на крышах — сердечки вороны
  $('stampsStat').hidden = Boolean(boss);
  $('bossStat').hidden = !boss;
  if (boss) $('bossHearts').textContent = '♥'.repeat(boss.hp) + '♡'.repeat(boss.max - boss.hp);
};

// --- Гардероб ---

const shop = new Shop(shopPanel, profile, () => {
  saveProfile(profile);
  game.applyProfile(profile);
  renderBinds();
});

function openShop() {
  if (game.state !== 'ready') game.toReady();
  showScreen(null);
  shopPanel.hidden = false;
  shop.render();
  game.setShowcase(true);
}

function closeShop(backToMenu = true) {
  shopPanel.hidden = true;
  game.setShowcase(false);
  if (backToMenu) showScreen('menu');
}

// --- Настройки ---

function toggleSound() {
  sound.setMuted(!sound.muted);
  saveMuted(sound.muted);
  renderBinds();
}

// Сброс в два нажатия: первое спрашивает «Точно?», второе сбрасывает
let resetTimer = null;

function disarmReset() {
  clearTimeout(resetTimer);
  resetTimer = null;
  resetBtn.textContent = 'Сбросить';
}

function resetProgress() {
  if (!resetTimer) {
    resetBtn.textContent = 'Точно?';
    resetTimer = setTimeout(disarmReset, 3000);
    return;
  }
  disarmReset();
  clearProgress();
  for (const id of Object.keys(records)) records[id] = 0;
  for (const key of Object.keys(profile)) delete profile[key];
  Object.assign(profile, defaultProfile());
  game.applyProfile(profile);
  game.loadLevel(STREET); // второй уровень снова закрыт
  renderBinds();
  resetBtn.textContent = 'Сброшено';
}

// --- Кнопки и клавиши ---

// Запуск уровня из любого состояния: из меню выбора и с экрана итогов («Дальше»)
function playLevel(def) {
  if (!def) return;
  game.loadLevel(def);
  renderBinds();
  game.restart();
}

const actions = {
  play: (keyboard) => {
    backTo = 'menu';
    showScreen('levels', keyboard);
  },
  level: (keyboard, btn) => playLevel(findLevel(btn.dataset.level)),
  next: () => playLevel(nextLevel()),
  resume: () => game.resume(),
  restart: () => game.restart(),
  menu: () => game.toReady(),
  shop: openShop,
  help: (keyboard) => {
    backTo = screen;
    showScreen('help', keyboard);
  },
  settings: (keyboard) => {
    backTo = screen;
    showScreen('settings', keyboard);
  },
  back: (keyboard) => showScreen(backTo, keyboard),
  sound: toggleSound,
  reset: resetProgress,
};

// Игру запускают — снимаем фокус с кнопки, иначе пробел для прыжка снова «нажмёт» её
const STARTS_GAME = ['level', 'next', 'resume', 'restart'];

overlay.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn || btn.disabled) return;
  const name = btn.dataset.action;
  actions[name](e.detail === 0, btn); // detail 0 — нажали Enter или пробел, а не мышью
  if (STARTS_GAME.includes(name)) document.activeElement?.blur();
});

const run = (action) => {
  action();
  document.activeElement?.blur();
};

$('shopClose').addEventListener('click', () => run(closeShop));
$('soundBtn').addEventListener('click', () => run(toggleSound));
pauseBtn.addEventListener('click', () => run(() => game.togglePause()));
restartBtn.addEventListener('click', () => run(() => game.restart()));
input.onMute = toggleSound;
input.onPause = () => {
  if (!shopPanel.hidden) closeShop();
  else if (['help', 'settings', 'levels'].includes(screen)) showScreen(backTo, true);
  else game.togglePause();
};

// Браузер включает звук только после первого действия игрока
const unlockSound = () => sound.unlock();
window.addEventListener('pointerdown', unlockSound);
window.addEventListener('keydown', unlockSound);

// Ушли со вкладки — пауза и сброс зажатых клавиш
document.addEventListener('visibilitychange', () => {
  if (document.hidden) game.pause();
  input.clear();
});

game.loadLevel(STREET);
game.applyProfile(profile);
game.onStateChange(game.state);
