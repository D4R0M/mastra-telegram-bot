import type { TelegramWebApp } from "./types";

let mainButtonHandler: (() => void) | null = null;
let backButtonHandler: (() => void) | null = null;
let themeListener: (() => void) | null = null;

function getWebApp(): TelegramWebApp | undefined {
  return window.Telegram?.WebApp;
}

export function getInitData(): string {
  return getWebApp()?.initData ?? "";
}

export function applyTheme(webApp: TelegramWebApp | undefined = getWebApp()) {
  if (!webApp) return;
  const params = webApp.themeParams || {};
  const root = document.documentElement;

  Object.entries(params).forEach(([key, value]) => {
    if (typeof value === "string") {
      root.style.setProperty(`--tg-${key.replace(/_/g, "-")}`, value);
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
