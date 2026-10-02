export function resolveListenHost(): '127.0.0.1' | '0.0.0.0' {
  return process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1';
}
