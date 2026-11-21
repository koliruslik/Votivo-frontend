export interface AuthConfig {
  enabled: boolean;
  url: string;
  realm: string;
  clientId: string;
  registrationEnabled: boolean;
  dpopMode: 'strict' | 'auto' | 'off';
}

export function parseAuthConfig(value: unknown): AuthConfig {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Invalid authentication configuration');
  }
  const config = value as Record<string, unknown>;
  if (
    typeof config['enabled'] !== 'boolean' ||
    typeof config['registrationEnabled'] !== 'boolean' ||
    typeof config['dpopMode'] !== 'string' ||
    !['strict', 'auto', 'off'].includes(config['dpopMode']) ||
    !['url', 'realm', 'clientId'].every(
      (key) => typeof config[key] === 'string' && (config[key] as string).trim().length > 0,
    )
  ) {
    throw new Error('Invalid authentication configuration');
  }
  const url = new URL(config['url'] as string);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Invalid Keycloak URL');
  }
  return {
    enabled: config['enabled'],
    url: url.href.replace(/\/$/, ''),
    realm: config['realm'] as string,
    clientId: config['clientId'] as string,
    registrationEnabled: config['registrationEnabled'],
    dpopMode: config['dpopMode'] as AuthConfig['dpopMode'],
  };
}
