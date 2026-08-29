import { useQuery } from '@tanstack/react-query';
import type { SessionData } from '@/types/session';

async function fetchSession(sessionId: string): Promise<SessionData> {
  const res = await fetch(`/api/session/${sessionId}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? 'Failed to load session.');
  }
  return res.json();
}

export function useSessionData(sessionId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => fetchSession(sessionId!),
    enabled: Boolean(sessionId) && enabled,
  });
}
