function waitForNextPoll(signal) {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    function abort() {
      window.clearTimeout(pollTimer);
      reject(signal.reason);
    }
    const pollTimer = window.setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, 2000);
    signal.addEventListener('abort', abort, { once: true });
  });
}

export async function requestScanResult(mode, region, language, controller, onPhase) {
  const { signal } = controller;
  const failure = mode.startsWith('consolidation-')
    ? 'Pemindaian konsolidasi gagal. Coba lagi nanti.'
    : 'Pemindaian breakout gagal. Coba lagi nanti.';
  let deadline;
  try {
    const query = new URLSearchParams({ mode, region, lang: language });
    const start = await fetch(`/.netlify/functions/breakout-start?${query}`, { method: 'POST', signal });
    const job = await start.json().catch(() => null);
    signal.throwIfAborted();
    if (!start.ok || !job?.jobId) throw new Error(job?.error || failure);
    deadline = window.setTimeout(() => controller.abort(new DOMException('Pemindaian terlalu lama. Coba lagi.', 'TimeoutError')), job.waitMs ?? 150_000);
    const statusUrl = `/.netlify/functions/breakout-status?${new URLSearchParams({ jobId: job.jobId })}`;
    while (true) {
      await waitForNextPoll(signal);
      const response = await fetch(statusUrl, { signal, cache: 'no-store' });
      const payload = await response.json().catch(() => null);
      signal.throwIfAborted();
      if (!response.ok || !payload || payload.status === 'error') throw new Error(payload?.error || failure);
      if (payload.status === 'done') {
        if (!payload.result) throw new Error(failure);
        return payload.result;
      }
      if (payload.status === 'pending' || payload.status === 'running') onPhase?.(payload.status);
    }
  } catch (error) {
    if (signal.aborted) throw signal.reason;
    throw error instanceof TypeError ? new Error(failure) : error;
  } finally {
    window.clearTimeout(deadline);
  }
}
