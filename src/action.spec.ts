import { reactive } from 'vue';

import { Action, ActionValue } from './action';

describe('Action', () => {
  it('correctly manages value, label and icon', () => {
    const action = Action.create({ value: { label: 'Action', icon: 'plus' } });

    expect(action.value).toEqual({ label: 'Action', icon: 'plus' });
    expect(action.label).toBe('Action');
    expect(action.icon).toBe('plus');

    action.label = 'New action';
    expect(action.value).toEqual({ label: 'New action', icon: 'plus' });

    action.icon = 'minus';
    expect(action.value).toEqual({ label: 'New action', icon: 'minus' });

    action.value = { label: 'Third', icon: 'edit' };
    expect(action.label).toBe('Third');
    expect(action.icon).toBe('edit');
  });

  it('prevents changes when disabled', () => {
    const action = Action.create({
      value: { label: 'Action', icon: 'plus' },
      enabled: false,
    });

    action.value = { label: 'New', icon: 'minus' };
    expect(action.label).toBe('Action');
    expect(action.icon).toBe('plus');
  });

  it('should maintain reactivity of input ActionValue object', () => {
    // Arrange
    const reactiveValue = reactive({ label: 'Initial', icon: 'start' });
    const action = Action.create({ value: reactiveValue });

    // Act - change original reactive object
    reactiveValue.label = 'Modified';

    // Assert - action should reflect the change
    expect(action.label).toBe('Modified');
    expect(action.value.label).toBe('Modified');
    // expect(changeCount).toBe(1);

    // Act - change via action setter
    action.icon = 'new-icon';

    // Assert - original reactive object should also change
    expect(reactiveValue.icon).toBe('new-icon');
  });

  it('should lose maintain reactivity when input object is incomplete', () => {
    // Arrange
    const reactiveValue = reactive({ label: 'Initial' } as ActionValue); // missing icon
    const action = Action.create({ value: reactiveValue });

    // Act - change original reactive object
    action.icon = 'icon';

    // Assert - action should reflect the change
    expect(reactiveValue.label).toBe('Initial');
    expect(reactiveValue.icon).toBe('icon');

    action.label = 'Modified';
    expect(reactiveValue.label).toBe('Modified');
  });
});
