import { useCallback, useRef } from 'react';

const LONG_PRESS_MS = 500;
const MOVE_CANCEL_PX = 8;

export function useSlotActivation(onActivate: () => void, disabled: boolean) {
  const timerRef = useRef<number | null>(null);
  const originRef = useRef<{ x: number; y: number } | null>(null);
  const suppressClickRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const handleDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      if (disabled) {
        return;
      }
      event.preventDefault();
      onActivate();
    },
    [disabled, onActivate]
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (disabled || event.pointerType === 'mouse') {
        return;
      }
      originRef.current = { x: event.clientX, y: event.clientY };
      clearTimer();
      timerRef.current = window.setTimeout(() => {
        suppressClickRef.current = true;
        onActivate();
        clearTimer();
      }, LONG_PRESS_MS);
    },
    [clearTimer, disabled, onActivate]
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (!originRef.current || timerRef.current === null) {
        return;
      }
      const dx = event.clientX - originRef.current.x;
      const dy = event.clientY - originRef.current.y;
      if (Math.hypot(dx, dy) > MOVE_CANCEL_PX) {
        clearTimer();
        originRef.current = null;
      }
    },
    [clearTimer]
  );

  const handlePointerEnd = useCallback(() => {
    clearTimer();
    originRef.current = null;
  }, [clearTimer]);

  const handleClick = useCallback((event: React.MouseEvent) => {
    if (suppressClickRef.current) {
      event.preventDefault();
      suppressClickRef.current = false;
    }
  }, []);

  return {
    onDoubleClick: handleDoubleClick,
    onPointerDown: handlePointerDown,
    onPointerMove: handlePointerMove,
    onPointerUp: handlePointerEnd,
    onPointerCancel: handlePointerEnd,
    onClick: handleClick,
  };
}
