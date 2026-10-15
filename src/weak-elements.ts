/**
 * A set of objects held weakly that can be iterated: an object is released when nothing else references it, and
 * `alive` returns the ones that remain. A rule that applies to the elements of several declarations holds them in
 * one, so a form that is dropped without its rules being unregistered is released even while the rule stays
 * reachable through a listener on an element outside the form.
 */
export class WeakElements<T extends object> {
  private readonly refs = new Set<WeakRef<T>>();

  private readonly byElement = new WeakMap<T, WeakRef<T>>();

  add(element: T): void {
    if (this.byElement.has(element)) return;
    const ref = new WeakRef(element);
    this.byElement.set(element, ref);
    this.refs.add(ref);
  }

  has(element: T): boolean {
    return this.byElement.has(element);
  }

  delete(element: T): boolean {
    const ref = this.byElement.get(element);
    if (!ref) return false;
    this.byElement.delete(element);
    this.refs.delete(ref);
    return true;
  }

  /** The objects that are still referenced, in the order they were added; removes the references to the others. */
  get alive(): T[] {
    const found: T[] = [];
    this.refs.forEach((ref) => {
      const element = ref.deref();
      if (element) found.push(element);
      else this.refs.delete(ref);
    });
    return found;
  }
}
