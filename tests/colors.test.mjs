import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

// Use the project's TypeScript compiler so the test command also works on
// Node versions that do not support executing TypeScript directly.
async function loadModule(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}
const { clusters, detectBackground, mainColors, paletteMatch, pickNearby, hex, fromHex, highlightLayer, rectangleClusters, colorName } = await loadModule('../src/lib/colors.ts');
const { defaults, readSettings } = await loadModule('../src/lib/settings.ts');
const green = fromHex('#22aa55');
const red = fromHex('#ee2233');
const blue = fromHex('#2244ee');
const black = fromHex('#000000');
const white = fromHex('#ffffff');
function fixture(width = 40, height = 30, background = green) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set([background.r, background.g, background.b, 255], i);
  return { width, height, data };
}
function paint(image, x, y, width, height, color, alpha = 255) {
  for (let row = y; row < y + height; row++) for (let col = x; col < x + width; col++) image.data.set([color.r, color.g, color.b, alpha], (row * image.width + col) * 4);
}
function blend(foreground, background, coverage) {
  return Object.fromEntries(['r', 'g', 'b'].map(channel => [channel, Math.round(background[channel] + coverage * (foreground[channel] - background[channel]))]));
}

test('recognizes a green background without excluding black or grayscale lines', () => {
  const image = fixture();
  paint(image, 2, 2, 5, 5, red);
  paint(image, 10, 2, 5, 5, black);
  paint(image, 20, 2, 3, 3, fromHex('#888888'));
  assert.deepEqual(detectBackground(image), green);
  const colors = clusters(image, undefined, [green]).map(entry => hex(entry.color));
  assert.deepEqual(colors, ['#ee2233', '#000000', '#888888']);
});

test('detects white features on a dark background', () => {
  const image = fixture(40, 30, black);
  paint(image, 3, 3, 12, 3, white);
  paint(image, 20, 3, 5, 5, blue);
  assert.ok(mainColors(image, [black]).some(color => hex(color) === '#ffffff'));
});

test('main colors include colored lines alongside dominant gray labels', () => {
  const image = fixture(100, 100, white);
  paint(image, 0, 0, 40, 10, fromHex('#444444'));
  paint(image, 0, 10, 40, 10, fromHex('#888888'));
  paint(image, 0, 20, 40, 10, fromHex('#cccccc'));
  paint(image, 0, 40, 1, 60, red);
  const result = mainColors(image, [white, black], 3).map(hex);
  assert.ok(result.includes('#ee2233'));
  assert.ok(result.includes('#444444'));
});

test('snaps to a nearby thin line, respects radius, and supports exact sampling', () => {
  const image = fixture();
  paint(image, 10, 0, 1, 30, red);
  const picked = pickNearby(image, { x: 7, y: 10 }, 5, [green, black]);
  assert.deepEqual(picked.color, red);
  assert.deepEqual(picked.point, { x: 10, y: 10 });
  assert.deepEqual(pickNearby(image, { x: 7, y: 10 }, 2, [green, black]).color, green);
  assert.deepEqual(pickNearby(image, { x: 7, y: 10 }, 0, [green, black]).color, green);
  assert.deepEqual(pickNearby(image, { x: 10, y: 10 }, 5, [green, black]).color, red);
});

test('smart picking follows antialiased edges to the core on white, colored, and dark backgrounds', () => {
  for (const background of [white, green, black]) {
    const image = fixture(40, 30, background);
    paint(image, 10, 0, 1, 30, blend(red, background, 0.2));
    paint(image, 11, 0, 1, 30, blend(red, background, 0.6));
    paint(image, 12, 0, 1, 30, red);
    paint(image, 13, 0, 1, 30, blue);
    const before = image.data.slice();
    for (const x of [9, 10, 11, 12]) {
      const picked = pickNearby(image, { x, y: 15 }, 6, [background, black]);
      assert.deepEqual(picked.color, red, `Wrong core on ${hex(background)} at x=${x}`);
      assert.deepEqual(picked.point, { x: 12, y: 15 });
    }
    assert.deepEqual(pickNearby(image, { x: 10, y: 15 }, 0, [background, black]).color, blend(red, background, 0.2));
    assert.deepEqual(image.data, before);
  }
});

