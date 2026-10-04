<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue';
import draggable from 'vuedraggable';
import { colorName, detectBackground, detectText, fromHex, hex, highlight, mainColors, paletteMatch, pickNearby, pixel, rectangleClusters, similar } from '../lib/colors';
import type { Color, Point, Region } from '../lib/colors';
import { defaults, readSettings, settingsKey } from '../lib/settings';

interface PaletteItem { id: number; color: Color; range: number }
type Tool = 'pick' | 'rectangle' | 'background' | 'text' | 'remove';
const screenRatio = window.devicePixelRatio || 1;
const initial = defaults(screenRatio, window.matchMedia('(prefers-color-scheme: dark)').matches);
let restored = initial;
try { restored = readSettings(localStorage.getItem(settingsKey), initial); } catch { /* Storage may be unavailable. */ }
const settings = reactive(restored);
const canvas = ref<HTMLCanvasElement | null>(null);
const original = shallowRef<ImageData | null>(null);
const palette = ref<PaletteItem[]>([]);
const selectedId = ref<number | null>(null);
const selected = computed(() => palette.value.find(item => item.id === selectedId.value));
const tool = ref<Tool>('pick');
const status = ref('Upload or paste an image to explore its colors.');
const error = ref('');
const fileName = ref('Demo image');
const loading = ref(false);
const hover = ref<ReturnType<typeof pickNearby>>(null);
const dragStart = ref<Point | null>(null);
const dragEnd = ref<Point | null>(null);
const saved = ref(false);
let nextId = 0;
let requestId = 0;
let frame = 0;

const imageStyle = computed(() => ({ width: `${(original.value?.width ?? 600) / settings.scale}px`, height: `${(original.value?.height ?? 400) / settings.scale}px` }));
const magnifiedPixels = computed(() => {
  if (!hover.value || !original.value) return [];
  const point = hover.value.point;
  const source = original.value;
  return Array.from({ length: 81 }, (_, i) => {
    const color = pixel(source, point.x + i % 9 - 4, point.y + Math.floor(i / 9) - 4);
    return color ? hex(color) : 'transparent';
  });
});
const magnifierStyle = computed(() => hover.value && original.value ? {
  left: `${Math.max(0, Math.min(hover.value.point.x / settings.scale + 20, original.value.width / settings.scale - 112))}px`,
  top: `${Math.max(0, Math.min(hover.value.point.y / settings.scale + 20, original.value.height / settings.scale - 112))}px`,
} : {});
const region = computed<Region | null>(() => {
  if (!dragStart.value || !dragEnd.value) return null;
  return { x: Math.min(dragStart.value.x, dragEnd.value.x), y: Math.min(dragStart.value.y, dragEnd.value.y), width: Math.abs(dragStart.value.x - dragEnd.value.x) + 1, height: Math.abs(dragStart.value.y - dragEnd.value.y) + 1 };
});
const rectangleStyle = computed(() => region.value ? { left: `${region.value.x / settings.scale}px`, top: `${region.value.y / settings.scale}px`, width: `${region.value.width / settings.scale}px`, height: `${region.value.height / settings.scale}px` } : {});
const instructions = computed(() => ({
  pick: 'Click near a line to add its color. If a similar color is in the palette, it is selected and highlighted.',
  rectangle: 'Drag a rectangle to collect colors. Blended edge shades are merged; background is excluded.',
  background: 'Click the exact background pixel to set the background color.',
  text: 'Click the exact text pixel to set the text color.',
  remove: 'Click a palette color to remove it. Click the minus button again to finish.',
}[tool.value]));

watch(() => settings.dark, dark => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; }, { immediate: true });
watch(settings, () => { saved.value = false; }, { deep: true, flush: 'sync' });
watch([selected, () => selected.value?.range], scheduleRender);
watch(() => [settings.background, settings.text, settings.smartPick, settings.snapRadius, settings.scale], () => { hover.value = null; });
watch(tool, () => { hover.value = null; dragStart.value = dragEnd.value = null; });

