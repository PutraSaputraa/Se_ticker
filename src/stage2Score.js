export function getStage2Score(passed, total) {
  if (!Number.isSafeInteger(passed) || !Number.isSafeInteger(total)
    || total <= 0 || passed < 0 || passed > total) return null;

  const ratio = passed / total;
  let tone = 'negative';
  if (ratio >= 0.75) tone = 'positive';
  else if (ratio >= 0.5) tone = 'warning';
  return { ratio, tone };
}
