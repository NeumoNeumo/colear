export interface Settings {
  version: 1;
  dark: boolean;
  smartPick: boolean;
  snapRadius: number;
  scale: number;
  backgroundAuto: boolean;
  background: string;
  defaultRange: number;
  ranges: Record<string, number>;
}

export const settingsKey = 'colear.settings.v1';
export function defaults(pixelRatio = 1, dark = false): Settings {
  return { version: 1, dark, smartPick: true, snapRadius: 8, scale: Math.min(8, Math.max(0.25, pixelRatio || 1)), backgroundAuto: true, background: '#ffffff', defaultRange: 20, ranges: {} };
}

export function readSettings(raw: string | null, fallback: Settings): Settings {
  if (!raw) return fallback;
  try {
    const value = JSON.parse(raw);
    if (!value || value.version !== 1) return fallback;
    const result = { ...fallback, ranges: {} as Record<string, number> };
    for (const key of ['dark', 'smartPick', 'backgroundAuto'] as const) {
      if (typeof value[key] === 'boolean') result[key] = value[key];
    }
    for (const key of ['background'] as const) {
      if (typeof value[key] === 'string' && /^#[0-9a-f]{6}$/i.test(value[key])) result[key] = value[key];
    }
    for (const [key, min, max] of [['snapRadius', 1, 32], ['scale', 0.25, 8], ['defaultRange', 0, 255]] as const) {
      if (typeof value[key] === 'number' && Number.isFinite(value[key])) result[key] = Math.min(max, Math.max(min, value[key]));
    }
    if (value.ranges && typeof value.ranges === 'object') {
      for (const [key, range] of Object.entries(value.ranges)) {
        if (/^#[0-9a-f]{6}$/i.test(key) && typeof range === 'number' && Number.isFinite(range)) result.ranges[key.toLowerCase()] = Math.min(255, Math.max(0, range));
      }
    }
    return result;
  } catch { return fallback; }
}
