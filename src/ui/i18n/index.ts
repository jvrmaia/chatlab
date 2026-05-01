import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

import enUS from "./locales/en-US.json";
import ptBR from "./locales/pt-BR.json";

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: "en-US",
    supportedLngs: ["en-US", "pt-BR"],
    resources: {
      "en-US": { translation: enUS },
      "pt-BR": { translation: ptBR },
    },
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: "i18nextLng",
      convertDetectedLanguage: (lng: string): string =>
        lng.toLowerCase().startsWith("pt") ? "pt-BR" : "en-US",
    },
    react: { useSuspense: false },
  })
  .catch((err) => {
    console.error("i18n init failed", err);
  });

export default i18n;
