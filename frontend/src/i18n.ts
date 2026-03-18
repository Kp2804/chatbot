import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";
import hi from "./locales/hi.json";

export type AppLanguage = "en" | "hi";

const resources = {
  en: { translation: en },
  hi: { translation: hi },
} as const;

const storedLang =
  typeof window !== "undefined" && window.localStorage.getItem("app_lang") === "hi"
    ? "hi"
    : "en";

i18n.use(initReactI18next).init({
  resources,
  lng: storedLang,
  fallbackLng: "en",
  supportedLngs: ["en", "hi"],
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
