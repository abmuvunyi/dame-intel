import { INSECURE_DEV_JWT_SECRET, isProduction } from '../config/env.validation';

let warned = false;

export const jwtConstants = {
  get secret(): string {
    const secret = process.env.JWT_SECRET;
    if (secret) return secret;
    // Phase 14: never fall back to a known secret in production — anyone could mint
    // valid tokens for any account. env.validation.ts already refuses to boot without
    // it; this is a second line of defence for code paths that read it directly.
    if (isProduction()) {
      throw new Error('JWT_SECRET is not set. Refusing to sign or verify tokens with a default secret in production.');
    }
    if (!warned) {
      warned = true;
      console.warn('WARNING: JWT_SECRET is not set. Using an insecure development-only secret.');
    }
    return INSECURE_DEV_JWT_SECRET;
  },
};
