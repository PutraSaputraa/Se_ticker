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

export async function requestScanStop(jobId) {
  const query = new URLSearchParams({ jobId });
  const response = await fetch(`/.netlify/functions/breakout-stop?${query}`, {
    method: 'POST',
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error('Gagal menghentikan pemindaian. Coba lagi.');
}

export async function requestScanResult(mode, region, language, controller, onStatus) {
  const { signal } = controller;
  let failure = 'Pemindaian breakout gagal. Coba lagi nanti.';
  if (mode.startsWith('consolidation-')) failure = 'Pemindaian konsolidasi gagal. Coba lagi nanti.';
  if (mode.startsWith('golden-cross-')) failure = 'Pemindaian Golden Cross gagal. Coba lagi nanti.';
  if (mode === 'falling-wedge') failure = 'Pemindaian Falling Wedge gagal. Coba lagi nanti.';
  let deadline;
  try {
    const query = new URLSearchParams({ mode, region, lang: language });
    const start = await fetch(`/.netlify/functions/breakout-start?${query}`, { method: 'POST', signal });
    const job = await start.json().catch(() => null);
    signal.throwIfAborted();
    if (!start.ok || !job?.jobId) throw new Error(job?.error || failure);
    deadline = window.setTimeout(() => controller.abort(new DOMException('Pemindaian terlalu lama. Coba lagi.', 'TimeoutError')), job.waitMs ?? 150_000);
    onStatus?.(job);
    const statusUrl = `/.netlify/functions/breakout-status?${new URLSearchParams({ jobId: job.jobId })}`;
    let pollFailures = 0;
    while (true) {
      await waitForNextPoll(signal);
      let response;
      try {
        response = await fetch(statusUrl, { signal, cache: 'no-store' });
        if (response.status >= 500) throw new Error(failure);
      } catch (error) {
        signal.throwIfAborted();
        pollFailures += 1;
        if (pollFailures >= 3) throw error;
        continue;
      }
      pollFailures = 0;
      const payload = await response.json().catch(() => null);
      signal.throwIfAborted();
      if (!response.ok || !payload) throw new Error(payload?.error || failure);
      if (payload.status === 'done') {
        if (!payload.result) throw new Error(failure);
        return payload;
      }
      if (payload.status === 'error' || payload.status === 'cancelled') return payload;
      if (payload.status === 'pending' || payload.status === 'running' || payload.status === 'stopping') {
        onStatus?.(payload);
      }
    }
  } catch (error) {
    if (signal.aborted) throw signal.reason;
    throw error instanceof TypeError ? new Error(failure) : error;
  } finally {
    window.clearTimeout(deadline);
  }
}
