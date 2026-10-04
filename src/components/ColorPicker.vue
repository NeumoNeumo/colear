<script setup lang="ts">
import { onMounted, ref, Ref } from "vue";
import draggable from "vuedraggable";

interface Color {
  r: number;
  g: number;
  b: number;
  a: number;
}

interface PaletteItem {
  color: Color;
  order: number;
}

type State = "remove" | "normal";

const magnifierData: Ref<Color[][]> = ref(
  new Array(11)
    .fill(null)
    .map(() => new Array(11).fill({ r: 0, g: 0, b: 0, a: 0 }))
);
const imageCanvas = ref<HTMLCanvasElement | null>(null);
const ctx = ref<CanvasRenderingContext2D | null>(null);
const magnifier = ref<HTMLDivElement | null>(null);
const selectedColor = ref<Color>({ r: 0, g: 0, b: 0, a: 0 });
const paletteData = ref<PaletteItem[]>([]);
const selectedOrder = ref<number>(-1);
let imageSrcArray: Uint8ClampedArray | null = null;
let order = 0;
let state = ref<State>("normal");
const K = 5;

function getGrayScale(color: Color): number {
  return 0.299 * color.r + 0.587 * color.g + 0.114 * color.b;
}

function isBright(color: Color): boolean {
  return (getGrayScale(color) * color.a) / 255.0 > 127;
}

function order2idx(order: number): number {
  return paletteData.value.findIndex((color) => color.order == order);
}

function isSelected(): boolean {
  return order2idx(selectedOrder.value) != -1;
}

function updataImageSrcData() {
  if (!ctx.value) return;
  imageSrcArray = ctx.value.getImageData(
    0,
    0,
    ctx.value.canvas.width,
    ctx.value.canvas.height
  ).data;
}

function handleRemove() {
  selectedOrder.value = -1;
  refreshCanvas();
  if (state.value == "remove") state.value = "normal";
  else state.value = "remove";
}

function clearAll(){
  paletteData.value = [];
  selectedOrder.value = -1;
  refreshCanvas();
  state.value = "normal";
}

function color2string(color: Color): string {
  return `rgb(${color.r}, ${color.g}, ${color.b})`;
}

function string2color(str: string): Color {
  const [r, g, b] = str
    .slice(4, -1)
    .split(",")
    .map((s) => parseInt(s));
  return { r, g, b, a: 255 };
}

function color2hsl(color: Color): { h: number; s: number; l: number } {
  const r = color.r / 255;
  const g = color.g / 255;
  const b = color.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h: number;
  if (max == min) {
    h = 0;
  } else if (max == r && g >= b) {
    h = 60 * ((g - b) / (max - min));
  } else if (max == r && g < b) {
    h = 60 * ((g - b) / (max - min)) + 360;
  } else if (max == g) {
    h = 60 * ((b - r) / (max - min)) + 120;
  } else {
    // max == b
    h = 60 * ((r - g) / (max - min)) + 240;
  }
  let s: number;
  if (max == min) {
    s = 0;
  } else {
    s = ((max - min) / max) * 100;
  }
  const l = ((max + min) / 2) * 100;
  return { h, s, l };
}

function refreshPaletteData() {
  updataImageSrcData();
  if (!imageSrcArray) return;
  const colorCounts = new Map<string, number>();

  for (let i = 0; i < imageSrcArray.length; i += 4) {
    const r = imageSrcArray[i];
    const g = imageSrcArray[i + 1];
    const b = imageSrcArray[i + 2];
    const a = imageSrcArray[i + 3];
    const color: Color = { r, g, b, a };
    const s = color2hsl(color).s;
    if (getGrayScale(color) > 240 || getGrayScale(color) < 15 || s < 50)
      continue;
    const count = colorCounts.get(color2string(color)) || 0;
    if (count != 0) {
      colorCounts.set(color2string(color), count + 1);
    } else {
      colorCounts.set(color2string(color), 1);
    }
  }
  const colors = Array.from(colorCounts.entries())
    .sort((a, b) => a[1] - b[1])
    .map(([color]) => string2color(color));

  let distinctColors: { color: Color; order: number }[] = [];
  while (true) {
    const c = colors.pop();
    if (c == undefined) break;
    let similar = false;
    for (let i = 0; i < distinctColors.length; i++)
      if (isSimilar(c, distinctColors[i].color)) {
        similar = true;
        break;
      }
    if (similar) continue;
    distinctColors.push({ color: c, order: order++ });
    if (distinctColors.length >= K) break;
  }

  paletteData.value = distinctColors;
}

