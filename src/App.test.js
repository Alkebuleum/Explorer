import { compareRuntime, compilerVersionFromCode } from './lib/verify';
import { routeForQuery } from './components/ui/SearchBar';
import { formatUnits } from './lib/format';

// The compiler runs in a Web Worker, which Jest can't load; these tests don't compile.
jest.mock('./lib/solcClient', () => ({ compileInWorker: jest.fn() }));
// CRA's Jest can't resolve react-router v7's package exports; these tests don't need it.
jest.mock('react-router-dom', () => ({ useNavigate: () => () => {} }), { virtual: true });

// Fake runtime + a 2-byte stand-in for the CBOR metadata, then its length (0x0002).
const body = '6080604052' + '7f' + '00'.repeat(32) + '5050';
const meta = (b) => 'a1' + b + '0002';

describe('compareRuntime', () => {
  test('exact match', () => {
    expect(compareRuntime('0x' + body + meta('aa'), {}, '0x' + body + meta('aa'))).toBe('full');
  });

  test('metadata-only difference is a partial match', () => {
    expect(compareRuntime(body + meta('aa'), {}, body + meta('bb'))).toBe('partial');
  });

  test('immutable values are masked', () => {
    const live = '6080604052' + '7f' + '11'.repeat(32) + '5050' + meta('aa');
    // The PUSH32 operand starts at byte 6.
    expect(compareRuntime(body + meta('aa'), { 7: [{ start: 6, length: 32 }] }, live)).toBe('full');
    expect(compareRuntime(body + meta('aa'), {}, live)).toBeNull();
  });

  test('library placeholders are masked', () => {
    const compiled = '73' + '__$' + 'a'.repeat(34) + '$__' + '5050';
    const live = '73' + 'ab'.repeat(20) + '5050';
    expect(compareRuntime(compiled, {}, live)).toBe('full');
  });

  test('different code does not match', () => {
    expect(compareRuntime(body + meta('aa'), {}, '6080604053' + body.slice(10) + meta('aa'))).toBeNull();
  });
});

test('routeForQuery', () => {
  expect(routeForQuery('12,345')).toBe('/block/12345');
  expect(routeForQuery('0x' + 'a'.repeat(40))).toBe('/address/0x' + 'a'.repeat(40));
  expect(routeForQuery('0x' + 'b'.repeat(64))).toBe('/tx/0x' + 'b'.repeat(64));
  expect(routeForQuery('hello')).toBeNull();
});

test('formatUnits', () => {
  expect(formatUnits(1234567890000000000000n, 18)).toBe('1,234.56789');
  expect(formatUnits(1234567890000000000000n, 18, 2)).toBe('1,234.56');
});

test('compilerVersionFromCode reads the solc version from metadata', () => {
  // Real tail of Mah Coin's deployed code (Solidity 0.8.28).
  const cbor = 'a2646970667358221220c62ad356836ffe207bcf847ae6a40849818fc8dfb4d5950d6b370ba619f2afa664736f6c634300081c';
  const code = '0x6080' + cbor + (cbor.length / 2).toString(16).padStart(4, '0');
  expect(compilerVersionFromCode(code)).toBe('0.8.28');
  expect(compilerVersionFromCode('0x6080604052')).toBeNull();
});
