// Столкновения прямоугольных коробок (AABB). Y — низ коробки, как у кота: он стоит ногами на y.
const EPS = 0.001;
const STEP_UP = 0.3; // если кот чуть ниже верха ящика, он запрыгивает на него, а не врезается

export function box(x, y, z, width, height, depth) {
  return {
    minX: x - width / 2,
    maxX: x + width / 2,
    minY: y,
    maxY: y + height,
    minZ: z - depth / 2,
    maxZ: z + depth / 2,
  };
}

export function intersects(a, b) {
  return (
    a.minX < b.maxX && a.maxX > b.minX &&
    a.minY < b.maxY && a.maxY > b.minY &&
    a.minZ < b.maxZ && a.maxZ > b.minZ
  );
}

export function playerBox(p, shrink = 0) {
  return {
    minX: p.x - p.halfWidth + shrink,
    maxX: p.x + p.halfWidth - shrink,
    minY: p.y + shrink,
    maxY: p.y + p.height - shrink,
    minZ: p.z - p.halfDepth + shrink,
    maxZ: p.z + p.halfDepth - shrink,
  };
}

// Сверху и снизу. Сравниваем с прежним y, чтобы при большом шаге кот не проскочил сквозь ящик.
export function resolveVertical(p, prevY, world) {
  p.onGround = false;

  for (const s of world.solids) {
    if (!intersects(playerBox(p), s)) continue;
    if (p.vy <= 0 && prevY >= s.maxY - EPS) {
      p.y = s.maxY;
      p.vy = 0;
      p.onGround = true;
    } else if (p.vy > 0 && prevY + p.height <= s.minY + EPS) {
      p.y = s.minY - p.height;
      p.vy = 0;
    }
  }

  // Земля есть везде, кроме ям. Кто уже провалился ниже дороги, обратно не выскакивает.
  if (!p.onGround && p.y <= 0 && prevY >= 0 && !world.isOverGap(p.z)) {
    p.y = 0;
    p.vy = 0;
    p.onGround = true;
  }
}

// Сбоку: ящик или фургон просто не пускает кота в свою полосу
export function resolveSide(p, prevX, world) {
  for (const s of world.solids) {
    if (!intersects(playerBox(p), s)) continue;
    if (prevX + p.halfWidth <= s.minX + EPS) p.x = s.minX - p.halfWidth - EPS;
    else if (prevX - p.halfWidth >= s.maxX - EPS) p.x = s.maxX + p.halfWidth + EPS;
  }
}

// Спереди: кот бежит к -z. Возвращает true, если он врезался.
export function resolveForward(p, prevZ, world) {
  for (const s of world.solids) {
    if (!intersects(playerBox(p), s)) continue;
    if (prevZ - p.halfDepth < s.maxZ - EPS) continue;
    if (p.y >= s.maxY - STEP_UP) {
      p.y = s.maxY;
      p.vy = 0;
      p.onGround = true;
    } else {
      p.z = s.maxZ + p.halfDepth;
      return true;
    }
  }
  return false;
}
