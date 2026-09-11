import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import Scraps from "./Scraps";
import { useRoute } from "./router";
import "./styles.css";

function Root() {
  return useRoute() === "scraps" ? <Scraps /> : <App />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  addEventListener("load", () =>
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`),
  );
}
