// Описания уровней. d (at/from/to) — сколько метров от старта, в сцене это z = -d.
// x — смещение вбок от середины (-3.3…3.3); у улицы вместо x можно указать полосу lane: L / C / R.

const CRATE_TOP = 1;
const VAN_TOP = 1.9;

export const STREET = {
  id: 'street',
  number: 1,
  name: 'Улица',
  intro: 'Довези посылку до дома, собери 3 марки и не врежься.',
  theme: 'street',
  goal: 'house', // финиш — дом в конце улицы
  length: 400,
  sky: 0xbfe3f2,
  layout: [
    { type: 'fish', lane: 'C', from: 15, count: 6 },

    { type: 'barrier', lanes: ['L', 'C'], at: 45 },
    { type: 'arc', lane: 'C', at: 45 },
    { type: 'fish', lane: 'R', from: 38, count: 4 },
    { type: 'fish', lane: 'R', from: 58, count: 5 },

    { type: 'crates', lanes: ['R'], from: 75, to: 83 },
    { type: 'fish', lane: 'R', from: 76, count: 2, y: CRATE_TOP + 0.6 },
    { type: 'stamp', lane: 'R', at: 81, y: CRATE_TOP + 0.6 },
    { type: 'fish', lane: 'C', from: 72, count: 5 },

    { type: 'walker', kind: 'dog', at: 100, speed: 2.5 },
    { type: 'fish', lane: 'L', from: 92, count: 4 },

    { type: 'gap', from: 118, to: 121 },
    { type: 'arc', lane: 'C', at: 119.5 },
    { type: 'fish', lane: 'L', from: 128, count: 4 },

    // Паркур: с ящиков на крышу фургона, там бонусные рыбки
    { type: 'crates', lanes: ['L'], from: 140, to: 146 },
    { type: 'van', lane: 'L', from: 149, to: 155 },
    { type: 'fish', lane: 'L', from: 150, count: 3, step: 2, y: VAN_TOP + 0.6 },
    { type: 'fish', lane: 'R', from: 140, count: 6 },

    { type: 'barrier', lanes: ['L'], at: 170 },
    { type: 'barrier', lanes: ['R'], at: 170 },
    { type: 'fish', lane: 'C', from: 160, count: 6 },

    { type: 'gap', from: 188, to: 191 },
    { type: 'stamp', lane: 'C', at: 189.5, y: CRATE_TOP + 0.6 },
    { type: 'fish', lane: 'L', from: 196, count: 4 },

    { type: 'walker', kind: 'dog', at: 212, speed: 3.5 },

    { type: 'van', lane: 'C', from: 228, to: 233 },
    { type: 'van', lane: 'R', from: 230, to: 235 },
    { type: 'fish', lane: 'L', from: 224, count: 5 },

    { type: 'crates', lanes: ['L', 'C', 'R'], from: 252, to: 260 },
    { type: 'fish', lane: 'C', from: 253, count: 3, y: CRATE_TOP + 0.6 },

    { type: 'gap', from: 276, to: 279 },
    { type: 'arc', lane: 'L', at: 277.5 },
    { type: 'arc', lane: 'R', at: 277.5 },

    { type: 'walker', kind: 'dog', at: 295, speed: 3 },

    { type: 'crates', lanes: ['L'], from: 312, to: 320 },
    { type: 'stamp', lane: 'L', at: 317, y: CRATE_TOP + 0.6 },
    { type: 'van', lane: 'C', from: 313, to: 319 },
    { type: 'barrier', lanes: ['R'], at: 316 },
    { type: 'fish', lane: 'R', from: 325, count: 4 },

    { type: 'barrier', lanes: ['C', 'R'], at: 340 },
    { type: 'fish', lane: 'L', from: 334, count: 5 },

    { type: 'walker', kind: 'dog', at: 356, speed: 3 },

    { type: 'fish', lane: 'C', from: 372, count: 8 },
  ],
};

export const ROOFS = {
  id: 'roofs',
  number: 2,
  name: 'Крыши',
  intro: 'Ворона утащила посылку! Догони её по крышам: когда она сядет на трубу — прыгай на неё.',
  theme: 'roofs',
  goal: 'boss', // финиш — отобрать посылку у вороны
  length: 530, // если добежать до конца крыш, а ворона цела, — она улетела
  sky: 0xf6c9a8,
  boss: {
    hp: 3,
    appearAt: 175, // где ворона вылетает навстречу
  },
  layout: [
    // Часть 1: разминка по крышам
    { type: 'fish', x: 0, from: 10, count: 5 },
    { type: 'gap', from: 30, to: 33 },
    { type: 'arc', x: 0, at: 31.5 },

    { type: 'chimney', x: -2, at: 45 },
    { type: 'chimney', x: 2, at: 52 },
    { type: 'fish', x: 2, from: 40, count: 3, step: 2 },
    { type: 'fish', x: -2, from: 50, count: 3, step: 2 },

    { type: 'vent', x: 0, width: 4.5, at: 63 },
    { type: 'arc', x: 0, at: 63 },

    { type: 'gap', from: 75, to: 79 },
    { type: 'fish', x: -2.5, from: 82, count: 4 },

    { type: 'antenna', x: -0.8, at: 92 },
    { type: 'antenna', x: 1.6, at: 98 },
    { type: 'fish', x: 2.8, from: 88, count: 5, step: 2.5 },

    { type: 'walker', kind: 'pigeon', at: 110, speed: 1.6 },
    { type: 'fish', x: 0, from: 104, count: 4 },

    { type: 'gap', from: 122, to: 125 },
    { type: 'arc', x: -1.5, at: 123.5 },

    { type: 'crates', x: -2.3, from: 134, to: 142 },
    { type: 'fish', x: -2.3, from: 135, count: 3, step: 2.5, y: CRATE_TOP + 0.6 },
    { type: 'chimney', x: 2.3, at: 139 },

    { type: 'vent', x: 1.2, width: 3.5, at: 153 },
    { type: 'walker', kind: 'pigeon', at: 160, speed: 2.2 },

    { type: 'gap', from: 170, to: 173 },
    { type: 'arc', x: 0, at: 171.5 },

    // Часть 2: погоня за вороной. На трубы-насесты она садится передохнуть.
    // Трубы через ~65 м: между ними ворона успевает погоняться и побросать мусор
    { type: 'fish', x: 0, from: 185, count: 5 },
    { type: 'perch', x: 0, at: 240 },
    { type: 'fish', x: -2.5, from: 250, count: 4 },
    { type: 'gap', from: 270, to: 273 },
    { type: 'perch', x: -1.8, at: 305 },
    { type: 'fish', x: 2.5, from: 315, count: 4 },
    { type: 'gap', from: 335, to: 338 },
    { type: 'perch', x: 1.8, at: 370 },
    { type: 'fish', x: 0, from: 380, count: 4 },
    { type: 'gap', from: 400, to: 404 },
    { type: 'perch', x: 0, at: 435 },
    { type: 'fish', x: -2.5, from: 445, count: 4 },
    { type: 'gap', from: 462, to: 465 },
    { type: 'perch', x: -1.5, at: 495 },
    { type: 'fish', x: 1.5, from: 503, count: 6 },
  ],
};

export const LEVELS = [STREET, ROOFS];

export const findLevel = (id) => LEVELS.find((level) => level.id === id) ?? STREET;
