import { createRoot } from "react-dom/client";
import "./index.css";
import { takeLinkFromAddressBar } from "./core/link";
import { App } from "./ui/App";

// A code's link carries its secret after "#". Read it once, straight away, and replace
// the address with /j so the secret doesn't stay in the address bar or history.
const joinLink = location.pathname === "/j" ? takeLinkFromAddressBar(location, history) : null;

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");
createRoot(root).render(<App joinLink={joinLink} />);

// The installed app: a service worker keeps the page shell, so the app opens offline.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register("/sw.js").catch(() => {
    // Not available (private window, blocked): the site works the same without it.
  });
}
