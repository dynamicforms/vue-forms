<template>
  <div class="messages-widget-demo">
    <v-card class="mb-4">
      <v-card-title>Messages Widget Demo</v-card-title>
      <v-card-text>
        <v-form @submit.prevent>
          <!-- Simple string message -->
          <v-card variant="outlined" class="mb-4">
            <v-card-subtitle>Simple String Message</v-card-subtitle>
            <v-card-text>
              <v-text-field
                v-model="simpleMessage"
                label="Enter message"
                outlined
                class="mb-2"
              ></v-text-field>
              <messages-widget
                :message="simpleMessage"
                :classes="selectedClasses"
              />
            </v-card-text>
          </v-card>

          <!-- ValidationError array messages -->
          <v-card variant="outlined" class="mb-4">
            <v-card-subtitle>Validation Errors</v-card-subtitle>
            <v-card-text>
              <v-text-field
                v-model="testForm.fields.email.value"
                label="Email (try invalid format)"
                :error-messages="getErrorMessages(testForm.fields.email)"
                outlined
                class="mb-2"
              ></v-text-field>
              
              <v-text-field
                v-model.number="testForm.fields.age.value"
                type="number"
                label="Age (must be 18-100)"
                :error-messages="getErrorMessages(testForm.fields.age)"
                outlined
                class="mb-2"
              ></v-text-field>
              
              <div class="mb-2">
                <strong>Custom Messages Widget for Email:</strong>
                <messages-widget
                  v-if="testForm.fields.email.errors && testForm.fields.email.errors.length > 0"
                  :message="testForm.fields.email.errors"
                  classes="custom-error-style"
                />
                <div v-else class="text-success">Email is valid</div>
              </div>
              
              <div class="mb-2">
                <strong>Custom Messages Widget for Age:</strong>
                <messages-widget
                  v-if="testForm.fields.age.errors && testForm.fields.age.errors.length > 0"
                  :message="testForm.fields.age.errors"
                  :classes="['text-warning', 'font-weight-bold']"
                />
                <div v-else class="text-success">Age is valid</div>
              </div>
            </v-card-text>
          </v-card>

          <!-- Markdown messages -->
          <v-card variant="outlined" class="mb-4">
            <v-card-subtitle>Markdown Messages</v-card-subtitle>
            <v-card-text>
              <v-textarea
                v-model="markdownContent"
                label="Markdown content"
                rows="3"
                outlined
                class="mb-2"
              ></v-textarea>
              <messages-widget
                :message="markdownErrors"
                classes="text-info"
              />
            </v-card-text>
          </v-card>

          <!-- Custom component messages -->
          <v-card variant="outlined" class="mb-4">
            <v-card-subtitle>Custom Component Messages</v-card-subtitle>
            <v-card-text>
              <v-btn @click="addCustomError" color="primary" class="mb-2">
                Add Custom Alert Error
              </v-btn>
              <messages-widget
                v-if="customErrors.length > 0"
                :message="customErrors"
                classes="mb-2"
              />
            </v-card-text>
          </v-card>
        </v-form>
      </v-card-text>
    </v-card>

    <!-- Class configuration -->
    <v-card>
      <v-card-title>Styling Options</v-card-title>
      <v-card-text>
        <v-select
          v-model="selectedClasses"
          :items="classOptions"
          label="Select CSS classes for simple message"
          outlined
          clearable
        ></v-select>
        <div class="mt-4">
          <strong>Available class types:</strong>
          <ul>
            <li><code>string</code> - Single class name</li>
            <li><code>string[]</code> - Array of class names</li>
            <li><code>Record&lt;string, boolean&gt;</code> - Object with conditional classes</li>
          </ul>
        </div>
      </v-card-text>
    </v-card>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { Group, Field, Validators, ValidationErrorText, ValidationErrorRenderContent, MdString } from '../../src';
import MessagesWidget from '../../src/components/messages-widget.vue';

// Simple string message
const simpleMessage = ref('This is a simple error message');

// Class options for styling
const classOptions = [
  'text-error',
  'text-warning', 
  'text-success',
  'text-info',
  'custom-error-style'
];
const selectedClasses = ref('text-error');

// Test form with validation
const testForm = new Group({
  email: Field.create({
    value: '',
    validators: [
      new Validators.Pattern(
        /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
        'Please enter a valid email address'
      )
    ]
  }),
  
  age: Field.create({
    value: null,
    validators: [
      new Validators.ValueInRange(18, 100, 'Age must be between 18 and 100')
    ]
  })
});

// Markdown content
const markdownContent = ref('**Error**: This is a *markdown* message with [links](https://example.com) and `code`.');
const markdownErrors = computed(() => [
  new ValidationErrorRenderContent(new MdString(markdownContent.value))
]);

// Custom errors
const customErrors = ref([]);

// Custom error class for demo
class CustomAlertError extends ValidationErrorText {
  constructor(message, extraClasses = '') {
    super(message, extraClasses);
  }
  
  get componentName() { 
    return 'v-alert'; 
  }
  
  get componentBindings() { 
    return { 
      type: 'warning',
      variant: 'tonal',
      closable: true 
    }; 
  }
  
  get componentBody() { 
    return this.text; 
  }
}

// Function to extract error messages for v-text-field
function getErrorMessages(field) {
  if (!field.errors || field.errors.length === 0) return [];
  return field.errors.map(error => {
    if (error.componentBody) return error.componentBody;
    if (error.text) return error.text;
    return 'Validation error';
  });
}

// Function to add custom error
function addCustomError() {
  const errorMessage = `Custom alert error #${customErrors.value.length + 1}`;
  customErrors.value.push(new CustomAlertError(errorMessage, 'mb-2'));
}
</script>

<style scoped>
.messages-widget-demo {
  margin: 2rem 0;
}

.custom-error-style {
  color: #d32f2f;
  background-color: #ffebee;
  padding: 8px 12px;
  border-radius: 4px;
  border-left: 4px solid #d32f2f;
}
</style>