import { useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react';

interface CurrentTimeLineProps {
  visible: boolean;
  fraction: number;
  gridRef: RefObject<HTMLDivElement | null>;
  slotsStartRef: RefObject<HTMLDivElement | null>;
  slotsEndRef: RefObject<HTMLDivElement | null>;
  todayColumnRef: RefObject<HTMLDivElement | null>;
}

export function CurrentTimeLine({
  visible,
  fraction,
  gridRef,
  slotsStartRef,
  slotsEndRef,
  todayColumnRef,
}: CurrentTimeLineProps) {
  const [style, setStyle] = useState<CSSProperties | null>(null);

  useLayoutEffect(() => {
    if (!visible) {
      setStyle(null);
      return;
    }

    function measure() {
      const grid = gridRef.current;
      const slotsStart = slotsStartRef.current;
      const slotsEnd = slotsEndRef.current;
      const todayColumn = todayColumnRef.current;
      if (!grid || !slotsStart || !slotsEnd || !todayColumn) {
        setStyle(null);
        return;
      }

      const gridRect = grid.getBoundingClientRect();
      const slotsTop = slotsStart.getBoundingClientRect().top - gridRect.top;
      const slotsHeight =
        slotsEnd.getBoundingClientRect().bottom - slotsStart.getBoundingClientRect().top;
      const columnRect = todayColumn.getBoundingClientRect();

      setStyle({
        top: slotsTop + fraction * slotsHeight,
        left: columnRect.left - gridRect.left,
        width: columnRect.width,
      });
    }

    measure();
    const observer = new ResizeObserver(measure);
    if (gridRef.current) {
      observer.observe(gridRef.current);
    }
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [visible, fraction, gridRef, slotsStartRef, slotsEndRef, todayColumnRef]);

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
