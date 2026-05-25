import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const MENU_GAP = 6;
const VIEWPORT_PADDING = 8;

function coordsEqual(a, b) {
  if (!a || !b) {
    return a === b;
  }
  return a.top === b.top && a.left === b.left && a.transform === b.transform;
}

export function useFloatingDropdown(open, anchorRef) {
  const menuRef = useRef(null);
  const coordsRef = useRef(null);
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

    const next = { top, left, transform };
    if (coordsEqual(coordsRef.current, next)) {
      return;
    }

    coordsRef.current = next;
    setCoords(next);
  }, [anchorRef]);

  useLayoutEffect(() => {
    if (!open) {
      coordsRef.current = null;
      setCoords(null);
      return undefined;
    }

    updatePosition();
    const frame = requestAnimationFrame(() => {
      updatePosition();
      requestAnimationFrame(updatePosition);
    });

    const handleScrollOrResize = () => updatePosition();
    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);

    const menu = menuRef.current;
    let observer;
    if (menu && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => updatePosition());
      observer.observe(menu);
    }

    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
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
  if (!open || typeof document === 'undefined') {
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
        top: coords?.top ?? -9999,
        left: coords?.left ?? 0,
        transform: coords?.transform ?? 'none',
        visibility: coords ? 'visible' : 'hidden',
        zIndex: 3000,
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  );
}

function eventHitsDropdown(event, anchorRef, menuRef) {
  const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
  if (path.length > 0) {
    return path.includes(anchorRef.current) || path.includes(menuRef.current);
  }
  return !isOutsideFloatingDropdown(event, anchorRef, menuRef);
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

export function useDropdownDismiss(open, setOpen, anchorRef, menuRef) {
  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (eventHitsDropdown(event, anchorRef, menuRef)) {
        return;
      }
      setOpen(false);
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    // Defer so the same tap that opened the menu does not instantly close it.
    const attachTimer = window.setTimeout(() => {
      document.addEventListener('pointerdown', handlePointerDown, true);
    }, 0);

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(attachTimer);
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, anchorRef, menuRef, setOpen]);
}