function scheduleRender() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(render);
}
function render() {
  const source = original.value;
  const context = canvas.value?.getContext('2d');
  if (!source || !context) return;
  const output = selected.value ? new ImageData(highlight(source, selected.value.color, selected.value.range), source.width, source.height) : source;
  context.putImageData(output, 0, 0);
}
function addColors(colors: Color[]): number {
  let count = 0;
  const background = fromHex(settings.background);
  for (const color of colors) {
    if (similar(color, background)) continue;
    if (paletteMatch(palette.value, color)) continue;
    palette.value.push({ id: nextId++, color, range: settings.ranges[hex(color)] ?? settings.defaultRange });
    count++;
  }
  return count;
}
function detectPalette() {
  if (!original.value) return;
  const excluded = [fromHex(settings.background)];
  if (settings.excludeText) excluded.push(fromHex(settings.text));
  palette.value = [];
  selectedId.value = null;
  addColors(mainColors(original.value, excluded));
  status.value = `Detected ${palette.value.length} main colors. Use a rectangle to add more.`;
}
function detectRoles() {
  if (!original.value) return;
  if (settings.backgroundAuto) settings.background = hex(detectBackground(original.value));
  if (settings.textAuto) settings.text = hex(detectText(original.value, fromHex(settings.background)));
}
function updateAuto(role: 'background' | 'text', event: Event) {
  const checked = (event.target as HTMLInputElement).checked;
  if (role === 'background') settings.backgroundAuto = checked;
  else settings.textAuto = checked;
  detectRoles();
}
function changeRole(role: 'background' | 'text', value: string) {
  settings[role] = value;
  if (role === 'background') { settings.backgroundAuto = false; if (settings.textAuto) detectRoles(); }
  else settings.textAuto = false;
}
function setTool(value: Tool) {
  tool.value = tool.value === value ? 'pick' : value;
  if (tool.value !== 'pick') selectedId.value = null;
}
function removeColor(item: PaletteItem) {
  palette.value = palette.value.filter(entry => entry.id !== item.id);
  if (selectedId.value === item.id) selectedId.value = null;
  status.value = `Removed ${colorName(item.color)}.`;
}
function handleMinus() {
  if (selected.value) removeColor(selected.value);
  else setTool('remove');
}
function paletteClick(item: PaletteItem) {
  if (tool.value === 'remove') {
    removeColor(item);
  } else {
    tool.value = 'pick';
    selectedId.value = selectedId.value === item.id ? null : item.id;
  }
}
function clearPalette() {
  palette.value = []; selectedId.value = null; tool.value = 'pick';
  status.value = 'Palette cleared. Click the image or drag a rectangle to add colors.';
}
function numeric(event: Event, current: number, min: number, max: number): number {
  const input = event.target as HTMLInputElement;
  if (input.value.trim() === '' || !Number.isFinite(input.valueAsNumber)) return current;
  return Math.min(max, Math.max(min, input.valueAsNumber));
}
function updateRange(event: Event) {
  if (!selected.value) return;
  selected.value.range = numeric(event, selected.value.range, 0, 255);
  settings.ranges[hex(selected.value.color)] = selected.value.range;
}
function pointFromEvent(event: PointerEvent): Point | null {
  if (!canvas.value || !original.value) return null;
  const rect = canvas.value.getBoundingClientRect();
  return { x: Math.max(0, Math.min(original.value.width - 1, Math.floor((event.clientX - rect.left) * original.value.width / rect.width))), y: Math.max(0, Math.min(original.value.height - 1, Math.floor((event.clientY - rect.top) * original.value.height / rect.height))) };
}
function sample(point: Point) {
  if (!original.value) return null;
  return pickNearby(original.value, point, tool.value === 'pick' && settings.smartPick ? settings.snapRadius * settings.scale : 0, [fromHex(settings.background), fromHex(settings.text)]);
}
function pointerMove(event: PointerEvent) {
  const point = pointFromEvent(event);
  if (!point) return;
  if (dragStart.value) { dragEnd.value = point; return; }
  hover.value = tool.value === 'remove' || tool.value === 'rectangle' ? null : sample(point);
}
function pointerDown(event: PointerEvent) {
  if (event.button !== 0 || tool.value === 'remove') return;
  const point = pointFromEvent(event);
  if (!point || !original.value) return;
  if (tool.value === 'rectangle') {
    dragStart.value = dragEnd.value = point;
    canvas.value?.setPointerCapture(event.pointerId);
    return;
  }
  if (tool.value === 'pick' && selected.value) {
    const clickedColor = pixel(original.value, point.x, point.y);
    // A background click dismisses the highlight before nearby picking can
    // snap it to a line. Always inspect the unmodified source image.
    if (clickedColor && similar(clickedColor, fromHex(settings.background))) {
      selectedId.value = null;
      hover.value = null;
      status.value = 'Showing the original image.';
      return;
    }
  }
  const result = sample(point);
  if (!result) { status.value = 'This pixel is transparent. Choose a visible color.'; return; }
  if (tool.value === 'background' || tool.value === 'text') {
    changeRole(tool.value, hex(result.color));
    status.value = `${tool.value === 'background' ? 'Background' : 'Text'} set to ${colorName(result.color)} (${hex(result.color)}).`;
    tool.value = 'pick';
  } else {
    if (similar(result.color, fromHex(settings.background))) {
      selectedId.value = null;
      hover.value = null;
      status.value = 'Background colors are excluded from the palette.';
      return;
    }
    const match = paletteMatch(palette.value, result.color);
    if (match) {
      selectedId.value = match.id;
      status.value = `Selected ${colorName(match.color)} (${hex(match.color)}) from the palette.`;
    } else {
      addColors([result.color]);
      selectedId.value = null;
      status.value = `Added ${colorName(result.color)} (${hex(result.color)}).`;
    }
    hover.value = result;
  }
}
function pointerUp(event: PointerEvent) {
  if (!dragStart.value || !original.value) return;
  dragEnd.value = pointFromEvent(event);
  const area = region.value;
  if (area && area.width >= 2 && area.height >= 2) {
    const excluded = [fromHex(settings.background)];
    if (settings.excludeText) excluded.push(fromHex(settings.text));
    const count = addColors(rectangleClusters(original.value, area, excluded).map(entry => entry.color));
    status.value = count ? `Added ${count} color clusters from the rectangle.` : 'No new colors in this rectangle after exclusions and duplicates.';
  } else status.value = 'Drag a larger rectangle to extract its colors.';
  cancelDrag(event);
}
function cancelDrag(event?: PointerEvent) {
  if (event && canvas.value?.hasPointerCapture(event.pointerId)) canvas.value.releasePointerCapture(event.pointerId);
  dragStart.value = dragEnd.value = null;
}

