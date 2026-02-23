import { useRef, useCallback } from "react";

/**
 * Prevents two pointer/keyboard interaction bugs in popup menus:
 *
 * 1. **Phantom hover on open** - When a menu appears under a stationary
 *    cursor, `mouseenter` would immediately highlight the item beneath it.
 *    We use `onPointerMove` instead, which only fires on real movement.
 *    A coordinate check guards against edge-case spurious events.
 *
 * 2. **Pointer fighting keyboard nav** - After the user switches to
 *    keyboard navigation (ArrowUp/Down), an accidental mouse micro-jiggle
 *    would snap the highlight back to the item under the cursor. Calling
 *    `suppressUntilMove()` from the keyboard handler ignores the very
 *    next `pointermove`, letting intentional movement resume naturally.
 *
 * @param setSelectedIndex - State setter for the highlighted item index
 * @returns `onItemPointerMove` to attach on each item, and
 *   `suppressUntilMove` to call from keyboard navigation handlers.
 */
export function usePointerStabilizer(
  setSelectedIndex: (index: number) => void
) {
  const lastPos = useRef({ x: 0, y: 0 });
  const suppressed = useRef(false);

  const onItemPointerMove = useCallback(
    (index: number, e: React.PointerEvent) => {
      const { clientX, clientY } = e;
      if (
        clientX === lastPos.current.x &&
        clientY === lastPos.current.y
      ) {
        return;
      }
      lastPos.current = { x: clientX, y: clientY };

      if (suppressed.current) {
        suppressed.current = false;
        return;
      }

      setSelectedIndex(index);
    },
    [setSelectedIndex]
  );

  const suppressUntilMove = useCallback(() => {
    suppressed.current = true;
  }, []);

  return { onItemPointerMove, suppressUntilMove };
}
