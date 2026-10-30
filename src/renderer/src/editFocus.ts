export function nativeEditing(): boolean {
  const target = document.activeElement
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target instanceof HTMLIFrameElement || (target instanceof HTMLElement && target.isContentEditable)
}

export function selectedText(): boolean {
  const selection = window.getSelection()
  return !!selection && !selection.isCollapsed && selection.toString().length > 0
}