async function loadImage(url: string, name: string, revoke = false) {
  const id = ++requestId;
  loading.value = true; error.value = '';
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (id !== requestId) return;
    const offscreen = document.createElement('canvas');
    offscreen.width = image.naturalWidth; offscreen.height = image.naturalHeight;
    const context = offscreen.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Canvas is unavailable.');
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, offscreen.width, offscreen.height);
    original.value = pixels;
    fileName.value = name;
    selectedId.value = null; tool.value = 'pick'; hover.value = null; cancelDrag();
    detectRoles(); detectPalette();
    await nextTick(); render();
  } catch {
    if (id === requestId) error.value = 'Could not open this image. Try a PNG, JPEG, WebP, or another supported image.';
  } finally {
    if (revoke) URL.revokeObjectURL(url);
    if (id === requestId) loading.value = false;
  }
}
function loadFile(file: File) {
  if (!file.type.startsWith('image/')) { error.value = 'Please choose an image file.'; return; }
  void loadImage(URL.createObjectURL(file), file.name || 'Pasted image', true);
}
function fileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  if (input.files?.[0]) loadFile(input.files[0]);
  input.value = '';
}
function paste(event: ClipboardEvent) {
  const file = [...(event.clipboardData?.files ?? [])].find(entry => entry.type.startsWith('image/'));
  if (file) { event.preventDefault(); loadFile(file); }
}
function drop(event: DragEvent) {
  event.preventDefault();
  const file = event.dataTransfer?.files[0];
  if (file) loadFile(file);
}
function keydown(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null;
  if (target?.closest('input, textarea, select, button, [contenteditable="true"]') || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key === 'Escape') { tool.value = 'pick'; selectedId.value = null; cancelDrag(); }
  if (/^[1-9]$/.test(event.key)) {
    const item = palette.value[Number(event.key) - 1];
    if (item) { event.preventDefault(); paletteClick(item); }
  }
}
function saveSettings() {
  try { localStorage.setItem(settingsKey, JSON.stringify(settings)); error.value = ''; saved.value = true; status.value = 'Settings saved in this browser, including each color’s highlight range.'; }
  catch { error.value = 'Your browser could not save settings. Check whether local storage is allowed.'; }
}
function resetSettings() {
  Object.assign(settings, defaults(window.devicePixelRatio, window.matchMedia('(prefers-color-scheme: dark)').matches));
  for (const item of palette.value) item.range = settings.defaultRange;
  detectRoles();
  status.value = 'Default settings restored. Use Save settings to keep them.';
}
onMounted(() => {
  document.addEventListener('paste', paste);
  document.addEventListener('keydown', keydown);
  void loadImage(`${import.meta.env.BASE_URL}image.webp`, 'Demo image');
});
onBeforeUnmount(() => { requestId++; cancelAnimationFrame(frame); document.removeEventListener('paste', paste); document.removeEventListener('keydown', keydown); });
</script>

