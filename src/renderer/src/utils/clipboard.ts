/** Copies user-visible text without exposing any UI metadata to the clipboard. */
export async function copyTextToClipboard(text: string): Promise<void> {
  if (!text) throw new Error('There is no text to copy.');

  try {
    const nativeResult = await window.fridayAPI?.copyText(text);
    if (nativeResult?.success) return;
  } catch {
    // Try the browser clipboard below.
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {
    // Try the legacy DOM fallback below.
  }

  const helper = document.createElement('textarea');
  helper.value = text;
  helper.setAttribute('readonly', '');
  helper.style.position = 'fixed';
  helper.style.opacity = '0';
  document.body.appendChild(helper);
  helper.select();

  try {
    if (!document.execCommand('copy')) {
      throw new Error('Clipboard access is unavailable.');
    }
  } finally {
    helper.remove();
  }
}
