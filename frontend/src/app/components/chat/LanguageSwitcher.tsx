import { AppLanguage } from "../../../i18n";
import { useTranslation } from "react-i18next";

interface LanguageSwitcherProps {
  language: AppLanguage;
  onChange: (language: AppLanguage) => void;
  className?: string;
}

export function LanguageSwitcher({ language, onChange, className = "" }: LanguageSwitcherProps) {
  const { t } = useTranslation();

  return (
    <label className={`flex items-center gap-2 ${className}`}>
      <span className="text-gray-700 dark:text-gray-400" style={{ fontSize: "0.7rem" }}>
        {t("common.language")}
      </span>
      <select
        value={language}
        onChange={(event) => onChange(event.target.value as AppLanguage)}
        className="bg-gray-100 dark:bg-white/5 border border-gray-300 dark:border-white/8 rounded-lg px-2 py-1 text-gray-800 dark:text-gray-200"
        style={{ fontSize: "0.72rem" }}
      >
        <option value="en">{t("common.english")}</option>
        <option value="hi">{t("common.hindi")}</option>
      </select>
    </label>
  );
}