test('smart picking follows diagonal antialiased lines at the image boundary', () => {
  const image = fixture(20, 20, white);
  for (let y = 0; y < 18; y++) {
    paint(image, y, y, 1, 1, red);
    paint(image, y + 1, y, 1, 1, blend(red, white, 0.3));
  }
  assert.deepEqual(pickNearby(image, { x: 1, y: 0 }, 5, [white, black]).color, red);
});

test('smart picking stays on the nearby feature and rejects isolated high-contrast noise', () => {
  const pink = fromHex('#ff8080');
  const saturated = fromHex('#ff0000');
  const image = fixture(40, 30, white);
  paint(image, 10, 0, 1, 30, blend(pink, white, 0.4));
  paint(image, 11, 0, 1, 30, pink);
  paint(image, 11, 15, 1, 1, saturated);
  paint(image, 15, 0, 1, 30, saturated);
  assert.deepEqual(pickNearby(image, { x: 10, y: 15 }, 8, [white, black]).color, pink);
  assert.deepEqual(pickNearby(image, { x: 11, y: 10 }, 8, [white, black]).color, pink);
});

test('smart picking uses the strongest observed supported shade without inventing missing colors', () => {
  const image = fixture(40, 30, white);
  paint(image, 10, 0, 1, 30, blend(red, white, 0.2));
  paint(image, 11, 0, 1, 30, blend(red, white, 0.6));
  const actual = blend(red, white, 0.6);
  assert.deepEqual(pickNearby(image, { x: 10, y: 15 }, 5, [white, black]).color, actual);
  paint(image, 12, 0, 1, 30, red);
  assert.deepEqual(pickNearby(image, { x: 10, y: 15 }, 1, [white, black]).color, actual);
});

test('palette matching selects the closest entry independently of highlight tolerance and order', () => {
  const far = { id: 1, color: blue, range: 255 };
  const close = { id: 2, color: fromHex('#e62838'), range: 0 };
  const exact = { id: 3, color: red, range: 7 };
  assert.equal(paletteMatch([far, close, exact], red), exact);
  assert.equal(paletteMatch([exact, close, far], red), exact);
  assert.equal(paletteMatch([far, close], red), close);
  assert.equal(paletteMatch([far], red), undefined);
  assert.equal(paletteMatch([], red), undefined);
});

test('bulk extraction stays in its rectangle and includes black features', () => {
  const image = fixture();
  paint(image, 2, 2, 5, 5, red);
  paint(image, 9, 2, 5, 5, black);
  paint(image, 25, 2, 5, 5, blue);
  const region = { x: 0, y: 0, width: 20, height: 10 };
  assert.deepEqual(new Set(clusters(image, region, [green]).map(entry => hex(entry.color))), new Set(['#ee2233', '#000000']));
  assert.deepEqual(clusters(image, { x: 100, y: 100, width: 10, height: 10 }), []);
});

test('rectangle extraction merges antialiased edge bands into solid line colors', () => {
  for (const background of [white, green, black]) {
    const image = fixture(80, 60, background);
    for (const [start, color] of [[10, red], [30, blue]]) {
      for (const [offset, coverage] of [0.2, 0.45, 0.7, 1].entries()) {
        paint(image, start + offset, 10, 1, 40, blend(color, background, coverage));
      }
    }
    const region = { x: 0, y: 0, width: 80, height: 60 };
    const before = image.data.slice();
    assert.ok(clusters(image, region, [background]).length > 2);
    assert.deepEqual(new Set(rectangleClusters(image, region, [background]).map(entry => hex(entry.color))), new Set([hex(red), hex(blue)]));
    assert.deepEqual(image.data, before);
  }
});

