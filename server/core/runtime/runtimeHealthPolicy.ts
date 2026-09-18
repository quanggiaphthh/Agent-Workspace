export type RuntimeHealthStatus = 'ok' | 'degraded' | 'error';

export interface RuntimeHealthComponent {
  status: RuntimeHealthStatus;
}

export interface RuntimeHealthComponents {
  firestore: RuntimeHealthComponent;
  session: RuntimeHealthComponent;
  modules: RuntimeHealthComponent;
  audit: RuntimeHealthComponent;
}

export function computeRuntimeHealth(components: RuntimeHealthComponents) {
  const values = Object.values(components);
  const status: RuntimeHealthStatus = values.some((item) => item.status === 'error')
    ? 'error'
    : values.some((item) => item.status === 'degraded')
      ? 'degraded'
      : 'ok';

  return {
    status,
    timestamp: new Date().toISOString(),
    process: { status: 'ok' as const },
    components,
  };
}
