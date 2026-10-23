// Всё, что покупается за рыбок. Цены подобраны так, что за удачный забег (~50 рыбок + бонус)
// можно купить одну-две вещи.
export const WIN_BONUS = 15;

// fur — тело и голова, light — живот и мордочка, accent — уши, лапы и хвост, eyes — глаза (если не тёмные)
export const FURS = [
  { id: 'ginger', name: 'Рыжий', price: 0, fur: 0xf2994a, light: 0xffd8b0, accent: 0xf2994a },
  { id: 'grey', name: 'Серый', price: 30, fur: 0x9aa3ad, light: 0xdde2e6, accent: 0x7d8790 },
  { id: 'black', name: 'Чёрный', price: 50, fur: 0x3a3a42, light: 0x6c6c76, accent: 0x2a2a30, eyes: 0xd9e35a },
  { id: 'siamese', name: 'Сиамский', price: 80, fur: 0xf3e3c8, light: 0xfff6e6, accent: 0x5a4032 },
  { id: 'pink', name: 'Зефирный', price: 120, fur: 0xf6a6c8, light: 0xfff0f6, accent: 0xe07aa8 },
];

export const HATS = [
  { id: 'none', name: 'Без шляпы', icon: '—', price: 0 },
  { id: 'bow', name: 'Бантик', icon: '🎀', price: 25 },
  { id: 'cap', name: 'Кепка курьера', icon: '🧢', price: 40 },
  { id: 'tophat', name: 'Цилиндр', icon: '🎩', price: 90 },
  { id: 'crown', name: 'Корона', icon: '👑', price: 150 },
];

// values[уровень] — значение улучшения, prices[уровень] — цена перехода на следующий
export const UPGRADES = [
  {
    id: 'magnet',
    name: 'Магнит',
    text: 'Рыбки сами летят к коту с соседних полос',
    prices: [60, 150],
    values: [0, 2.3, 5.2], // полосы через 2.5 м: 1-й уровень достаёт соседнюю, 2-й — все
  },
  {
    id: 'helmet',
    name: 'Каска',
    text: 'Спасает от удара или собаки — раз за забег',
    prices: [50, 120],
    values: [0, 1, 2],
  },
  {
    id: 'agility',
    name: 'Ловкость',
    text: 'Кот быстрее уходит вбок',
    prices: [25, 50, 90],
    values: [8, 9.5, 11, 12.5],
  },
];

export const findFur = (id) => FURS.find((f) => f.id === id) ?? FURS[0];
export const findHat = (id) => HATS.find((h) => h.id === id) ?? HATS[0];
export const upgradeValue = (id, level) => {
  const upgrade = UPGRADES.find((u) => u.id === id);
  return upgrade.values[Math.min(level, upgrade.values.length - 1)];
};
