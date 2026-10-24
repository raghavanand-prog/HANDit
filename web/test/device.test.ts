import { expect, test } from "vitest";
import { defaultDeviceName, describeDevice, uaLabel } from "../src/core/device";

const UA = {
  iPhone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1",
  iPadDesktop:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15",
  pixel:
    "Mozilla/5.0 (Linux; Android 16; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
  samsung:
    "Mozilla/5.0 (Linux; Android 16; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36",
  edge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0",
  firefoxLinux: "Mozilla/5.0 (X11; Linux x86_64; rv:144.0) Gecko/20100101 Firefox/144.0",
  chromeOS:
    "Mozilla/5.0 (X11; CrOS x86_64 16000.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  chromeIOS:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0 Mobile/15E148 Safari/604.1",
};

test.each([
  [UA.iPhone, 0, "Safari on iPhone", "iPhone"],
  [UA.iPadDesktop, 5, "Safari on iPad", "iPad"],
  [UA.iPadDesktop, 0, "Safari on Mac", "Mac"],
  [UA.pixel, 5, "Chrome on Android", "Android phone"],
  [UA.samsung, 5, "Samsung Internet on Android", "Android phone"],
  [UA.edge, 0, "Edge on Windows", "Windows PC"],
  [UA.firefoxLinux, 0, "Firefox on Linux", "Linux computer"],
  [UA.chromeOS, 0, "Chrome on ChromeOS", "Chromebook"],
  [UA.chromeIOS, 5, "Chrome on iPhone", "iPhone"],
  ["something else", 0, "Browser on Unknown", "This device"],
])("%s → %s", (ua, touch, label, name) => {
  const device = describeDevice(ua, touch);
  expect(uaLabel(device)).toBe(label);
  expect(defaultDeviceName(device)).toBe(name);
});
