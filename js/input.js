// Клавиатура и экранные кнопки. Обработчики вешаются один раз при создании.
const LEFT_KEYS = ['ArrowLeft', 'KeyA'];
const RIGHT_KEYS = ['ArrowRight', 'KeyD'];
const JUMP_KEYS = ['Space', 'KeyW', 'ArrowUp'];
const SLOW_KEYS = ['KeyS', 'ArrowDown'];
const PAUSE_KEYS = ['KeyP', 'Escape'];
const MUTE_KEYS = ['KeyM'];
const GAME_KEYS = [...LEFT_KEYS, ...RIGHT_KEYS, ...JUMP_KEYS, ...SLOW_KEYS];

export class Input {
  constructor(touchRoot) {
    this.keys = new Set();
    this.touch = { left: false, right: false, slow: false };
    this.jumpQueued = false;
    // Пока игра идёт, игровые клавиши не прокручивают страницу и не нажимают кнопки
    this.active = false;
    this.onPause = null;
    this.onMute = null;

    window.addEventListener('keydown', (e) => this.handleKeyDown(e));
    window.addEventListener('keyup', (e) => this.handleKeyUp(e));
    window.addEventListener('blur', () => this.clear());

    if (touchRoot) this.bindTouch(touchRoot);
  }

  handleKeyDown(e) {
    if (PAUSE_KEYS.includes(e.code)) {
      if (this.onPause) this.onPause();
      return;
    }
    if (MUTE_KEYS.includes(e.code)) {
      if (this.onMute && !e.repeat) this.onMute();
      return;
    }
    if (!GAME_KEYS.includes(e.code)) return;
    if (this.active) e.preventDefault();
    if (JUMP_KEYS.includes(e.code) && !e.repeat) this.jumpQueued = true;
    this.keys.add(e.code);
  }

  handleKeyUp(e) {
    if (!GAME_KEYS.includes(e.code)) return;
    if (this.active) e.preventDefault();
    this.keys.delete(e.code);
  }

  bindTouch(root) {
    root.querySelectorAll('[data-control]').forEach((btn) => {
      const control = btn.dataset.control;

      const press = (e) => {
        e.preventDefault();
        btn.setPointerCapture(e.pointerId);
        btn.classList.add('is-pressed');
        if (control === 'jump') this.jumpQueued = true;
        else this.touch[control] = true;
      };
      const release = () => {
        btn.classList.remove('is-pressed');
        if (control !== 'jump') this.touch[control] = false;
      };

      btn.addEventListener('pointerdown', press);
      btn.addEventListener('pointerup', release);
      btn.addEventListener('pointercancel', release);
      btn.addEventListener('lostpointercapture', release);
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
    });
  }

  // -1 — влево, 1 — вправо, 0 — стоим по центру своей позиции
  get direction() {
    const left = this.touch.left || LEFT_KEYS.some((k) => this.keys.has(k));
    const right = this.touch.right || RIGHT_KEYS.some((k) => this.keys.has(k));
    return (right ? 1 : 0) - (left ? 1 : 0);
  }

  // Пока зажато — кот притормаживает
  get slow() {
    return this.touch.slow || SLOW_KEYS.some((k) => this.keys.has(k));
  }

  // Прыжок срабатывает один раз на нажатие, удержание не прыгает повторно
  consumeJump() {
    const queued = this.jumpQueued;
    this.jumpQueued = false;
    return queued;
  }

  clear() {
    this.keys.clear();
    this.touch.left = false;
    this.touch.right = false;
    this.touch.slow = false;
    this.jumpQueued = false;
    document.querySelectorAll('.is-pressed').forEach((el) => el.classList.remove('is-pressed'));
  }
}
