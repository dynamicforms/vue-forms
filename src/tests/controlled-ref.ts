import { vi } from 'vitest';

/**
 * A WeakRef whose target a test collects by setting `collected`. `install()` puts it in place of the global for
 * the current test, so the library's weak references are ControlledRefs.
 */
export class ControlledRef<T extends object> {
  static made: ControlledRef<any>[] = [];

  collected = false;

  reads = 0;

  constructor(readonly target: T) {
    ControlledRef.made.push(this);
  }

  deref(): T | undefined {
    this.reads += 1;
    return this.collected ? undefined : this.target;
  }

  static install(): void {
    ControlledRef.made = [];
    vi.stubGlobal('WeakRef', ControlledRef);
  }

  /** Marks every reference to each of `targets` as collected. */
  static collect(...targets: object[]): void {
    ControlledRef.made.filter(({ target }) => targets.includes(target)).forEach((ref) => (ref.collected = true));
  }
}
