import { useEffect, useRef, useState, useCallback } from 'react';

const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const WARNING_DURATION_MS = 2 * 60 * 1000; // 2 minutes warning
const BROADCAST_CHANNEL_NAME = 'idle-timeout-sync';
const STORAGE_KEY = 'idle-last-activity';

const ACTIVITY_EVENTS: (keyof DocumentEventMap)[] = [
  'mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click',
];

interface UseIdleTimeoutOptions {
  onTimeout: () => void;
  enabled?: boolean;
  idleMs?: number;
  warningMs?: number;
}

interface UseIdleTimeoutReturn {
  showWarning: boolean;
  remainingSeconds: number;
  dismissWarning: () => void;
}

export function useIdleTimeout({
  onTimeout,
  enabled = true,
  idleMs = IDLE_TIMEOUT_MS,
  warningMs = WARNING_DURATION_MS,
}: UseIdleTimeoutOptions): UseIdleTimeoutReturn {
  const [showWarning, setShowWarning] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(Math.floor(warningMs / 1000));

  // Use refs to avoid stale closures
  const showWarningRef = useRef(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const warningTimerRef = useRef<ReturnType<typeof setInterval>>();
  const warningStartRef = useRef<number>(0);
  const onTimeoutRef = useRef(onTimeout);
  onTimeoutRef.current = onTimeout;

  const startWarningCountdown = useCallback(() => {
    showWarningRef.current = true;
    setShowWarning(true);
    warningStartRef.current = Date.now();
    setRemainingSeconds(Math.floor(warningMs / 1000));

    warningTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - warningStartRef.current;
      const remaining = Math.max(0, Math.floor((warningMs - elapsed) / 1000));
      setRemainingSeconds(remaining);

      if (remaining <= 0) {
        if (warningTimerRef.current) clearInterval(warningTimerRef.current);
        onTimeoutRef.current();
      }
    }, 1000);
  }, [warningMs]);

  const resetIdleTimer = useCallback(() => {
    if (!enabled) return;

    // Clear existing timers
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (warningTimerRef.current) clearInterval(warningTimerRef.current);

    // Dismiss warning if showing
    if (showWarningRef.current) {
      showWarningRef.current = false;
      setShowWarning(false);
      setRemainingSeconds(Math.floor(warningMs / 1000));
    }

    // Start idle timer
    idleTimerRef.current = setTimeout(startWarningCountdown, idleMs);
  }, [enabled, idleMs, warningMs, startWarningCountdown]);

  const dismissWarning = useCallback(() => {
    if (warningTimerRef.current) clearInterval(warningTimerRef.current);
    showWarningRef.current = false;
    setShowWarning(false);
    setRemainingSeconds(Math.floor(warningMs / 1000));
    resetIdleTimer();
    // Broadcast activity to other tabs
    try { localStorage.setItem(STORAGE_KEY, String(Date.now())); } catch {}
  }, [warningMs, resetIdleTimer]);

  useEffect(() => {
    if (!enabled) return;

    resetIdleTimer();

    // Activity handler uses ref to avoid stale closure
    const handler = () => {
      if (!showWarningRef.current) {
        resetIdleTimer();
        // Broadcast activity to other tabs
        try { localStorage.setItem(STORAGE_KEY, String(Date.now())); } catch {}
      }
    };

    ACTIVITY_EVENTS.forEach(e => document.addEventListener(e, handler, { passive: true }));

    // Multi-tab sync via storage events
    const storageHandler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        // Another tab had activity — reset our timer
        if (!showWarningRef.current) {
          resetIdleTimer();
        } else {
          // Another tab dismissed the warning
          if (warningTimerRef.current) clearInterval(warningTimerRef.current);
          showWarningRef.current = false;
          setShowWarning(false);
          setRemainingSeconds(Math.floor(warningMs / 1000));
          resetIdleTimer();
        }
      }
    };
    window.addEventListener('storage', storageHandler);

    return () => {
      ACTIVITY_EVENTS.forEach(e => document.removeEventListener(e, handler));
      window.removeEventListener('storage', storageHandler);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (warningTimerRef.current) clearInterval(warningTimerRef.current);
    };
  }, [enabled, resetIdleTimer, warningMs]);

  return { showWarning, remainingSeconds, dismissWarning };
}
