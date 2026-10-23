import { FURS, HATS, UPGRADES } from './catalog.js';

const hex = (color) => `#${color.toString(16).padStart(6, '0')}`;

// Панель гардероба: окрасы, шляпы и улучшения. Кнопки создаются заново при каждой
// отрисовке, а клики ловит один обработчик на всю панель, поэтому ничего не дублируется.
export class Shop {
  constructor(root, profile, onChange) {
    this.root = root;
    this.profile = profile;
    this.onChange = onChange;
    this.wallet = root.querySelector('[data-shop="wallet"]');
    this.furs = root.querySelector('[data-shop="furs"]');
    this.hats = root.querySelector('[data-shop="hats"]');
    this.upgrades = root.querySelector('[data-shop="upgrades"]');

    root.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-buy]');
      if (!btn || btn.disabled) return;
      const [kind, id] = btn.dataset.buy.split(':');
      this.handle(kind, id);
    });
  }

  handle(kind, id) {
    const p = this.profile;
    if (kind === 'fur' || kind === 'hat') {
      const list = kind === 'fur' ? FURS : HATS;
      const owned = kind === 'fur' ? p.furs : p.hats;
      const item = list.find((x) => x.id === id);
      if (!owned.includes(id)) {
        if (p.fish < item.price) return;
        p.fish -= item.price;
        owned.push(id);
      }
      p[kind] = id; // купили — сразу надеваем
    } else {
      const upgrade = UPGRADES.find((u) => u.id === id);
      const level = p.upgrades[id];
      const price = upgrade.prices[level];
      if (price === undefined || p.fish < price) return;
      p.fish -= price;
      p.upgrades[id] = level + 1;
    }
    this.onChange(p);
    this.render();
  }

  render() {
    const p = this.profile;
    this.wallet.textContent = p.fish;

    this.furs.innerHTML = '';
    for (const fur of FURS) {
      const btn = this.itemButton('fur', fur, p.furs.includes(fur.id), p.fur === fur.id);
      const swatch = document.createElement('span');
      swatch.className = 'shop__swatch';
      swatch.style.background = `linear-gradient(135deg, ${hex(fur.fur)} 50%, ${hex(fur.accent === fur.fur ? fur.light : fur.accent)} 50%)`;
      btn.prepend(swatch);
      this.furs.append(btn);
    }

    this.hats.innerHTML = '';
    for (const hat of HATS) {
      const btn = this.itemButton('hat', hat, p.hats.includes(hat.id), p.hat === hat.id);
      const icon = document.createElement('span');
      icon.className = 'shop__icon';
      icon.textContent = hat.icon;
      icon.setAttribute('aria-hidden', 'true');
      btn.prepend(icon);
      this.hats.append(btn);
    }

    this.upgrades.innerHTML = '';
    for (const upgrade of UPGRADES) this.upgrades.append(this.upgradeRow(upgrade));
  }

  itemButton(kind, item, owned, equipped) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'shop__item';
    btn.dataset.buy = `${kind}:${item.id}`;
    btn.classList.toggle('is-equipped', equipped);
    btn.setAttribute('aria-pressed', String(equipped));

    const name = document.createElement('span');
    name.className = 'shop__name';
    name.textContent = item.name;
    const status = document.createElement('span');
    status.className = 'shop__price';
    if (equipped) status.textContent = 'надето';
    else if (owned) status.textContent = 'надеть';
    else {
      status.textContent = `${item.price} 🐟`;
      btn.disabled = this.profile.fish < item.price;
    }
    btn.append(name, status);
    return btn;
  }

  upgradeRow(upgrade) {
    const max = upgrade.prices.length;
    // Уровень из старого сохранения может оказаться больше нынешнего максимума
    const level = Math.min(this.profile.upgrades[upgrade.id], max);
    const row = document.createElement('div');
    row.className = 'shop__upgrade';

    const info = document.createElement('div');
    const title = document.createElement('p');
    title.className = 'shop__name';
    title.textContent = upgrade.name;
    const pips = document.createElement('span');
    pips.className = 'shop__pips';
    pips.setAttribute('aria-label', `Уровень ${level} из ${max}`);
    pips.textContent = '●'.repeat(level) + '○'.repeat(max - level);
    title.append(' ', pips);
    const text = document.createElement('p');
    text.className = 'shop__text';
    text.textContent = upgrade.text;
    info.append(title, text);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn--small';
    btn.dataset.buy = `upgrade:${upgrade.id}`;
    if (level >= max) {
      btn.textContent = 'Максимум';
      btn.disabled = true;
    } else {
      const price = upgrade.prices[level];
      btn.textContent = `${price} 🐟`;
      btn.disabled = this.profile.fish < price;
    }
    row.append(info, btn);
    return row;
  }
}
