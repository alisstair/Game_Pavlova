// localStorage может быть недоступен (приватный режим, запрет cookie, переполнение),
// поэтому каждое обращение в try/catch, а игра работает и без сохранения.
const RECORD_KEY = 'cat-courier:record'; // рекорд улицы — ключ остался с тех пор, когда уровень был один
const MUTED_KEY = 'cat-courier:muted';
const LEVEL_IDS = ['street', 'roofs'];

const recordKey = (levelId) => (levelId === 'street' ? RECORD_KEY : `${RECORD_KEY}:${levelId}`);

function read(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, String(value));
    return true;
  } catch {
    return false;
  }
}

export function loadRecord(levelId) {
  const value = Number.parseInt(read(recordKey(levelId)), 10);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function saveRecord(levelId, score) {
  return write(recordKey(levelId), score);
}

// Профиль: копилка рыбок, купленные вещи, что надето, уровни улучшений и открытые уровни игры
const PROFILE_KEY = 'cat-courier:profile';

export function defaultProfile() {
  return {
    fish: 0,
    furs: ['ginger'],
    hats: ['none'],
    fur: 'ginger',
    hat: 'none',
    upgrades: { magnet: 0, helmet: 0, agility: 0 },
    unlocked: ['street'],
    completed: [],
  };
}

// Данные из хранилища могли быть испорчены — берём только то, что похоже на правду
export function loadProfile() {
  const profile = defaultProfile();
  let saved = null;
  try {
    saved = JSON.parse(read(PROFILE_KEY));
  } catch {
    saved = null;
  }
  if (!saved || typeof saved !== 'object') return profile;

  if (Number.isFinite(saved.fish) && saved.fish > 0) profile.fish = Math.floor(saved.fish);
  for (const key of ['furs', 'hats', 'unlocked', 'completed']) {
    if (Array.isArray(saved[key])) profile[key] = [...new Set([...profile[key], ...saved[key].filter((id) => typeof id === 'string')])];
  }
  if (profile.furs.includes(saved.fur)) profile.fur = saved.fur;
  if (profile.hats.includes(saved.hat)) profile.hat = saved.hat;
  for (const id of Object.keys(profile.upgrades)) {
    const level = saved.upgrades?.[id];
    if (Number.isInteger(level) && level > 0) profile.upgrades[id] = level;
  }
  return profile;
}

export function saveProfile(profile) {
  return write(PROFILE_KEY, JSON.stringify(profile));
}

// Сброс из настроек: рекорд и профиль. Настройка звука остаётся.
export function clearProgress() {
  try {
    for (const id of LEVEL_IDS) localStorage.removeItem(recordKey(id));
    localStorage.removeItem(PROFILE_KEY);
  } catch {
    // нечего сбрасывать — хранилище недоступно
  }
}

export function loadMuted() {
  return read(MUTED_KEY) === '1';
}

export function saveMuted(muted) {
  write(MUTED_KEY, muted ? '1' : '0');
}