onMounted(() => {
  initComponents();
  loadDemo();
  addPasteListener();
  addKeyListener();
});

function addKeyListener() {
  document.addEventListener("keydown", (event) => {
    if (!"0123456789".includes(event.key)) return;
    const keyValue = Number(event.key);
    if (keyValue > paletteData.value.length) return;
    clickColorBlk(keyValue - 1);
  });
}

function initComponents() {
  const _ctx = imageCanvas.value?.getContext("2d", {
    willReadFrequently: true,
  });
  if (!_ctx) return;
  ctx.value = _ctx;

  const _magnifier = magnifier.value;
  if (!_magnifier) return;
  magnifier.value = _magnifier;
}

function loadDemo() {
  let img = new Image();
  img.onload = function () {
    if (!ctx.value || !imageCanvas.value) return;
    ctx.value.fillStyle = "white";
    ctx.value.fillRect(0, 0, imageCanvas.value.width, imageCanvas.value.height);
    ctx.value.drawImage(img, 0, 0);
    refreshPaletteData();
  };
  img.src = "image.webp";
}

function addPasteListener() {
  document.addEventListener("paste", async (e: ClipboardEvent) => {
    e.preventDefault();
    const hasAsync = typeof navigator?.clipboard?.read === "function";
    if (hasAsync) {
      console.log("Use async");
      const clipboardItems = await navigator.clipboard.read();
      for (const clipboardItem of clipboardItems) {
        const imageType = clipboardItem.types?.find((type) =>
          type.startsWith("image/")
        );
        if (imageType) {
          const blob = await clipboardItem.getType(imageType);
          loadNewImg(blob);
        }
      }
    } else {
      console.log("Use legacy");
      for (const clipboardFile of e.clipboardData?.files ?? []) {
        if (clipboardFile.type.startsWith("image/")) {
          loadNewImg(clipboardFile);
        }
      }
    }
  });
}

function onFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  loadNewImg(file);
}

function loadNewImg(obj: Blob | MediaSource) {
  if (!ctx.value) return;
  const img = new Image();
  img.onload = () => {
    if (imageCanvas.value) {
      imageCanvas.value.width = img.width;
      imageCanvas.value.height = img.height;
    }
    ctx.value?.drawImage(img, 0, 0);
    refreshPaletteData();
  };
  img.src = URL.createObjectURL(obj);
}

function handleColorBlk(order: number) {
  switch (state.value) {
    case "normal":
      clickColorBlk(order);
      break;
    case "remove": {
      const index = order2idx(order);
      if (index !== -1) paletteData.value.splice(index, 1);
      break;
    }
  }
}

function clickColorBlk(order: number) {
  if (order == selectedOrder.value) selectedOrder.value = -1;
  else selectedOrder.value = order;
  refreshCanvas();
}

function paintFromArray(arr: Uint8ClampedArray) {
  if (!ctx.value || !imageSrcArray || !imageCanvas.value) return;
  ctx.value.putImageData(
    new ImageData(arr, imageCanvas.value.width, imageCanvas.value.height),
    0,
    0
  );
}

