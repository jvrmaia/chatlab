import type { JSX } from "react";
import { useTranslation } from "react-i18next";

type SupportedLocale = "en-US" | "pt-BR";

function normalize(lng: string): SupportedLocale {
  return lng.toLowerCase().startsWith("pt") ? "pt-BR" : "en-US";
}

export function LocaleToggle(): JSX.Element {
  const { t, i18n } = useTranslation();
  const current = normalize(i18n.language);

  function pick(next: SupportedLocale): void {
    void i18n.changeLanguage(next);
  }

  return (
    <div className="tabs" role="group" aria-label={t("locale.toggleAria")}>
      <button
        type="button"
        className="tab"
        aria-pressed={current === "en-US"}
        onClick={() => pick("en-US")}
      >
        EN
      </button>
      <button
        type="button"
        className="tab"
        aria-pressed={current === "pt-BR"}
        onClick={() => pick("pt-BR")}
      >
        PT
      </button>
    </div>
  );
}
