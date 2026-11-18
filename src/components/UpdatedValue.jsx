import { useLayoutEffect, useRef } from 'react';

export default function UpdatedValue({ as: Element = 'span', value, format }) {
  const node = useRef(null);
  const previousValue = useRef(null);
  const text = format(value);
  const displayedValue = Number.isFinite(value) ? text : null;

  useLayoutEffect(() => {
    if (displayedValue == null) {
      previousValue.current = null;
      return;
    }
    const previous = previousValue.current;
    previousValue.current = { value, text: displayedValue };

    const element = node.current;
    if (!previous || previous.value === value || previous.text === displayedValue || !element?.animate) return;
    const style = getComputedStyle(element);
    const duration = Number.parseFloat(style.getPropertyValue('--motion-standard'));
    if (!duration) return;

    const animation = element.animate(
      [{ backgroundColor: 'var(--workspace-action-soft)' }, { backgroundColor: 'transparent' }],
      { duration, easing: style.getPropertyValue('--motion-ease').trim() },
    );
    return () => animation.cancel();
  }, [displayedValue, value]);

  return <Element ref={node} className="updated-value">{text}</Element>;
}
