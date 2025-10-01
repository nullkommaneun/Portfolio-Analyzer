// tests/basic.spec.js
import { parseNumber } from '../app/util/currency.js';
console.assert(parseNumber('(1,234.56)') === -1234.56, 'parseNumber bracket negative failed');
console.assert(parseNumber('3.892,21') === 3892.21, 'parseNumber EU format failed');
console.log('Basic tests passed');
