// The loading mark lives in index.html so it paints before any script runs. It only
// fades in if loading passes ~0.4s, so a fast start never shows it.

export function hideSplash(): void {
  const el = document.getElementById('splash');
  if (!el) return;
  el.classList.add('splash--out');
  setTimeout(() => el.remove(), 250);
}
