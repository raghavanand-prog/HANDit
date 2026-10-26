// A plain-language label for this browser and system, such as "Safari on iPhone".
// Shown to the other device next to the device name ("name not verified").

export interface DeviceInfo {
  os: "iPhone" | "iPad" | "Android" | "Windows" | "Mac" | "ChromeOS" | "Linux" | "Unknown";
  browser: "Safari" | "Chrome" | "Edge" | "Firefox" | "Samsung Internet" | "Opera" | "Browser";
}

export function describeDevice(userAgent: string, maxTouchPoints = 0): DeviceInfo {
  const has = (pattern: RegExp) => pattern.test(userAgent);
  const os: DeviceInfo["os"] = has(/iPhone|iPod/)
    ? "iPhone"
    : has(/iPad/) || (has(/Macintosh/) && maxTouchPoints > 1) // iPadOS reports itself as a Mac
      ? "iPad"
      : has(/Android/)
        ? "Android"
        : has(/Windows/)
          ? "Windows"
          : has(/CrOS/)
            ? "ChromeOS"
            : has(/Macintosh|Mac OS X/)
              ? "Mac"
              : has(/Linux/)
                ? "Linux"
                : "Unknown";
  const browser: DeviceInfo["browser"] = has(/Edg(e|A|iOS)?\//)
    ? "Edge"
    : has(/OPR\//)
      ? "Opera"
      : has(/SamsungBrowser/)
        ? "Samsung Internet"
        : has(/Firefox|FxiOS/)
          ? "Firefox"
          : has(/Chrome|CriOS/)
            ? "Chrome"
            : has(/Safari/)
              ? "Safari"
              : "Browser";
  return { os, browser };
}

const BROWSERS = "Safari|Chrome|Edge|Firefox|Samsung Internet|Opera|Browser";
const SYSTEMS = "iPhone|iPad|Android|Windows|Mac|ChromeOS|Linux|Unknown";
const LABEL = new RegExp(`^(${BROWSERS}) on (${SYSTEMS})$`);

/** The other device's label, only if it is a browser and system HANDit knows; otherwise a neutral one. */
export const cleanDeviceLabel = (raw: string) => (LABEL.test(raw) ? raw : "Browser on Unknown");

export const uaLabel = ({ os, browser }: DeviceInfo) => `${browser} on ${os}`;

export function defaultDeviceName({ os }: DeviceInfo): string {
  const names: Record<DeviceInfo["os"], string> = {
    iPhone: "iPhone",
    iPad: "iPad",
    Android: "Android phone",
    Windows: "Windows PC",
    Mac: "Mac",
    ChromeOS: "Chromebook",
    Linux: "Linux computer",
    Unknown: "This device",
  };
  return names[os];
}

/** This browser, as seen from the page. */
export const thisDevice = (): DeviceInfo =>
  describeDevice(navigator.userAgent, navigator.maxTouchPoints ?? 0);
