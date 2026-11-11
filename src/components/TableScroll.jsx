import { useEffect, useId, useRef, useState } from 'react';

export default function TableScroll({ label, className, children }) {
  const scrollRef = useRef(null);
  const hintId = useId();
  const [overflow, setOverflow] = useState(false);

  useEffect(() => {
    const region = scrollRef.current;
    const measure = () => setOverflow(region.scrollWidth > region.clientWidth);
    const observer = new ResizeObserver(measure);
    observer.observe(region);
    if (region.firstElementChild) observer.observe(region.firstElementChild);
    measure();
    return () => observer.disconnect();
  }, []);

  return (
    <>
      {overflow && <p className="table-scroll-hint" id={hintId}>Geser tabel untuk melihat kolom lain.</p>}
      <div
        ref={scrollRef}
        className={className ? `table-scroll ${className}` : 'table-scroll'}
        tabIndex={overflow ? 0 : undefined}
        role="region"
        aria-label={label}
        aria-describedby={overflow ? hintId : undefined}
      >
        {children}
      </div>
    </>
  );
}
