export interface Color { r: number; g: number; b: number }
export interface Point { x: number; y: number }
export interface Region { x: number; y: number; width: number; height: number }
export interface Pixels { data: Uint8ClampedArray; width: number; height: number }
export interface Cluster { color: Color; count: number }

export const hex = (c: Color): string => '#' + [c.r, c.g, c.b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
export const fromHex = (value: string): Color => ({ r: parseInt(value.slice(1, 3), 16), g: parseInt(value.slice(3, 5), 16), b: parseInt(value.slice(5, 7), 16) });
export const distance = (a: Color, b: Color): number => Math.sqrt(((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2) / 3);
export const similar = (a: Color, b: Color, range = 20): boolean => distance(a, b) <= range;

export function paletteMatch<T extends { color: Color }>(items: T[], color: Color): T | undefined {
  let best: T | undefined;
  let closest = 12;
  for (const item of items) {
    const difference = distance(item.color, color);
    if (difference <= closest && (!best || difference < closest)) {
      best = item;
      closest = difference;
    }
  }
  return best;
}

export function pixel(image: Pixels, x: number, y: number): Color | null {
  x = Math.floor(x); y = Math.floor(y);
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return null;
  const i = (y * image.width + x) * 4;
  if (image.data[i + 3] < 128) return null;
  return { r: image.data[i], g: image.data[i + 1], b: image.data[i + 2] };
}

// A bounded histogram groups compression/antialiasing variations without
// excluding grayscale or assuming that the background is white.
export function clusters(image: Pixels, region?: Region, excluded: Color[] = [], range = 20): Cluster[] {
  const area = region ?? { x: 0, y: 0, width: image.width, height: image.height };
  const x0 = Math.max(0, Math.floor(area.x));
  const y0 = Math.max(0, Math.floor(area.y));
  const x1 = Math.min(image.width, Math.ceil(area.x + area.width));
  const y1 = Math.min(image.height, Math.ceil(area.y + area.height));
  const width = x1 - x0; const height = y1 - y0;
  if (width <= 0 || height <= 0) return [];
  const bins = new Map<number, { r: number; g: number; b: number; count: number }>();
  for (let p = 0; p < width * height; p++) {
    const c = pixel(image, x0 + p % width, y0 + Math.floor(p / width));
    if (!c || excluded.some(other => similar(c, other, range))) continue;
    const key = (c.r >> 4) * 256 + (c.g >> 4) * 16 + (c.b >> 4);
    const bin = bins.get(key) ?? { r: 0, g: 0, b: 0, count: 0 };
    bin.r += c.r; bin.g += c.g; bin.b += c.b; bin.count++;
    bins.set(key, bin);
  }
  const result: Cluster[] = [];
  for (const bin of [...bins.values()].sort((a, b) => b.count - a.count)) {
    const color = { r: Math.round(bin.r / bin.count), g: Math.round(bin.g / bin.count), b: Math.round(bin.b / bin.count) };
    const match = result.find(entry => similar(entry.color, color, range));
    if (match) match.count += bin.count;
    else result.push({ color, count: bin.count });
  }
  return result.sort((a, b) => b.count - a.count);
}

export function detectBackground(image: Pixels): Color {
  return clusters(image)[0]?.color ?? { r: 255, g: 255, b: 255 };
}

export function rectangleClusters(image: Pixels, region: Region, excluded: Color[]): Cluster[] {
  const background = excluded[0];
  if (!background) return clusters(image, region, excluded);
  const x0 = Math.max(0, Math.floor(region.x));
  const y0 = Math.max(0, Math.floor(region.y));
  const width = Math.min(image.width, Math.ceil(region.x + region.width)) - x0;
  const height = Math.min(image.height, Math.ceil(region.y + region.height)) - y0;
  if (width <= 0 || height <= 0) return [];

  type Bin = { color: Color; count: number; flat: number; supported: number; strength: number; neighbors: Map<number, number> };
  const labels = new Int16Array(width * height).fill(-1);
  const bins = new Map<number, Bin>();
  for (let p = 0; p < labels.length; p++) {
    const color = pixel(image, x0 + p % width, y0 + Math.floor(p / width));
    if (!color) continue;
    const key = (color.r >> 4) * 256 + (color.g >> 4) * 16 + (color.b >> 4);
    const bin = bins.get(key) ?? { color: { r: 0, g: 0, b: 0 }, count: 0, flat: 0, supported: 0, strength: 0, neighbors: new Map() };
    bin.color.r += color.r; bin.color.g += color.g; bin.color.b += color.b;
    bin.count++;
    bins.set(key, bin); labels[p] = key;
  }
  for (const bin of bins.values()) {
    bin.color = { r: Math.round(bin.color.r / bin.count), g: Math.round(bin.color.g / bin.count), b: Math.round(bin.color.b / bin.count) };
    bin.strength = distance(bin.color, background);
  }

  const blendCache = new Map<number, boolean>();
  const isEdgeOf = (edgeId: number, coreId: number): boolean => {
    const key = edgeId * 4096 + coreId;
    const cached = blendCache.get(key);
    if (cached !== undefined) return cached;
    const edge = bins.get(edgeId)!; const core = bins.get(coreId)!;
    let blended = false;
    if (core.count >= 2 && core.strength > edge.strength + 8) {
      const direction = { r: core.color.r - background.r, g: core.color.g - background.g, b: core.color.b - background.b };
      const delta = { r: edge.color.r - background.r, g: edge.color.g - background.g, b: edge.color.b - background.b };
      const coverage = (delta.r * direction.r + delta.g * direction.g + delta.b * direction.b) / (direction.r ** 2 + direction.g ** 2 + direction.b ** 2);
      const residual = Math.sqrt(((delta.r - coverage * direction.r) ** 2 + (delta.g - coverage * direction.g) ** 2 + (delta.b - coverage * direction.b) ** 2) / 3);
      blended = coverage > 0 && coverage < 1 && residual <= Math.max(4, edge.strength * 0.08);
    }
    blendCache.set(key, blended);
    return blended;
  };

  // Gather local evidence before merging: a broad uniform patch is a real
  // color, while a narrow edge usually touches a stronger shade of its line.
  for (let p = 0; p < labels.length; p++) {
    const key = labels[p];
    const bin = bins.get(key);
    if (!bin || bin.strength <= 20) continue;
    const x = p % width; const y = Math.floor(p / width);
    let flat = true;
    let supported = false;
    const neighbors = new Set<number>();
    for (let row = y - 1; row <= y + 1; row++) {
      for (let col = x - 1; col <= x + 1; col++) {
        if (row === y && col === x) continue;
        if (row < 0 || row >= height || col < 0 || col >= width) { flat = false; continue; }
        const other = labels[row * width + col];
        if (other === key) { supported = true; continue; }
        const neighbor = bins.get(other);
        if (!neighbor) { flat = false; continue; }
        if (similar(bin.color, neighbor.color, 12)) supported = true;
        if (!similar(bin.color, neighbor.color, 8)) flat = false;
        if (isEdgeOf(key, other)) neighbors.add(other);
      }
    }
    if (flat) bin.flat++;
    if (supported) bin.supported++;
    for (const neighbor of neighbors) bin.neighbors.set(neighbor, (bin.neighbors.get(neighbor) ?? 0) + 1);
  }

  const parent = new Map<number, number>();
  for (const [key, bin] of bins) {
    if (bin.flat >= bin.count * 0.2) continue;
    let strongest = bin.strength;
    for (const [neighbor, support] of bin.neighbors) {
      const core = bins.get(neighbor)!;
      const strength = core.strength;
      if (core.supported >= Math.max(2, core.count * 0.5) && support >= bin.count * 0.15 && strength > strongest) {
        parent.set(key, neighbor); strongest = strength;
      }
    }
  }
  const roots = new Map<number, Cluster>();
  for (const [key, bin] of bins) {
    let root = key;
    // Every link increases contrast, so chains terminate without cycles.
    while (parent.has(root)) root = parent.get(root)!;
    const entry = roots.get(root) ?? { color: bins.get(root)!.color, count: 0 };
    entry.count += bin.count; roots.set(root, entry);
  }
  const result: Cluster[] = [];
  // A repeated color can still be scattered compression noise. Its original
  // core samples must have similar adjacent pixels, not just a large count.
  const reliable = [...roots.entries()].filter(([key]) => {
    const bin = bins.get(key)!;
    return bin.supported >= Math.max(2, bin.count * 0.5);
  }).map(([, entry]) => entry);
  for (const entry of reliable.sort((a, b) => b.count - a.count)) {
    if (entry.count < 2 || excluded.some(color => similar(entry.color, color))) continue;
    const match = result.find(other => similar(other.color, entry.color));
    if (match) match.count += entry.count;
    else result.push(entry);
  }
  return result;
}

export function mainColors(image: Pixels, excluded: Color[], limit = 8): Color[] {
  // Give colored series a chance alongside common antialiased gray labels.
  // Grayscale remains eligible, and rectangle extraction keeps every cluster.
  const score = ({ color, count }: Cluster) => count * (0.1 + (Math.max(color.r, color.g, color.b) - Math.min(color.r, color.g, color.b)) / 255);
  return clusters(image, undefined, excluded).sort((a, b) => score(b) - score(a)).slice(0, limit).map(entry => entry.color);
}

export function detectText(image: Pixels, background: Color): Color {
  const candidates = clusters(image, undefined, [background]);
  // Prefer common neutral colors with strong contrast. Users can override this
  // heuristic for colored text or images without any text.
  const ranked = candidates.map(entry => {
    const c = entry.color;
    const neutrality = 1 - (Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b)) / 255;
    return { ...entry, score: Math.log2(entry.count + 1) * distance(c, background) * (0.2 + neutrality) };
  }).sort((a, b) => b.score - a.score);
  return ranked[0]?.color ?? { r: 0, g: 0, b: 0 };
}

export function pickNearby(image: Pixels, point: Point, radius: number, excluded: Color[]): { color: Color; point: Point } | null {
  const direct = pixel(image, point.x, point.y);
  if (radius <= 0) return direct ? { color: direct, point } : null;
  const foreground = (c: Color | null): c is Color => !!c && !excluded.some(other => similar(c, other));
  type Sample = { color: Color; point: Point; distance: number };
  const samples = new Map<number, Sample>();
  let anchor: Sample | null = null;
  let bestDistance = Infinity;
  for (let y = Math.max(0, Math.floor(point.y - radius)); y <= Math.min(image.height - 1, point.y + radius); y++) {
    for (let x = Math.max(0, Math.floor(point.x - radius)); x <= Math.min(image.width - 1, point.x + radius); x++) {
      const d = (x - point.x) ** 2 + (y - point.y) ** 2;
      if (d > radius ** 2) continue;
      const c = pixel(image, x, y);
      if (!foreground(c)) continue;
      const sample = { color: c, point: { x, y }, distance: d };
      samples.set(y * image.width + x, sample);
      if (d < bestDistance) { anchor = sample; bestDistance = d; }
    }
  }
  if (!anchor) return direct ? { color: direct, point } : null;
  const background = excluded[0];
  if (!background) return { color: anchor.color, point: anchor.point };

  // Edge = background + coverage * (line - background). Blends of the same
  // line lie along the same RGB direction away from the background. Follow
  // that direction, allowing small rounding/compression errors, rather than
  // simply choosing the darkest or most saturated pixel in the search area.
  const direction = { r: anchor.color.r - background.r, g: anchor.color.g - background.g, b: anchor.color.b - background.b };
  const lengthSquared = direction.r ** 2 + direction.g ** 2 + direction.b ** 2;
  const sameFamily = (c: Color): boolean => {
    const delta = { r: c.r - background.r, g: c.g - background.g, b: c.b - background.b };
    const coverage = (delta.r * direction.r + delta.g * direction.g + delta.b * direction.b) / lengthSquared;
    if (coverage <= 0) return false;
    const residual = Math.sqrt(((delta.r - coverage * direction.r) ** 2 + (delta.g - coverage * direction.g) ** 2 + (delta.b - coverage * direction.b) ** 2) / 3);
    return residual <= Math.max(4, distance(c, background) * 0.1);
  };

  // Stay on the anchor's connected feature. Require a similar neighbor so an
  // isolated high-contrast noise pixel cannot beat a supported line core.
  const queue = [anchor];
  const visited = new Set([anchor.point.y * image.width + anchor.point.x]);
  let best: Sample | null = null;
  let bestStrength = -1;
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const sample = queue[cursor];
    let supported = false;
    for (let y = Math.max(0, sample.point.y - 1); y <= Math.min(image.height - 1, sample.point.y + 1); y++) {
      for (let x = Math.max(0, sample.point.x - 1); x <= Math.min(image.width - 1, sample.point.x + 1); x++) {
        if (x === sample.point.x && y === sample.point.y) continue;
        const key = y * image.width + x;
        const neighbor = samples.get(key);
        // A neighbor just outside the search circle may confirm support, but
        // cannot itself be selected or extend the connected search.
        const neighborColor = neighbor?.color ?? pixel(image, x, y);
        if (!foreground(neighborColor) || !sameFamily(neighborColor)) continue;
        if (similar(sample.color, neighborColor, 12)) supported = true;
        if (neighbor && !visited.has(key)) { visited.add(key); queue.push(neighbor); }
      }
    }
    const strength = distance(sample.color, background);
    if (supported && (strength > bestStrength || (strength === bestStrength && sample.distance < (best?.distance ?? Infinity)))) {
      best = sample; bestStrength = strength;
    }
  }
  const result = best ?? anchor;
  return { color: result.color, point: result.point };
}

