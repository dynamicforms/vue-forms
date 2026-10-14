/** The groups a view has been made for: their members are data keys of the view, so a member name is checked. */
export const viewedGroups = new WeakSet<object>();

/** Throws a TypeError for a member name a view cannot expose as a data key. */
export function refuseReservedName(name: string): void {
  if (name === '$' || name === 'then' || name.startsWith('__v_')) {
    throw new TypeError(
      `A view cannot hold a member named ${name}: $ is the element the view stands for, and then and __v_* ` +
        'are read by the language and by Vue',
    );
  }
}
