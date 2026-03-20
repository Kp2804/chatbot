
import { createRoot } from "react-dom/client";
import App from "./app/App";
import "./i18n";
import "./styles/index.css";

const savedTheme = localStorage.getItem("darkMode");
const shouldUseDark = savedTheme === null ? true : JSON.parse(savedTheme);

if (shouldUseDark) {
	document.documentElement.classList.add("dark");
} else {
	document.documentElement.classList.remove("dark");
}

createRoot(document.getElementById("root")!).render(<App />);