test('rectangle extraction includes black cores shared by text and lines', () => {
  const image = fixture(80, 60, white);
  for (const [offset, coverage] of [0.25, 0.5, 0.75, 1].entries()) {
    paint(image, 10 + offset, 10, 1, 40, blend(black, white, coverage));
  }
  paint(image, 30, 10, 1, 40, red);
  const region = { x: 0, y: 0, width: 80, height: 60 };
  assert.deepEqual(new Set(rectangleClusters(image, region, [white]).map(entry => hex(entry.color))), new Set([hex(red), hex(black)]));
});

test('rectangle extraction preserves genuine pale fills and thin lines while removing isolated specks', () => {
  const image = fixture(80, 60, white);
  for (const [offset, coverage] of [0.2, 0.45, 0.7, 1].entries()) {
    paint(image, 10 + offset, 10, 1, 40, blend(red, white, coverage));
  }
  const pale = blend(red, white, 0.45);
  paint(image, 40, 10, 10, 10, pale);
  paint(image, 60, 10, 1, 40, blue);
  paint(image, 70, 10, 1, 1, fromHex('#ff00ff'));
  const colors = rectangleClusters(image, { x: 0, y: 0, width: 80, height: 60 }, [white]).map(entry => hex(entry.color));
  assert.deepEqual(new Set(colors), new Set([hex(red), hex(pale), hex(blue)]));
});

test('rectangle extraction stays within its bounds and retains observed shades if the core is outside', () => {
  const image = fixture(40, 30, white);
  paint(image, 10, 0, 1, 30, blend(red, white, 0.3));
  paint(image, 11, 0, 1, 30, blend(red, white, 0.6));
  paint(image, 12, 0, 1, 30, red);
  assert.deepEqual(rectangleClusters(image, { x: 10, y: 0, width: 2, height: 30 }, [white]).map(entry => hex(entry.color)), [hex(blend(red, white, 0.6))]);
  assert.deepEqual(rectangleClusters(image, { x: 100, y: 100, width: 2, height: 2 }, [white]), []);
  assert.deepEqual(rectangleClusters(image, { x: 0, y: 0, width: 5, height: 5 }, [white]), []);
  paint(image, 0, 0, 5, 5, red, 0);
  assert.deepEqual(rectangleClusters(image, { x: 0, y: 0, width: 5, height: 5 }, [white]), []);
});

test('rectangle extraction rejects repeated isolated noise but keeps small connected features', () => {
  const image = fixture(80, 60, white);
  for (let x = 5; x < 75; x += 5) paint(image, x, 5, 1, 1, fromHex('#ff00ff'));
  paint(image, 20, 20, 1, 8, red);
  paint(image, 40, 20, 2, 2, blue);
  const result = rectangleClusters(image, { x: 0, y: 0, width: 80, height: 60 }, [white]);
  assert.deepEqual(new Set(result.map(entry => hex(entry.color))), new Set([hex(red), hex(blue)]));
});

test('clusters similar shades and retains thin features in large images', () => {
  const image = fixture(1000, 400);
  paint(image, 1, 0, 1, 400, red);
  paint(image, 2, 0, 1, 400, fromHex('#ef2434'));
  const result = clusters(image, undefined, [green]);
  assert.equal(result.length, 1);
  assert.equal(result[0].count, 800);
});

test('transparent pixels do not become background or palette colors', () => {
  const image = fixture();
  paint(image, 0, 0, 35, 30, black, 0);
  assert.deepEqual(detectBackground(image), green);
  assert.equal(pickNearby(image, { x: 0, y: 0 }, 0, []), null);
  assert.equal(clusters(image).length, 1);
});

