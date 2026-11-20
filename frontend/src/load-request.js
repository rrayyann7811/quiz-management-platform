export async function loadRequest(request, signal, publish) {
  try {
    const { data } = await request();
    if (!signal.aborted) publish({ data });
  } catch (error) {
    if (!signal.aborted) publish({ error: error.response?.data?.message ?? 'Could not reach the server.' });
  }
}
