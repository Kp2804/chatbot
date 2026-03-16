/**
 * @file main.tsx
 * @description The root entry point for the React application. Mounts the App component 
 * into the DOM and imports global CSS styles.
 */
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
