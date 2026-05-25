import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const MENU_GAP = 6;
const VIEWPORT_PADDING = 8;

export function useFloatingDropdown(open, anchorRef) {
  const menuRef = useRef(null);
  const [coords, setCoords] = useState(null);

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) {
      return;
    }

    const rect = anchor.getBoundingClientRect();
    const menu = menuRef.current;
    const menuHeight = menu?.offsetHeight ?? 0;
    const menuWidth = menu?.offsetWidth ?? 168;

    const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_PADDING;
    const spaceAbove = rect.top - VIEWPORT_PADDING;
    const openUp =
      menuHeight > 0
        ? spaceBelow < menuHeight + MENU_GAP && spaceAbove >= menuHeight + MENU_GAP
        : spaceBelow < 180 && spaceAbove > spaceBelow;

    let top = openUp ? rect.top - MENU_GAP : rect.bottom + MENU_GAP;
    let transform = openUp ? 'translateY(-100%)' : 'none';

    let left = rect.left;
    const maxLeft = window.innerWidth - menuWidth - VIEWPORT_PADDING;
    if (left > maxLeft) {
      left = Math.max(VIEWPORT_PADDING, maxLeft);
    }
    if (left < VIEWPORT_PADDING) {
      left = VIEWPORT_PADDING;
    }

    setCoords({ top, left, transform });
  }, [anchorRef]);

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return undefined;
    }

    updatePosition();
    const frame = requestAnimationFrame(updatePosition);

    const handleScrollOrResize = () => updatePosition();
    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
    };
  }, [open, updatePosition]);

  useLayoutEffect(() => {
    if (!open) {
      return undefined;
    }
    updatePosition();
    const frame = requestAnimationFrame(() => {
      updatePosition();
      requestAnimationFrame(updatePosition);
    });

    const menu = menuRef.current;
    if (!menu || typeof ResizeObserver === 'undefined') {
      return () => cancelAnimationFrame(frame);
    }

    const observer = new ResizeObserver(() => updatePosition());
    observer.observe(menu);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [open, updatePosition]);

  return { menuRef, coords, updatePosition };
}

export function FloatingDropdownMenu({
  open,
  anchorRef,
  menuRef,
  coords,
  className = '',
  role = 'listbox',
  ariaLabel,
  children,
}) {
  if (!open || !coords || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div
      ref={menuRef}
      className={`toolbar-dropdown-menu is-floating ${className}`.trim()}
      role={role}
      aria-label={ariaLabel}
      style={{
        position: 'fixed',
        top: coords.top,
        left: coords.left,
        transform: coords.transform,
        zIndex: 2000,
      }}
    >
      {children}
    </div>,
    document.body,
  );
}

export function isOutsideFloatingDropdown(event, anchorRef, menuRef) {
  const target = event.target;
  if (!(target instanceof Node)) {
    return true;
  }
  if (anchorRef.current?.contains(target)) {
    return false;
  }
  if (menuRef.current?.contains(target)) {
    return false;
  }
  return true;
}