function isSimilar(a: Color, b: Color) {
  const epsilon = 20;
  if ((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2 < 3 * epsilon ** 2)
    return true;
  return false;
}

function refreshCanvas() {
  if (!ctx.value || !imageSrcArray || !imageCanvas.value) return;
  const selectedIdx = order2idx(selectedOrder.value);
  if (selectedIdx == -1) {
    paintFromArray(imageSrcArray);
    return;
  }
  let modImageData = new Uint8ClampedArray(
    imageCanvas.value.width * imageCanvas.value.height * 4
  );
  const color_t = paletteData.value[selectedIdx].color;
  const r_t = color_t.r;
  const g_t = color_t.g;
  const b_t = color_t.b;
  const a_t = color_t.a;
  for (let i = 0; i < imageSrcArray.length; i += 4) {
    const r = imageSrcArray[i];
    const g = imageSrcArray[i + 1];
    const b = imageSrcArray[i + 2];
    const color = { r, g, b, a: 255 };
    if (!isSimilar(color_t, color)) {
      const grayScale = getGrayScale(color);
      modImageData[i] = modImageData[i + 1] = modImageData[i + 2] = grayScale;
      modImageData[i + 3] = imageSrcArray[i + 3] * 0.5;
    } else {
      modImageData[i] = r_t;
      modImageData[i + 1] = g_t;
      modImageData[i + 2] = b_t;
      modImageData[i + 3] = a_t;
      const dilationR = 1;
      for (let j = -dilationR; j <= dilationR; ++j) {
        for (let k = -dilationR; k <= dilationR; ++k) {
          const idx = i + 4 * (imageCanvas.value.width * j + k);
          if (idx < 0 || idx >= modImageData.length) continue;
          modImageData[idx] = r_t;
          modImageData[idx + 1] = g_t;
          modImageData[idx + 2] = b_t;
          modImageData[idx + 3] = a_t;
        }
      }
    }
  }
  paintFromArray(modImageData);
}

function updateMagnifier(e: MouseEvent) {
  if (state.value != "normal" || isSelected()) return;

  if (!magnifier.value || !ctx.value) return;
  const x = e.offsetX;
  const y = e.offsetY;
  magnifier.value.style.left = `${x + 30}px`;
  magnifier.value.style.top = `${y + 30}px`;
  magnifier.value.style.display = "block";

  const imgData = ctx.value.getImageData(x - 5, y - 5, 11, 11).data;
  selectedColor.value = {
    r: imgData[0 + (5 * 11 + 5) * 4],
    g: imgData[1 + (5 * 11 + 5) * 4],
    b: imgData[2 + (5 * 11 + 5) * 4],
    a: imgData[3 + (5 * 11 + 5) * 4],
  };
  for (let i = 0; i < 11; ++i) {
    for (let j = 0; j < 11; ++j) {
      if (imgData) {
        magnifierData.value[i][j] = {
          r: imgData[0 + (i * 11 + j) * 4],
          g: imgData[1 + (i * 11 + j) * 4],
          b: imgData[2 + (i * 11 + j) * 4],
          a: imgData[3 + (i * 11 + j) * 4],
        };
      }
    }
  }

  const focusBorderColor = isBright(selectedColor.value) ? "black" : "white";

  let targetElement = magnifier.value.querySelector<HTMLElement>(
    "tr:nth-child(5) td:nth-child(6)"
  );
  if (!targetElement) return;
  targetElement.style.borderBottomColor = focusBorderColor;
  targetElement = magnifier.value.querySelector<HTMLElement>(
    "tr:nth-child(6) td:nth-child(6)"
  );
  if (!targetElement) return;
  targetElement.style.borderColor = focusBorderColor;
  targetElement = magnifier.value.querySelector<HTMLElement>(
    "tr:nth-child(6) td:nth-child(5)"
  );
  if (!targetElement) return;
  targetElement.style.borderRightColor = focusBorderColor;
}

function hideMagnifier() {
  if (!magnifier.value) return;
  magnifier.value.style.display = "none";
}

function clickMagnifier() {
  if (state.value != "normal" || isSelected()) return;
  paletteData.value.push({ color: magnifierData.value[5][5], order: order++ });
}
</script>

<template>
  <div
    class="p-3 relative w-full sm:w-[640px] rounded-lg shadow-md bg-white border border-gray"
  >
    <input class="hidden" id="inputFile" type="file" accept="image/*" @change="onFileChange"/>
    <div>
    <label for="inputFile" class="cursor-pointer underline">Click</label>
    to upload an image or just paste an image from your clipboard by `ctrl + v`.
    </div>
    <div class="w-full h-full">
      <canvas
        class="block cursor-crosshair relative mx-auto"
        width="600"
        height="400"
        ref="imageCanvas"
        @mousemove="updateMagnifier"
        @mouseleave="hideMagnifier"
        @click="clickMagnifier"
      ></canvas>
      <div
        style="left: 0px; top: 0px"
        ref="magnifier"
        class="magnifier hidden z-50 overflow-hidden absolute rounded-full border border-solid border-black"
      >
        <table class="w-full h-full m-0 p-0 border-spacing-0">
          <tbody>
            <tr v-for="row in magnifierData">
              <td
                v-for="cell in row"
                :style="{
                  backgroundColor: `rgba(${cell.r}, ${cell.g}, ${cell.b}, ${
                    cell.a / 255.0
                  })`,
                }"
                class="border border-solid border-gray-400 p-0 box-border"
              />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    <div
      class="mt-2 p-2 rounded-lg border border-gray-300 shadow-sm h-full w-full"
      id="palette"
    >
      <h1 class="font-bold text-sm uppercase">Palette</h1>
      <div class="flex gap-2 h-12">
        <div class="flex flex-col">
          <button class="PaletteBtn transition-colors" @click="clearAll">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              xmlns:xlink="http://www.w3.org/1999/xlink"
              fill="#000000"
              version="1.1"
              id="Capa_1"
              width="15"
              height="15"
              viewBox="0 0 485 485"
              xml:space="preserve"
            >
              <g>
                <g>
                  <rect x="67.224" width="350.535" height="71.81" />
                  <path
                    d="M417.776,92.829H67.237V485h350.537V92.829H417.776z M165.402,431.447h-28.362V146.383h28.362V431.447z M256.689,431.447    h-28.363V146.383h28.363V431.447z M347.97,431.447h-28.361V146.383h28.361V431.447z"
                  />
                </g>
              </g>
            </svg>
          </button>
          <button
            class="PaletteBtn transition-colors"
            @click="handleRemove"
            :style="{ backgroundColor: state == 'remove' ? 'aqua' : 'white' }"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 15 15"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              class=""
            >
              <path
                d="M2.25 7.5C2.25 7.22386 2.47386 7 2.75 7H12.25C12.5261 7 12.75 7.22386 12.75 7.5C12.75 7.77614 12.5261 8 12.25 8H2.75C2.47386 8 2.25 7.77614 2.25 7.5Z"
                fill="currentColor"
                fill-rule="evenodd"
                clip-rule="evenodd"
              ></path>
            </svg>
          </button>
        </div>
        <draggable
          class="palette w-full flex rounded-lg overflow-hidden"
          tag="TransitionGroup"
          v-model="paletteData"
          :component-data="{
            tag: 'div',
          }"
          animation="200"
          ghostClass="ghost"
          itemKey="order"
        >
          <template #item="{ element }: { element: PaletteItem }">
            <div
              class="flex-1 cursor-pointer flex"
              :style="{
                backgroundColor: `rgba(${element.color.r}, ${
                  element.color.g
                }, ${element.color.b}, ${element.color.a / 255.0})`,
              }"
              @click="handleColorBlk(element.order)"
            >
              <div
                v-if="selectedOrder == element.order"
                class="h-2.5 w-2.5 mx-auto my-auto rounded-full"
                :style="{
                  backgroundColor: isBright(element.color) ? 'black' : 'white',
                }"
              ></div>
            </div>
          </template>
        </draggable>
      </div>
    </div>
  </div>
