// Settings are the only thing HANDit stores in the browser: the device name, how long
// codes last, and whether the sender confirms who receives before files go out.
export type Lifetime = 60 | 120 | 300;
export const LIFETIMES: Lifetime[] = [60, 120, 300];
export const MAX_NAME_LENGTH = 40;

export interface Settings {
  name: string;
  lifetime: Lifetime;
  confirmReceiver: boolean;
}

const KEY = "handit.settings";

export function loadSettings(defaultName: string): Settings {
  const defaults: Settings = { name: defaultName, lifetime: 120, confirmReceiver: true };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Settings>;
    return {
      name:
        typeof saved.name === "string" && saved.name.trim()
          ? saved.name.trim().slice(0, MAX_NAME_LENGTH)
          : defaults.name,
      lifetime: LIFETIMES.includes(saved.lifetime as Lifetime)
        ? (saved.lifetime as Lifetime)
        : defaults.lifetime,
      confirmReceiver:
        typeof saved.confirmReceiver === "boolean"
          ? saved.confirmReceiver
          : defaults.confirmReceiver,
    };
  } catch {
    return defaults;
  }
}

export function saveSettings(settings: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Storage blocked (private mode): settings last until the tab closes.
  }
}
