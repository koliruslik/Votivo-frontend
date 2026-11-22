import { createHash } from 'node:crypto';
import {
  calculateJwkThumbprint,
  createRemoteJWKSet,
  decodeProtectedHeader,
  importJWK,
  jwtVerify,
} from 'jose';

export function createAuthenticator({ issuer, audience, jwksUrl, keySet }) {
  const keys = keySet ?? createRemoteJWKSet(new URL(jwksUrl), { timeoutDuration: 5000 });
  const usedProofs = new Map();
  return async (authorization, proof, method, url) => {
    const match = /^(Bearer|DPoP) ([^ ]+)$/i.exec(authorization ?? '');
    if (!match) throw new Error('Authentication required');
    const [, scheme, token] = match;
    const { payload } = await jwtVerify(token, keys, {
      issuer,
      audience,
      algorithms: ['RS256'],
      requiredClaims: ['sub', 'exp', 'iat'],
      clockTolerance: 5,
    });
    if (typeof payload.sub !== 'string' || !payload.sub.trim() || payload.sub.length > 255)
      throw new Error('Invalid subject');
    const thumbprint = payload.cnf?.jkt;
    if (thumbprint) {
      if (scheme.toLowerCase() !== 'dpop' || !proof) throw new Error('DPoP required');
      const header = decodeProtectedHeader(proof);
      if (
        header.typ?.toLowerCase() !== 'dpop+jwt' ||
        !header.jwk ||
        'd' in header.jwk ||
        !['ES256', 'ES384', 'ES512', 'EdDSA', 'RS256'].includes(header.alg)
      )
        throw new Error('Invalid proof key');
      const key = await importJWK(header.jwk, header.alg);
      const { payload: claims } = await jwtVerify(proof, key, {
        algorithms: [header.alg],
        maxTokenAge: 60,
        clockTolerance: 5,
        requiredClaims: ['iat', 'jti', 'htm', 'htu', 'ath'],
      });
      const target = new URL(url);
      target.search = '';
      target.hash = '';
      if (
        claims.htm !== method ||
        claims.htu !== target.href ||
        claims.ath !== createHash('sha256').update(token).digest('base64url') ||
        (await calculateJwkThumbprint(header.jwk)) !== thumbprint ||
        typeof claims.jti !== 'string' ||
        !claims.jti ||
        claims.jti.length > 512
      )
        throw new Error('Invalid proof binding');
      const now = Date.now();
      for (const [id, expires] of usedProofs) if (expires < now) usedProofs.delete(id);
      const id = `${thumbprint}:${claims.jti}`;
      if (usedProofs.has(id) || usedProofs.size >= 100000) throw new Error('Proof replay rejected');
      usedProofs.set(id, now + 70000);
    } else if (scheme.toLowerCase() !== 'bearer') throw new Error('Unexpected proof scheme');
    return {
      subject: payload.sub,
      token,
      admin:
        Array.isArray(payload.realm_access?.roles) && payload.realm_access.roles.includes('ADMIN'),
    };
  };
}
