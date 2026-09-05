import { useEffect, useRef, useState } from 'react';

/**
 * Custom hook providing an ecommerce-style sticky sidebar behavior.
 *
 * - Takes full natural height (no artificial max-height cutoffs or nested scrollbars).
 * - If the sidebar fits within the viewport, it stays sticky at topOffset.
 * - If the sidebar is taller than the viewport, it scrolls naturally with the page
 *   until its bottom end comes into view, and then sticks to the bottom.
 * - Scrolling back up naturally reveals the top before sticking to the top.
 */
export function useStickySidebar(topOffset = 68, bottomOffset = 24) {
  const sidebarRef = useRef<HTMLDivElement>(null);
  const [stickyStyle, setStickyStyle] = useState<React.CSSProperties>({
    position: 'sticky',
    top: `${topOffset}px`,
  });

  useEffect(() => {
    let lastScrollY = window.scrollY;
    let currentTop = topOffset;
    let rafId: number | null = null;

    const update = () => {
      const el = sidebarRef.current;
      if (!el) return;

      const sidebarHeight = el.offsetHeight;
      const windowHeight = window.innerHeight;
      const availableHeight = windowHeight - topOffset - bottomOffset;

      // When the sidebar fits comfortably in the viewport, stick at top offset
      if (sidebarHeight <= availableHeight) {
        currentTop = topOffset;
        setStickyStyle({
          position: 'sticky',
          top: `${topOffset}px`,
        });
        return;
      }

      // When the sidebar is taller than the viewport:
      const scrollY = window.scrollY;
      const deltaY = scrollY - lastScrollY;
      lastScrollY = scrollY;

      const minTop = windowHeight - sidebarHeight - bottomOffset; // bottom-aligned sticky offset
      const maxTop = topOffset; // top-aligned sticky offset

      // Move top position with scroll delta, clamped between minTop (bottom visible) and maxTop (top visible)
      currentTop = Math.min(maxTop, Math.max(minTop, currentTop - deltaY));

      setStickyStyle({
        position: 'sticky',
        top: `${currentTop}px`,
      });
    };

    const handleScrollOrResize = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(update);
    };

    window.addEventListener('scroll', handleScrollOrResize, { passive: true });
    window.addEventListener('resize', handleScrollOrResize, { passive: true });

    // Observe changes in sidebar's own content/height (dynamic error banners, inputs, etc.)
    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && sidebarRef.current) {
      resizeObserver = new ResizeObserver(() => {
        handleScrollOrResize();
      });
      resizeObserver.observe(sidebarRef.current);
    }

    // Run initial layout calculation
    update();

    return () => {
      window.removeEventListener('scroll', handleScrollOrResize);
      window.removeEventListener('resize', handleScrollOrResize);
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (resizeObserver) resizeObserver.disconnect();
    };
  }, [topOffset, bottomOffset]);

  return { sidebarRef, stickyStyle };
}
