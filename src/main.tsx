import { createRoot } from "react-dom/client";

// Self-hosted fonts — no external CDN (privacy/GDPR + offline-first).
// Latin subset covers æøå. Only the weights we actually use are imported.
// Spectral (display): 300 / 400 / 500 / 600 + italic 400 / 500.
import "@fontsource/spectral/latin-300.css";
import "@fontsource/spectral/latin-400.css";
import "@fontsource/spectral/latin-500.css";
import "@fontsource/spectral/latin-600.css";
import "@fontsource/spectral/latin-400-italic.css";
import "@fontsource/spectral/latin-500-italic.css";
// Public Sans (body / UI): 400 / 500 / 600 / 700.
import "@fontsource/public-sans/latin-400.css";
import "@fontsource/public-sans/latin-500.css";
import "@fontsource/public-sans/latin-600.css";
import "@fontsource/public-sans/latin-700.css";

import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
