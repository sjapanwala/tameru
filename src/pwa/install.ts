// Captures Chrome/Android's beforeinstallprompt at boot, before <pwa-install> has loaded,
// so the install page can hand it over and still offer a one-tap install.

let deferred: BeforeInstallPromptEvent | null = null;

export function listenForInstallPrompt(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
  });
}

export const takeInstallPrompt = (): BeforeInstallPromptEvent | null => deferred;
