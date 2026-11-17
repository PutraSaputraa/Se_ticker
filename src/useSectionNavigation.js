import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

function clearance() {
  // Computed scroll padding resolves rem/calc to pixels, unlike parsing tokens.
  return Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingBlockStart) || 0;
}

function reducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default function useSectionNavigation(ids) {
  const [active, setActive] = useState(ids[0]);
  const navigate = useNavigate();
  const { hash, pathname, search, state } = useLocation();
  const explicitTarget = useRef(null);
  const key = ids.join(',');

  const scrollToSection = useCallback((id, { focus = false, smooth = false } = {}) => {
    const element = document.getElementById(id);
    if (!element) return false;
    const top = Math.max(0, element.getBoundingClientRect().top + window.scrollY - clearance());
    window.scrollTo({ top, behavior: smooth && !reducedMotion() ? 'smooth' : 'instant' });
    if (focus) {
      const heading = document.getElementById(element.getAttribute('aria-labelledby'));
      (heading ?? element).focus({ preventScroll: true });
    }
    return true;
  }, []);

  const handleClick = useCallback((event, id) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
      || !document.getElementById(id)) return;
    event.preventDefault();
    if (hash === `#${id}`) scrollToSection(id, { focus: true, smooth: true });
    else {
      explicitTarget.current = id;
      navigate({ pathname, search, hash: `#${id}` }, { state });
    }
  }, [hash, navigate, pathname, search, state, scrollToSection]);

  useEffect(() => {
    const id = hash.slice(1);
    const explicit = explicitTarget.current === id;
    explicitTarget.current = null;
    if (!ids.includes(id)) return;
    const frame = requestAnimationFrame(() => {
      scrollToSection(id, { focus: explicit, smooth: explicit });
    });
    return () => cancelAnimationFrame(frame);
    // ids are represented by their stable contents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hash, key, scrollToSection]);

  useEffect(() => {
    let frame = 0;
    function update() {
      frame = 0;
      const root = document.documentElement;
      const line = clearance() + 2;
      const scrollable = root.scrollHeight > window.innerHeight + 2;
      const bottom = scrollable && window.scrollY + window.innerHeight >= root.scrollHeight - 2;
      let current = ids[0];
      for (const id of ids) {
        const element = document.getElementById(id);
        if (element && (bottom || element.getBoundingClientRect().top <= line)) current = id;
      }
      setActive(current);
    }
    function schedule() {
      if (!frame) frame = requestAnimationFrame(update);
    }
    // Account content and wallet history can change section positions without
    // a window resize. Reconcile the indicator without moving scroll or focus.
    const observer = new ResizeObserver(schedule);
    for (const id of ids) {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    }
    const header = document.querySelector('.workspace-bar');
    if (header) observer.observe(header);
    schedule();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { active, handleClick };
}