export function highlight(image: Pixels, color: Color, range: number): Uint8ClampedArray {
  const output = new Uint8ClampedArray(image.data);
  const mask = new Uint8Array(image.width * image.height);
  for (let p = 0; p < mask.length; p++) {
    const i = p * 4;
    const c = { r: image.data[i], g: image.data[i + 1], b: image.data[i + 2] };
    if (similar(c, color, range)) mask[p] = image.data[i + 3];
  }

  // Dilate the original match mask with a 3 × 3 max filter. Keeping the mask
  // separate prevents newly painted pixels from expanding the highlight again.
  for (let i = 0; i < output.length; i += 4) {
    const p = i / 4;
    if (mask[p]) continue;
    const x = p % image.width;
    const y = Math.floor(p / image.width);
    let alpha = 0;
    for (let row = Math.max(0, y - 1); row <= Math.min(image.height - 1, y + 1); row++) {
      for (let col = Math.max(0, x - 1); col <= Math.min(image.width - 1, x + 1); col++) {
        alpha = Math.max(alpha, mask[row * image.width + col]);
      }
    }
    if (alpha) {
      output[i] = color.r;
      output[i + 1] = color.g;
      output[i + 2] = color.b;
      output[i + 3] = alpha;
      continue;
    }
    const c = { r: image.data[i], g: image.data[i + 1], b: image.data[i + 2] };
    const gray = Math.round(0.299 * c.r + 0.587 * c.g + 0.114 * c.b);
    output[i] = output[i + 1] = output[i + 2] = gray;
    output[i + 3] = Math.round(image.data[i + 3] * 0.22);
  }
  return output;
}

export function colorName(c: Color): string {
  const max = Math.max(c.r, c.g, c.b); const min = Math.min(c.r, c.g, c.b);
  const lightness = (max + min) / 510;
  if (max - min < 18) return lightness < 0.12 ? 'Black' : lightness > 0.92 ? 'White' : lightness < 0.35 ? 'Dark gray' : lightness > 0.72 ? 'Light gray' : 'Gray';
  const d = max - min;
  let hue = max === c.r ? (c.g - c.b) / d : max === c.g ? 2 + (c.b - c.r) / d : 4 + (c.r - c.g) / d;
  hue = (hue * 60 + 360) % 360;
  const name = hue < 15 || hue >= 345 ? 'Red' : hue < 45 ? 'Orange' : hue < 65 ? 'Yellow' : hue < 165 ? 'Green' : hue < 195 ? 'Cyan' : hue < 255 ? 'Blue' : hue < 285 ? 'Purple' : hue < 325 ? 'Magenta' : 'Pink';
  if (name === 'Orange' && lightness < 0.45) return 'Brown';
  return lightness < 0.3 ? `Dark ${name.toLowerCase()}` : lightness > 0.72 ? `Light ${name.toLowerCase()}` : name;
}