<template>
  <main class="workspace" @dragover.prevent @drop="drop">
    <header class="app-header">
      <div><p class="eyebrow">A clearer view of color</p><h1>Colear<span class="brand-dot">.</span></h1><p class="subtitle">Find, collect, and highlight the colors that matter.</p></div>
      <div class="header-actions">
        <button :aria-pressed="settings.dark" @click="settings.dark = !settings.dark">{{ settings.dark ? '☀ Light mode' : '☾ Dark mode' }}</button>
        <button class="primary" @click="saveSettings">{{ saved ? '✓ Settings saved' : 'Save settings' }}</button>
      </div>
    </header>

    <div class="workbench">
        <section class="panel image-panel" aria-label="Image workspace">
          <div class="panel-heading"><div><h2>Image workspace</h2><p>{{ fileName }}<span v-if="original"> · {{ original.width }} × {{ original.height }} pixels</span></p></div><label class="button primary upload">Upload image<input type="file" accept="image/*" @change="fileChange"></label></div>
          <div class="toolbar" role="group" aria-label="Image tools">
            <button :aria-pressed="tool === 'pick'" @click="tool = 'pick'">↗ Pick color</button>
            <button :aria-pressed="tool === 'rectangle'" @click="setTool('rectangle')">▧ Bulk add</button>
            <button :disabled="!selected" @click="selectedId = null">Show original</button>
            <span class="toolbar-note">Paste with Ctrl / ⌘ V</span>
          </div>
          <div class="image-scroll" :aria-busy="loading">
            <div class="canvas-wrap" :style="imageStyle">
              <canvas ref="canvas" :width="original?.width ?? 600" :height="original?.height ?? 400" :style="imageStyle" aria-label="Image. Click to pick a color or drag to select a rectangle." @pointerdown="pointerDown" @pointermove="pointerMove" @pointerup="pointerUp" @pointercancel="cancelDrag" @lostpointercapture="cancelDrag" @pointerleave="hover = null" />
              <div v-if="region" class="selection-rectangle" :style="rectangleStyle" />
              <div v-if="hover" class="sample-marker" :style="{ left: `${hover.point.x / settings.scale}px`, top: `${hover.point.y / settings.scale}px`, borderColor: hex(hover.color) }" />
              <div v-if="hover" class="magnifier" :style="magnifierStyle" aria-hidden="true"><span v-for="(color, index) in magnifiedPixels" :key="index" :class="{ center: index === 40 }" :style="{ background: color }" /></div>
            </div>
          </div>
          <div class="image-footer"><p>{{ loading ? 'Loading image…' : instructions }}</p><span v-if="hover" class="hover-color"><i :style="{ background: hex(hover.color) }" />{{ colorName(hover.color) }} · {{ hex(hover.color) }}</span></div>
        </section>

        <section class="panel palette-panel" aria-label="Color palette">
          <div class="panel-heading"><div><h2>Your palette <span class="count">{{ palette.length }}</span></h2><p>Click to highlight · drag to reorder · keys 1–9 to select</p></div><div class="compact-actions"><button :disabled="!original" @click="detectPalette">Detect main colors</button><button :aria-label="selected ? 'Remove selected color' : 'Remove colors'" :title="selected ? 'Remove selected color' : 'Toggle remove mode'" :aria-pressed="tool === 'remove'" @click="handleMinus">−</button><button :disabled="!palette.length" @click="clearPalette">Clear</button></div></div>
          <draggable v-model="palette" item-key="id" class="palette-grid" :animation="150" :disabled="tool === 'remove'" :delay="150" :delay-on-touch-only="true" ghost-class="ghost">
            <template #item="{ element, index }: { element: PaletteItem; index: number }">
              <button class="color-card" :class="{ selected: selectedId === element.id, removing: tool === 'remove' }" :aria-pressed="selectedId === element.id" :aria-label="`${tool === 'remove' ? 'Remove' : 'Highlight'} ${colorName(element.color)} ${hex(element.color)}`" @click="paletteClick(element)">
                <span class="swatch" :style="{ background: hex(element.color) }"><span class="swatch-index">{{ tool === 'remove' ? '−' : index < 9 ? index + 1 : '' }}</span></span>
                <span class="color-label">{{ colorName(element.color) }}</span><span class="color-hex">{{ hex(element.color) }}</span>
              </button>
            </template>
          </draggable>
          <p v-if="!palette.length" class="empty">Your palette is empty. Pick a color or select a rectangle in the image.</p>
          <div class="range-editor">
            <div><h3>{{ selected ? colorName(selected.color) : 'Highlight range' }} <code v-if="selected">{{ hex(selected.color) }}</code></h3><p>{{ selected ? 'Adjust how closely a pixel must match. The highlight updates live.' : 'Select a palette color to adjust its own detection range.' }}</p></div>
            <div class="range-controls"><input aria-label="Highlight range slider" type="range" min="0" max="255" :value="selected?.range ?? settings.defaultRange" :disabled="!selected" @input="updateRange"><input aria-label="Highlight range" class="number-input" type="number" min="0" max="255" :value="selected?.range ?? settings.defaultRange" :disabled="!selected" @input="updateRange"></div>
            <p class="hint">0 = exact match · 255 = all colors. Color names are approximate.</p>
          </div>
        </section>
      <div class="workspace-feedback"><p class="status" role="status">{{ status }}</p><p v-if="error" class="error" role="alert">{{ error }}</p></div>

      <section class="settings-grid" aria-label="Detection and display settings">
        <section class="panel settings-panel"><div class="section-heading"><span class="section-number">01</span><h2>Color picking</h2></div>
          <label class="check-row"><input v-model="settings.smartPick" type="checkbox">Smart nearby selection</label><p class="hint">Find the solid color inside a nearby line, avoiding blended edges, background, and text.</p>
          <label class="field-label" for="snap-radius">Search radius <span>{{ settings.snapRadius }} px</span></label><input id="snap-radius" type="range" min="1" max="32" :disabled="!settings.smartPick" :value="settings.snapRadius" @input="settings.snapRadius = numeric($event, settings.snapRadius, 1, 32)">
          <div class="field-row"><label for="default-range">Default highlight range</label><input id="default-range" class="number-input" type="number" min="0" max="255" :value="settings.defaultRange" @input="settings.defaultRange = numeric($event, settings.defaultRange, 0, 255)"></div>
          <label class="check-row"><input v-model="settings.excludeText" type="checkbox">Exclude text color from detection</label><p class="hint">Applies to <code>Detect main colors</code> and <code>Bulk add</code>. Background is always excluded.</p>
        </section>

        <section class="panel settings-panel"><div class="section-heading"><span class="section-number">02</span><h2>Background &amp; text</h2></div>
          <div class="role-block"><h3>Background</h3><div class="role-color"><input aria-label="Background color" type="color" :value="settings.background" @input="changeRole('background', ($event.target as HTMLInputElement).value)"><code>{{ settings.background }}</code><button :aria-pressed="tool === 'background'" @click="setTool('background')">Pick pixel</button></div><label class="check-row"><input type="checkbox" :checked="settings.backgroundAuto" @change="updateAuto('background', $event)">Auto-detect most common color</label></div>
          <div class="role-block"><h3>Text</h3><div class="role-color"><input aria-label="Text color" type="color" :value="settings.text" @input="changeRole('text', ($event.target as HTMLInputElement).value)"><code>{{ settings.text }}</code><button :aria-pressed="tool === 'text'" @click="setTool('text')">Pick pixel</button></div><label class="check-row"><input type="checkbox" :checked="settings.textAuto" @change="updateAuto('text', $event)">Auto-detect text color</label></div>
          <p class="hint">Text defaults to black. Automatic text detection estimates a common contrasting color; use Pick pixel to refine it.</p>
        </section>

        <section class="panel settings-panel"><div class="section-heading"><span class="section-number">03</span><h2>Image scale</h2></div>
          <div class="field-row"><label for="image-scale">Divide image size by</label><input id="image-scale" class="number-input" type="number" min="0.25" max="8" step="0.25" :value="settings.scale" @input="settings.scale = numeric($event, settings.scale, 0.25, 8)"></div>
          <input aria-label="Image scale slider" type="range" min="0.25" max="8" step="0.25" :value="settings.scale" @input="settings.scale = numeric($event, settings.scale, 0.25, 8)">
          <button class="full-width" @click="settings.scale = defaults(screenRatio).scale">Use screen pixel ratio</button>
          <p v-if="original" class="hint">Displayed at {{ Math.round(original.width / settings.scale) }} × {{ Math.round(original.height / settings.scale) }} CSS pixels. All original image pixels are retained.</p>
        </section>
        <div class="settings-footer"><p class="settings-note">Save settings to remember your theme, picking options, scale, background, text, and per-color ranges in this browser. Images are not stored.</p><button class="reset-button" @click="resetSettings">Restore defaults</button></div>
      </section>
    </div>
  </main>
</template>
