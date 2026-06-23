import { describe, expect, it } from 'vitest';

import { ParamBuilder } from './param-builder.js';

describe('ParamBuilder', () => {
  it('numbers placeholders globally and accumulates params', () => {
    const b = new ParamBuilder();
    expect(b.bind('a')).toBe('$1');
    expect(b.bind(42)).toBe('$2');
    expect(b.bind('c')).toBe('$3');
    expect(b.getParams()).toEqual(['a', 42, 'c']);
    expect(b.getCount()).toBe(3);
  });

  it('getParams returns a copy (no external mutation)', () => {
    const b = new ParamBuilder();
    b.bind('x');
    const p = b.getParams();
    p.push('y');
    expect(b.getParams()).toEqual(['x']);
  });
});
