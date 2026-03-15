const BEEHIIV_API_KEY = process.env.BEEHIIV_API_KEY;
const BEEHIIV_PUBLICATION_ID = process.env.BEEHIIV_PUBLICATION_ID;
const BEEHIIV_API_BASE = 'https://api.beehiiv.com/v2';

export async function subscribeEmail(
  email: string
): Promise<{ success: boolean; error?: string }> {
  if (!BEEHIIV_API_KEY || !BEEHIIV_PUBLICATION_ID) {
    console.warn('Beehiiv API credentials not configured.');
    return {
      success: false,
      error: 'Newsletter service is not configured. Please try again later.',
    };
  }

  try {
    const response = await fetch(
      `${BEEHIIV_API_BASE}/publications/${BEEHIIV_PUBLICATION_ID}/subscriptions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${BEEHIIV_API_KEY}`,
        },
        body: JSON.stringify({
          email,
          reactivate_existing: false,
          send_welcome_email: true,
          utm_source: 'website',
          utm_medium: 'organic',
          utm_campaign: 'elijahbryant_com',
        }),
      }
    );

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      const message =
        (data as { message?: string }).message ||
        'Failed to subscribe. Please try again.';
      return { success: false, error: message };
    }

    return { success: true };
  } catch (err) {
    console.error('Beehiiv subscription error:', err);
    return {
      success: false,
      error: 'Something went wrong. Please try again.',
    };
  }
}

export async function getSubscriberCount(): Promise<number> {
  const FALLBACK = 4200;

  if (!BEEHIIV_API_KEY || !BEEHIIV_PUBLICATION_ID) {
    return FALLBACK;
  }

  try {
    const response = await fetch(
      `${BEEHIIV_API_BASE}/publications/${BEEHIIV_PUBLICATION_ID}`,
      {
        headers: {
          Authorization: `Bearer ${BEEHIIV_API_KEY}`,
        },
        next: { revalidate: 3600 },
      }
    );

    if (!response.ok) return FALLBACK;

    const data = (await response.json()) as {
      data?: { stats?: { total_active_subscriptions?: number } };
    };
    return data?.data?.stats?.total_active_subscriptions ?? FALLBACK;
  } catch {
    return FALLBACK;
  }
}
