export async function writeClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Plain HTTP deployments or browser permissions may require the fallback.
    }
  }

  const previousFocus = document.activeElement as HTMLElement | null;
  const selection = window.getSelection();
  const ranges = selection ? Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index).cloneRange()) : [];
  const input = document.createElement('textarea');
  input.value = text;
  input.readOnly = true;
  input.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
  document.body.appendChild(input);
  try {
    input.focus({ preventScroll: true });
    input.select();
    if (!document.execCommand('copy')) throw new Error('Clipboard unavailable');
  } finally {
    input.remove();
    previousFocus?.focus({ preventScroll: true });
    if (selection && ranges.length) {
      selection.removeAllRanges();
      ranges.forEach(range => selection.addRange(range));
    }
  }
}
