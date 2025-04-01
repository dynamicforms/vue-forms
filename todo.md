immediate todo list

- make the IField interface extendable so that the programmer may add any number of additional properties to  
  the Field / Group. Of course, the @dynamicforms/vuetify-inputs module should have a mechanism to bind such properties
  to the inputs themselves
  ```typescript
  //In IField and FieldBase interface declarations
  export interface Extendable {
    setExtendedValues(values: Partial<typeof this>): void;
  }
  
  export interface IField<T = any, TExtend extends Extendable = Extendable> extends TExtend {
    // obstoječe lastnosti
    clone(overrides?: Partial<IField<T>, TExtend>): IField<T, TExtend>;
  }

  //In FieldBase  
  constructor(params?: Partial<IField<T> & TExtend>) {
    super();
    if (params) {
      const { value: paramValue, ...otherParams } = params;
      
      // Nastavi osnovne lastnosti
      Object.assign(this, otherParams);
      
      // Nastavi razširjene lastnosti
      this.setExtendedValues(otherParams as Partial<TExtend>);
      
      this._value = paramValue ?? this.originalValue;
      if (this.originalValue === undefined) this.originalValue = this._value;
    }
  }
  
  clone(overrides?: Partial<IField<T> & TExtend>): Reactive<Field<T, TExtend>> {
    const cloned = Field.create<T, TExtend>({
      value: overrides?.value ?? this.value,
      ...(overrides && 'originalValue' in overrides ? { originalValue: overrides.originalValue } : { }),
      errors: [...(overrides?.errors ?? this.errors)],
      enabled: overrides?.enabled ?? this.enabled,
      visibility: overrides?.visibility ?? this.visibility,
    });
    
    // Nastavi razširjene lastnosti na klonirani instanci
    cloned.setExtendedValues(this as unknown as Partial<TExtend>);
    
    // Prepiše z morebitnimi novimi vrednostmi
    if (overrides) {
      cloned.setExtendedValues(overrides as unknown as Partial<TExtend>);
    }
    
    return cloned;
  } 
  
  // In FieldBase:
  setExtendedValues(_values: Partial<any>): void {
    // Osnovna implementacija je prazna
    // Podrazredi, ki uporabljajo TExtend, bodo to prepisali
  } 
  ```
  most likely FieldBase would have to implement a constructor and the clone method, catering for the common scenarios

- full documentation
- demo app with more examples
- more coverage in unit tests
