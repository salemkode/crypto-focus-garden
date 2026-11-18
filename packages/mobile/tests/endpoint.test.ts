import { expect, test } from 'bun:test';
import { resolveGardenEndpoint } from '../src/services/endpoint';
test('local HTTP acceptance is explicit, debug-only and restricted to the assigned loopback service', () => {
  const config = { configured: 'http://127.0.0.1:3487', development: true, allowLocalTestHttp: true };
  expect(resolveGardenEndpoint(config)).toBe(config.configured);
  expect(() => resolveGardenEndpoint({ ...config, development: false })).toThrow();
  expect(() => resolveGardenEndpoint({ ...config, allowLocalTestHttp: false })).toThrow();
  expect(() => resolveGardenEndpoint({ ...config, configured: 'http://192.168.1.2:3487' })).toThrow();
  expect(() => resolveGardenEndpoint({ ...config, configured: 'http://127.0.0.1:8083' })).toThrow();
  expect(() => resolveGardenEndpoint({ ...config, configured: 'https://user:password@example.com' })).toThrow();
  expect(resolveGardenEndpoint({ configured: 'https://garden.example/api/', development: false, allowLocalTestHttp: false })).toBe('https://garden.example/api');
});
