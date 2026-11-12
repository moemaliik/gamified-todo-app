// Sequential toast queue — never shows two toasts simultaneously, per
// @ux-designer's "never stack level-up toasts" requirement. One toast is
// dismissed (after its dwell time) before the next is shown.
import { useCallback, useRef, useState } from 'react';

const DWELL_MS = 1600;

export default function useToastQueue() {
  const [toasts, setToasts] = useState([]); // currently just [current] or []
  const queueRef = useRef([]);
  const showingRef = useRef(false);

  const showNext = useCallback(() => {
    if (showingRef.current) return;
    const next = queueRef.current.shift();
    if (!next) return;
    showingRef.current = true;
    setToasts([next]);
    setTimeout(() => {
      setToasts([]);
      showingRef.current = false;
      showNext();
    }, DWELL_MS);
  }, []);

  const pushToast = useCallback((toast) => {
    queueRef.current.push({ id: crypto.randomUUID(), ...toast });
    showNext();
  }, [showNext]);

  return { toasts, pushToast };
}
