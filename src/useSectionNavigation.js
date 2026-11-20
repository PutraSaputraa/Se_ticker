import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

function reducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default function useSectionNavigation(ids, navRef, additionalAnchors = ids) {
  const [active, setActive] = useState(ids[0]);
  const navigate = useNavigate();
  const { hash, pathname, search, state } = useLocation();
  const explicitTarget = useRef(null);

  const scrollToSection = useCallback((id, { focus = false, smooth = false } = {}) => {
    const element = document.getElementById(id);
    if (!element) return false;
    element.scrollIntoView({ block: 'start', behavior: smooth && !reducedMotion() ? 'smooth' : 'instant' });
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
    if (!additionalAnchors.includes(id)) return;
    const frame = requestAnimationFrame(() => {
      scrollToSection(id, { focus: explicit, smooth: explicit });
    });
    return () => cancelAnimationFrame(frame);
  }, [hash, additionalAnchors, scrollToSection]);

  useEffect(() => {
    const nav = navRef.current;
    const page = nav.parentElement;
    const root = document.documentElement;
    const sections = ids.map((id) => document.getElementById(id)).filter(Boolean);
    let offsets = [];
    let clearance = 0;
    let scrollEnd = 0;
    let current = ids[0];

    function update() {
      const y = window.scrollY;
      const atEnd = scrollEnd > 2 && y >= scrollEnd - 2;
      const index = atEnd ? sections.length - 1 : offsets.findLastIndex((offset) => offset <= y + clearance);
      const id = sections[Math.max(0, index)].id;
      if (id === current) return;
      current = id;
      setActive(id);
    }

    function measure() {
      const height = nav.offsetHeight;
      const y = window.scrollY;
      clearance = (Number.parseFloat(getComputedStyle(root).scrollPaddingBlockStart) || 0) + height + 2;
      offsets = sections.map((section) => section.getBoundingClientRect().top + y);
      scrollEnd = root.scrollHeight - window.innerHeight;
      page.style.setProperty('--journal-nav-height', height + 'px');
      update();
    }

    // The passive scroll listener uses cached coordinates. Section resizing can
    // move subsequent sections even when the viewport stays the same size.
    const observer = new ResizeObserver(measure);
    for (const element of [page, nav, ...sections]) observer.observe(element);
    const header = document.querySelector('.workspace-bar');
    if (header) observer.observe(header);
    measure();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', measure);
      page.style.removeProperty('--journal-nav-height');
    };
  }, [ids, navRef]);

  useEffect(() => {
    const link = navRef.current?.querySelector('[aria-current="location"]');
    if (!link) return;
    const list = link.parentElement;
    const bounds = list.getBoundingClientRect();
    const item = link.getBoundingClientRect();
    if (item.left < bounds.left || item.right > bounds.right) {
      list.scrollBy({
        left: item.left - bounds.left - (list.clientWidth - item.width) / 2,
        behavior: reducedMotion() ? 'instant' : 'smooth',
      });
    }
  }, [active, navRef]);

  return { active, handleClick };
}
