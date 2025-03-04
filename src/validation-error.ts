/* eslint-disable max-classes-per-file */
export class ValidationError {
  get componentName() { return 'Comment'; } // eslint-disable-line class-methods-use-this

  get componentBindings() { return {}; } // eslint-disable-line class-methods-use-this
}

export class ValidationErrorText extends ValidationError {
  text: string;

  constructor(text: string) {
    super();
    this.text = text;
  }

  get componentName() { return 'v-sheet'; } // eslint-disable-line class-methods-use-this

  get componentBindings() { return { class: 'text-body-1' }; } // eslint-disable-line class-methods-use-this
}

/** ********************************************************************************************************************
 *
 at some point there will be classes here that will support links or action buttons or something even more complex
 *
 ******************************************************************************************************************** */