</template>

<style scoped>
div.magnifier {
  width: 110px;
  height: 110px;
  background-size: 6px;
  background-color: white;
  background-image: url("data:image/gif;base64,R0lGODlhDAAMAIABAMzMzP///yH5BAEAAAEALAAAAAAMAAwAAAIWhB+ph5ps3IMyQFBvzVRq3zmfGC5QAQA7");
}
div.palette {
  background-size: 6px;
  background-color: white;
  background-image: url("data:image/gif;base64,R0lGODlhDAAMAIABAMzMzP///yH5BAEAAAEALAAAAAAMAAwAAAIWhB+ph5ps3IMyQFBvzVRq3zmfGC5QAQA7");
}
div.magnifier td {
  width: calc(100% / 11);
  height: calc(100% / 11);
}
div.magnifier tr:nth-child(5) td:nth-child(6) {
  border-bottom-color: rgb(90, 90, 90);
}
div.magnifier tr:nth-child(6) td:nth-child(5) {
  border-right-color: rgb(90, 90, 90);
}
div.magnifier tr:nth-child(6) td:nth-child(6) {
  border-color: rgb(90, 90, 90);
}
div#palette button.PaletteBtn {
  border-width: 1px;
  padding-left: 0.75rem;
  padding-right: 0.75rem;
  padding-top: 0.25rem;
  padding-bottom: 0.25rem;
  border-radius: 0.375rem;
  display: flex;
  justify-content: center;
  --tw-border-opacity: 1;
  border-color: rgb(209 213 219 / var(--tw-border-opacity)) /* #d1d5db */;
}
div#palette button.PaletteBtn:hover {
  --tw-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
  --tw-shadow-colored: 0 4px 6px -1px var(--tw-shadow-color),
    0 2px 4px -2px var(--tw-shadow-color);
  box-shadow: var(--tw-ring-offset-shadow, 0 0 #0000),
    var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow);
  --tw-border-opacity: 1;
  border-color: rgb(156 163 175 / var(--tw-border-opacity)) /* #9ca3af */;
}
.ghost {
  opacity: 0;
  background: white;
}
</style>