test('highlight ranges change matching without modifying the original pixels', () => {
  const image = fixture(11, 1, green);
  paint(image, 0, 0, 1, 1, red);
  paint(image, 3, 0, 1, 1, fromHex('#ee4444'));
  paint(image, 10, 0, 1, 1, red, 0);
  const before = image.data.slice();
  const narrow = highlightLayer(image, red, 0, green);
  const broad = highlightLayer(image, red, 50, green);
  assert.equal(narrow[3], 255);
  assert.equal(narrow[15], 0);
  assert.equal(broad[15], 255);
  assert.equal(broad[43], 0);
  assert.deepEqual(image.data, before);
  assert.deepEqual(highlightLayer(image, red, 255, green).slice(0, 24), before.slice(0, 24));
});

test('highlight has a rounded outline and a smoothly fading same-color halo', () => {
  const image = fixture(17, 17, white);
  paint(image, 8, 8, 1, 1, red);
  const output = highlightLayer(image, red, 0, white);
  const alpha = (dx, dy) => output[((8 + dy) * 17 + 8 + dx) * 4 + 3];
  assert.equal(alpha(0, 0), 255);
  assert.ok(alpha(1, 0) > alpha(1, 1), 'Corners should be softer than axial neighbors');
  for (let x = 0; x < 4; x++) assert.ok(alpha(x, 0) > alpha(x + 1, 0));
  assert.equal(alpha(5, 0), 0);
  assert.equal(alpha(1, 2), alpha(-2, -1), 'Outline should be rotationally symmetric');
  assert.deepEqual([...output.slice((8 * 17 + 9) * 4, (8 * 17 + 9) * 4 + 3)], [red.r, red.g, red.b]);
  assert.deepEqual(highlightLayer(image, red, 0, white), output, 'Repeated renders must not grow the highlight');
});

test('halo clips at image borders without wrapping into adjacent rows', () => {
  const image = fixture(12, 8, white);
  paint(image, 11, 0, 1, 1, red);
  const output = highlightLayer(image, red, 0, white);
  assert.ok(output[(1 * 12 + 11) * 4 + 3] > 0);
  for (let y = 0; y < 8; y++) assert.equal(output[(y * 12) * 4 + 3], 0);
  assert.equal(output[(7 * 12 + 11) * 4 + 3], 0);
});

test('transparent RGB does not seed dilation, while visible matches expand into transparency', () => {
  const image = fixture(7, 1, red);
  for (let i = 3; i < image.data.length; i += 4) image.data[i] = 0;
  assert.deepEqual([...highlightLayer(image, red, 0, white).filter((_, i) => i % 4 === 3)], Array(7).fill(0));
  paint(image, 3, 0, 1, 1, red, 128);
  const output = highlightLayer(image, red, 0, white);
  const alpha = [...output.filter((_, i) => i % 4 === 3)];
  assert.equal(alpha[3], 128);
  assert.ok(alpha[0] < alpha[1] && alpha[1] < alpha[2] && alpha[2] < alpha[3]);
  assert.deepEqual(alpha, [...alpha].reverse());
});

test('highlight layer leaves adjacent nonmatching lines uncovered and the source unchanged', () => {
  const image = fixture(5, 3, white);
  paint(image, 2, 1, 1, 1, red);
  paint(image, 3, 1, 1, 1, blue);
  const original = image.data.slice();
  const layer = highlightLayer(image, red, 0, white);
  assert.deepEqual([...layer.slice((1 * 5 + 3) * 4, (1 * 5 + 4) * 4)], [0, 0, 0, 0]);
  assert.ok(layer[(1 * 5 + 1) * 4 + 3] > 0, 'Outline can cover neighboring background');
  assert.deepEqual(image.data, original);
});

test('halo width stays consistent in CSS pixels at different display scales', () => {
  const image = fixture(33, 33, white);
  paint(image, 16, 16, 1, 1, red);
  const normal = highlightLayer(image, red, 0, white, 1);
  const hidpi = highlightLayer(image, red, 0, white, 2);
  for (let dx = 0; dx <= 5; dx++) {
    assert.equal(normal[(16 * 33 + 16 + dx) * 4 + 3], hidpi[(16 * 33 + 16 + dx * 2) * 4 + 3]);
  }
  assert.equal(hidpi[(20 * 33 + 19) * 4 + 3], hidpi[(16 * 33 + 21) * 4 + 3], 'Equal Euclidean distances have equal opacity');
});

