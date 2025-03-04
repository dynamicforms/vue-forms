import { Action } from './action';

describe('Action', () => {
  it('correctly manages value, label and icon', () => {
    const action = new Action({ value: { label: 'Action', icon: 'plus' } });

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
    const action = new Action({
      value: { label: 'Action', icon: 'plus' },
      enabled: false,
    });

    action.value = { label: 'New', icon: 'minus' };
    expect(action.label).toBe('Action');
    expect(action.icon).toBe('plus');
  });
});
