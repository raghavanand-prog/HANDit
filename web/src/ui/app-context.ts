import { createContext, useContext } from "react";
import type { DeviceInfo } from "../core/device";
import type { Device } from "../core/rtc";
import type { Settings } from "../core/settings";

export interface AppContextValue {
  settings: Settings;
  setSettings(settings: Settings): void;
  device: DeviceInfo;
  /** How this device introduces itself: its name and "Safari on iPhone". */
  me: Device;
  /** Features this browser lacks (empty when HANDit can run). */
  unsupported: string[];
}

export const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error("useApp outside AppContext");
  return value;
}
