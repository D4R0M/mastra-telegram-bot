import type { TelegramWebApp } from "./types";

const INIT_DATA_STORAGE_KEY = "mastra:practice:init-data";

let cachedInitData: string | null = null;
let mainButtonHandler: (() => void) | null = null;
let backButtonHandler: (() => void) | null = null;
let themeListener: (() => void) | null = null;

function getWebApp(): TelegramWebApp | undefined {
  return window.Telegram?.WebApp;
}

function persistInitData(value: string) {
  cachedInitData = value;
  try {
    window.sessionStorage.setItem(INIT_DATA_STORAGE_KEY, value);
  } catch {
    try {
      window.localStorage.setItem(INIT_DATA_STORAGE_KEY, value);
    } catch {
      // ignore storage errors (private mode, quota, etc.)
    }
  }
}

function readPersistedInitData(): string | null {
  try {
    const fromSession = window.sessionStorage.getItem(INIT_DATA_STORAGE_KEY);
    if (fromSession) {
      return fromSession;
    }
  } catch {
    // ignore storage errors
  }

  try {
    return window.localStorage.getItem(INIT_DATA_STORAGE_KEY);
  } catch {
    return null;
  }
}

function extractInitDataFromLocation(): string | null {
  const parse = (value: string | null | undefined) => {
    if (!value) return null;
    const trimmed = value.startsWith("?") || value.startsWith("#") ? value.slice(1) : value;
    if (!trimmed) return null;
    const params = new URLSearchParams(trimmed);
    return (
      params.get("tgWebAppData") ||
      params.get("tg_web_app_data") ||
      params.get("initData") ||
      params.get("init_data") ||
      null
    );
  };

  return parse(window.location.hash) || parse(window.location.search);
}

export function getInitData(): string {
  if (cachedInitData) {
    return cachedInitData;
  }

  const fromWebApp = getWebApp()?.initData;
  if (fromWebApp && fromWebApp.length > 0) {
    persistInitData(fromWebApp);
    return fromWebApp;
  }

  const fromLocation = extractInitDataFromLocation();
  if (fromLocation && fromLocation.length > 0) {
    persistInitData(fromLocation);
    return fromLocation;
  }

  const stored = readPersistedInitData();
  if (stored) {
    cachedInitData = stored;
    return stored;
  }

  return "";
}

export function applyTheme(webApp: TelegramWebApp | undefined = getWebApp()) {
  if (!webApp) return;
  const params = webApp.themeParams || {};
  const root = document.documentElement;

  Object.entries(params).forEach(([key, value]) => {
    if (typeof value === "string") {
      const hyphenKey = key.replace(/_/g, "-");
      root.style.setProperty(`--tg-${key}`, value);
      if (hyphenKey !== key) {
        root.style.setProperty(`--tg-${hyphenKey}`, value);
      }
    }
  });

  if (params.bg_color) {
    document.body.style.backgroundColor = params.bg_color;
  }
  if (params.text_color) {
    document.body.style.color = params.text_color;
  }
}

export function initTelegram(onBack?: () => void) {
  const webApp = getWebApp();
  if (!webApp) {
    return;
  }

  if (webApp.initData && webApp.initData.length > 0) {
    persistInitData(webApp.initData);
  }

  webApp.ready();
  webApp.expand();
  applyTheme(webApp);

  if (webApp.onEvent) {
    themeListener = () => applyTheme(webApp);
    webApp.onEvent("themeChanged", themeListener);
  }

  if (onBack) {
    registerBackButton(onBack);
  }
}

export function configureMainButton(options: {
  text: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  const webApp = getWebApp();
  if (!webApp) return;
  const button = webApp.MainButton;

  if (mainButtonHandler) {
    button.offClick(mainButtonHandler);
  }

  mainButtonHandler = options.onClick;
  button.setParams({
    text: options.text,
    is_active: options.disabled ? false : true,
    is_visible: true,
  });
  if (options.disabled) {
    if (typeof button.showProgress === "function") {
      button.showProgress(false);
    }
  } else if (typeof button.hideProgress === "function") {
    button.hideProgress();
  }
  button.show();
  button.onClick(options.onClick);
}

export function hideMainButton() {
  const webApp = getWebApp();
  if (!webApp) return;
  const button = webApp.MainButton;
  if (mainButtonHandler) {
    button.offClick(mainButtonHandler);
    mainButtonHandler = null;
  }
  if (typeof button.hideProgress === "function") {
    button.hideProgress();
  }
  button.hide();
}

export function registerBackButton(onClick: () => void) {
  const webApp = getWebApp();
  if (!webApp) return;
  const backButton = webApp.BackButton;
  if (backButtonHandler) {
    backButton.offClick(backButtonHandler);
  }
  backButtonHandler = onClick;
  backButton.show();
  backButton.onClick(onClick);
}

export function hideBackButton() {
  const webApp = getWebApp();
  if (!webApp) return;
  const backButton = webApp.BackButton;
  if (backButtonHandler) {
    backButton.offClick(backButtonHandler);
    backButtonHandler = null;
  }
  backButton.hide();
}

export function teardownTelegram() {
  const webApp = getWebApp();
  if (!webApp) return;
  hideMainButton();
  hideBackButton();
  if (themeListener && webApp.offEvent) {
    webApp.offEvent("themeChanged", themeListener);
  }
  themeListener = null;
}
