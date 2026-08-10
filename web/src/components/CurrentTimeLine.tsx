import { useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react';

interface CurrentTimeLineProps {
  visible: boolean;
  fraction: number;
  gridRef: RefObject<HTMLDivElement | null>;
  slotsStartRef: RefObject<HTMLDivElement | null>;
  slotsEndRef: RefObject<HTMLDivElement | null>;
  columnsStartRef: RefObject<HTMLElement | null>;
  columnsEndRef: RefObject<HTMLElement | null>;
}

export function CurrentTimeLine({
  visible,
  fraction,
  gridRef,
  slotsStartRef,
  slotsEndRef,
  columnsStartRef,
  columnsEndRef,
}: CurrentTimeLineProps) {
  const [style, setStyle] = useState<CSSProperties | null>(null);

  useLayoutEffect(() => {
    if (!visible) {
      setStyle(null);
      return;
    }

    let cancelled = false;
    let rafId = 0;

    function measure(): boolean {
      const grid = gridRef.current;
      const slotsStart = slotsStartRef.current;
      const slotsEnd = slotsEndRef.current;
      const columnsStart = columnsStartRef.current;
      const columnsEnd = columnsEndRef.current;
      if (!grid || !slotsStart || !slotsEnd || !columnsStart || !columnsEnd) {
        setStyle(null);
        return false;
      }

      const gridRect = grid.getBoundingClientRect();
      const slotsTop = slotsStart.getBoundingClientRect().top - gridRect.top;
      const slotsHeight =
        slotsEnd.getBoundingClientRect().bottom - slotsStart.getBoundingClientRect().top;
      const startRect = columnsStart.getBoundingClientRect();
      const endRect = columnsEnd.getBoundingClientRect();

      setStyle({
        top: slotsTop + fraction * slotsHeight,
        left: startRect.left - gridRect.left,
        width: endRect.right - startRect.left,
      });
      return true;
    }

    function scheduleMeasure() {
      if (cancelled) {
        return;
      }
      if (!measure()) {
        rafId = window.requestAnimationFrame(scheduleMeasure);
      }
    }

    scheduleMeasure();
    const observer = new ResizeObserver(scheduleMeasure);
    if (gridRef.current) {
      observer.observe(gridRef.current);
    }
    window.addEventListener('resize', scheduleMeasure);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(rafId);
      observer.disconnect();
      window.removeEventListener('resize', scheduleMeasure);
    };
  }, [visible, fraction, gridRef, slotsStartRef, slotsEndRef, columnsStartRef, columnsEndRef]);

  if (!visible || !style) {
    return null;
  }

  return (
    <div
      className="week-now-line"
      style={style}
      aria-hidden="true"
      data-testid="current-time-line"
    />
  );
}
