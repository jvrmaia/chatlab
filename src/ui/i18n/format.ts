import { useTranslation } from "react-i18next";

export function useLocaleFormat(): {
  formatTime: (date: Date | string | number) => string;
  formatDateTime: (date: Date | string | number) => string;
  formatTimeWithSeconds: (date: Date | string | number) => string;
} {
  const { i18n } = useTranslation();
  const locale = i18n.language || undefined;

  return {
    formatTime: (date) =>
      new Date(date).toLocaleTimeString(locale, {
        hour: "2-digit",
        minute: "2-digit",
      }),
    formatTimeWithSeconds: (date) =>
      new Date(date).toLocaleTimeString(locale, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }),
    formatDateTime: (date) => new Date(date).toLocaleString(locale),
  };
}
