import { describe, expect, it } from 'vitest';

import * as data from '../../src/data';

// Sample test that proves the Vitest wiring; real data tests arrive with the schemas in M1 (spec 16.1).
describe('data layer', () => {
  it('exposes the data module', () => {
    expect(data).toBeTypeOf('object');
  });
});
