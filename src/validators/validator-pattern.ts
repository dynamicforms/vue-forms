import { ValidationErrorOptions } from './validator';
import { ValueCheck } from './value-check';

export default class Pattern extends ValueCheck {
  constructor(pattern: RegExp, options?: ValidationErrorOptions) {
    // a `g` or `y` flag makes `test()` resume from the end of the previous match, so the same value would pass and
    // fail in turn; the validator tests with a copy without them and leaves the caller's expression as it is
    const tester = /[gy]/.test(pattern.flags)
      ? new RegExp(pattern.source, pattern.flags.replace(/[gy]/g, ''))
      : pattern;
    super(options, 'pattern', 'Value must match pattern "{pattern}"', (value) =>
      tester.test(String(value)) ? null : { pattern },
    );
  }
}
