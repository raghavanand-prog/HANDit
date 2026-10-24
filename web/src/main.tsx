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