test('multiple matches merge their halos without seams or extra opacity', () => {
  const first = fixture(20, 17, white);
  const second = fixture(20, 17, white);
  const both = fixture(20, 17, white);
  paint(first, 7, 6, 1, 1, red);
  paint(second, 11, 10, 1, 1, red);
  paint(both, 7, 6, 1, 1, red);
  paint(both, 11, 10, 1, 1, red);
  const a = highlightLayer(first, red, 0, white);
  const b = highlightLayer(second, red, 0, white);
  const combined = highlightLayer(both, red, 0, white);
  for (let i = 3; i < combined.length; i += 4) assert.equal(combined[i], Math.max(a[i], b[i]));
});

test('halo supports light lines on dark backgrounds and empty selections', () => {
  const image = fixture(12, 12, black);
  assert.ok(highlightLayer(image, white, 0, black).every(value => value === 0));
  paint(image, 6, 6, 1, 1, white);
  const layer = highlightLayer(image, white, 0, black);
  const offset = (6 * 12 + 7) * 4;
  assert.deepEqual([...layer.slice(offset, offset + 3)], [255, 255, 255]);
  assert.ok(layer[offset + 3] > 0 && layer[offset + 3] < 255);
});

test('outline fills adjacent antialiased edges without covering unrelated colors', () => {
  for (const background of [white, black, green]) {
    const image = fixture(12, 12, background);
    paint(image, 6, 6, 1, 1, red);
    paint(image, 5, 6, 1, 1, blend(red, background, 0.5));
    paint(image, 7, 6, 1, 1, blue);
    paint(image, 3, 6, 1, 1, blend(red, background, 0.5));
    const layer = highlightLayer(image, red, 0, background);
    assert.ok(layer[(6 * 12 + 5) * 4 + 3] > 0, 'Adjacent edge has no gap');
    assert.equal(layer[(6 * 12 + 7) * 4 + 3], 0, 'Unrelated blue stays uncovered');
    assert.equal(layer[(6 * 12 + 3) * 4 + 3], 0, 'A separate pale line stays uncovered');
  }
});

test('reports useful color names and exact hex values', () => {
  assert.equal(colorName(red), 'Red');
  assert.equal(colorName(white), 'White');
  assert.equal(colorName(black), 'Black');
  assert.equal(hex(fromHex('#12abef')), '#12abef');
});

test('settings preserve preferences and per-color ranges across save/load', () => {
  const settings = { ...defaults(2, true), scale: 1.5, backgroundAuto: false, background: '#22aa55', ranges: { '#ee2233': 61 } };
  assert.deepEqual(readSettings(JSON.stringify(settings), defaults()), settings);
  assert.equal(defaults(2).scale, 2);
});

test('older saved settings load while retired text-color preferences are ignored', () => {
  const settings = { ...defaults(2, true), ranges: { '#ee2233': 61 } };
  const legacy = { ...settings, text: '#000000', textAuto: true, excludeText: true };
  assert.deepEqual(readSettings(JSON.stringify(legacy), defaults()), settings);
});

test('corrupt or invalid settings cannot break color or scale calculations', () => {
  const fallback = defaults();
  assert.deepEqual(readSettings('{broken', fallback), fallback);
  assert.deepEqual(readSettings('null', fallback), fallback);
  const result = readSettings(JSON.stringify({ version: 1, scale: 0, background: 'invalid', dark: 'false', snapRadius: 999, ranges: { '#123456': -10, invalid: 30 } }), fallback);
  assert.equal(result.scale, 0.25);
  assert.equal(result.background, '#ffffff');
  assert.equal(result.dark, false);
  assert.equal(result.snapRadius, 32);
  assert.deepEqual(result.ranges, { '#123456': 0 });
});
