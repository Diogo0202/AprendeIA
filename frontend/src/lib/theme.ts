import type { AccentTheme } from '../types/app';

export function applyAccentTheme(theme: AccentTheme) {
  document.documentElement.dataset.accent = theme;
}

export function applyInterfaceTheme(theme: 'light' | 'dark') {
  document.documentElement.dataset.theme = theme;
  try {
    window.localStorage.setItem('aprendeia-interface-theme', theme);
  } catch {
    /* O tema funciona mesmo sem persistência. */
  }
}
