import type { UserContext } from '../../shared/contracts/capability';

declare global {
  namespace Express {
    interface Request {
      /**
       * Server-verified identity assigned on protected authenticated API paths.
       * Undefined on public or unauthenticated request paths.
       */
      user?: UserContext;

      /**
       * Optional request correlation identifier. Undefined preserves the existing runtime
       * contract when no request-id middleware has assigned one.
       */
      requestId?: string;
    }
  }
}

export {};
