<template>
  <div class="validators-form-demo">
    <v-locale-provider :rtl="text.rtl ?? false">
      <v-card class="mb-4">
        <v-card-title>{{ text.title }}</v-card-title>
        <v-card-subtitle class="intro">{{ text.intro }}</v-card-subtitle>
        <v-card-text>
          <div class="settings mb-2">
            <v-select
              v-model="locale"
              :items="locales"
              density="compact"
              hide-details
              class="locale"
            ></v-select>
            <v-checkbox v-model="useMarkdown" :label="text.markdown" color="primary" density="compact" hide-details />
          </div>
          <v-form @submit.prevent>
            <!-- Username field (Required) -->
            <v-text-field
              v-model="validatedForm.fields.username.value"
              :label="text.username"
              :error-messages="getErrorMessages(validatedForm.fields.username)"
              outlined
              class="mb-2"
            >
              <template #message="{ message }"><vue-markdown :source="message" class="demo-message" /></template>
            </v-text-field>

            <!-- Email field (Pattern) -->
            <v-text-field
              v-model="validatedForm.fields.email.value"
              :label="text.email"
              :error-messages="getErrorMessages(validatedForm.fields.email)"
              :loading="validatedForm.fields.email.validating"
              outlined
              class="mb-2"
              :hint="text.emailHint"
              persistent-hint
            >
              <template #message="{ message }"><vue-markdown :source="message" class="demo-message" /></template>
            </v-text-field>

            <!-- Age field (ValueInRange) -->
            <v-text-field
              v-model.number="validatedForm.fields.age.value"
              type="number"
              :label="text.age"
              :error-messages="getErrorMessages(validatedForm.fields.age)"
              outlined
              class="mb-2"
            >
              <template #message="{ message }"><vue-markdown :source="message" class="demo-message" /></template>
            </v-text-field>

            <!-- Role field (InAllowedValues) -->
            <v-select
              v-model="validatedForm.fields.role.value"
              :items="['admin', 'user', 'guest']"
              :label="text.role"
              :error-messages="getErrorMessages(validatedForm.fields.role)"
              outlined
              class="mb-2"
            >
              <template #message="{ message }"><vue-markdown :source="message" class="demo-message" /></template>
            </v-select>

            <!-- Bio field (LengthInRange) -->
            <v-textarea
              v-model="validatedForm.fields.bio.value"
              :label="text.bio"
              :error-messages="getErrorMessages(validatedForm.fields.bio)"
              outlined
              counter="200"
              class="mb-2"
            >
              <template #message="{ message }"><vue-markdown :source="message" class="demo-message" /></template>
            </v-textarea>
          </v-form>
        </v-card-text>

        <v-card-actions>
          <v-btn
            color="primary"
            :disabled="!formValid || formBusy"
            :loading="formBusy"
          >
            {{ text.submit }}
          </v-btn>
          <v-btn
            color="secondary"
            @click="resetForm"
            class="ml-2"
          >
            {{ text.reset }}
          </v-btn>
        </v-card-actions>
      </v-card>

      <v-card>
        <v-card-title>{{ text.status }}</v-card-title>
        <v-card-text>
          <v-alert
            :type="formValid ? 'success' : 'error'"
            class="mb-3"
          >
            {{ formValid ? text.valid : text.invalid }}
          </v-alert>
          <pre class="output" dir="ltr">{{ JSON.stringify(validatedForm.value, null, 2) }}</pre>
        </v-card-text>
      </v-card>
    </v-locale-provider>
  </div>
</template>

<script setup>
import { interpolate } from '@dynamicforms/translatable';
import { computed, onUnmounted, ref, watch } from 'vue';
import {
  Group,
  Field,
  ValueChangedAction,
  Validators,
  ValidationErrorRenderContent,
  getConfig,
  setConfig,
  translateStrings,
} from '../../src'; // from '@dynamicforms/vue-forms'

// Translations of the built-in messages. English is the library's default, so it needs no entry; a key a locale
// does not translate keeps its English default too.
const messages = {
  sl: {
    Required: 'Prosimo, vnesite vrednost',
    ValueInRange: 'Vrednost mora biti med **{minValue}** in **{maxValue}**',
    InAllowedValues: 'Mora biti ena od [**{allowedAsText}**]',
    LengthInRange: 'Dolžina mora biti med **{minLength}** in **{maxLength}**',
  },
  de: {
    Required: 'Bitte geben Sie einen Wert ein',
    ValueInRange: 'Der Wert muss zwischen **{minValue}** und **{maxValue}** liegen',
    InAllowedValues: 'Muss einer von [**{allowedAsText}**] sein',
    LengthInRange: 'Die Länge muss zwischen **{minLength}** und **{maxLength}** liegen',
  },
  es: {
    Required: 'Introduzca un valor',
    ValueInRange: 'El valor debe estar entre **{minValue}** y **{maxValue}**',
    InAllowedValues: 'Debe ser uno de [**{allowedAsText}**]',
    LengthInRange: 'La longitud debe estar entre **{minLength}** y **{maxLength}**',
  },
  ja: {
    Required: '値を入力してください',
    ValueInRange: '値は **{minValue}** から **{maxValue}** の間でなければなりません',
    InAllowedValues: '[**{allowedAsText}**] のいずれかでなければなりません',
    LengthInRange: '長さは **{minLength}** から **{maxLength}** の間でなければなりません',
  },
  zh: {
    Required: '请输入一个值',
    ValueInRange: '值必须介于 **{minValue}** 和 **{maxValue}** 之间',
    InAllowedValues: '必须是 [**{allowedAsText}**] 之一',
    LengthInRange: '长度必须介于 **{minLength}** 和 **{maxLength}** 之间',
  },
  fa: {
    Required: 'لطفاً یک مقدار وارد کنید',
    ValueInRange: 'مقدار باید بین **{minValue}** و **{maxValue}** باشد',
    // U+2068 and U+2069 isolate the Latin list, so its brackets stay in place inside the right-to-left sentence
    InAllowedValues: 'باید یکی از \u2068[**{allowedAsText}**]\u2069 باشد',
    LengthInRange: 'طول باید بین **{minLength}** و **{maxLength}** باشد',
  },
  bn: {
    Required: 'একটি মান লিখুন',
    ValueInRange: 'মান **{minValue}** থেকে **{maxValue}** এর মধ্যে হতে হবে',
    InAllowedValues: '[**{allowedAsText}**] এর মধ্যে একটি হতে হবে',
    LengthInRange: 'দৈর্ঘ্য **{minLength}** থেকে **{maxLength}** এর মধ্যে হতে হবে',
  },
};
const locales = [
  { value: 'en', title: '🇺🇸 English' },
  { value: 'sl', title: '🇸🇮 Slovenščina' },
  { value: 'de', title: '🇩🇪 Deutsch' },
  { value: 'es', title: '🇪🇸 Español' },
  { value: 'ja', title: '🇯🇵 日本語' },
  { value: 'zh', title: '🇨🇳 中文' },
  { value: 'fa', title: '🇮🇷 فارسی' },
  { value: 'bn', title: '🇧🇩 বাংলা' },
];
const locale = ref('en');

// The demo's own text: labels, hints and the messages it gives its validators. They belong to the application and
// come from its own translations, not from translateStrings.
const ui = {
  en: {
    title: 'Validators Demo',
    intro: 'Switch the language or the markdown setting: the errors already on the fields follow without revalidating.',
    markdown: 'Markdown in messages',
    username: 'Username',
    email: 'Email',
    emailHint: 'Try entering something@taken.com to see async validation',
    invalidEmail: 'Please enter a valid email address',
    emailTaken: 'This email address is already taken',
    age: 'Age',
    role: 'Role',
    bio: 'Bio',
    submit: 'Submit',
    reset: 'Reset',
    status: 'Form Validation Status',
    valid: 'Form is valid',
    invalid: 'Form is invalid',
  },
  sl: {
    title: 'Demo validatorjev',
    intro: 'Preklopite jezik ali markdown: napake, ki so že na poljih, sledijo brez ponovne validacije.',
    markdown: 'Markdown v sporočilih',
    username: 'Uporabniško ime',
    email: 'E-pošta',
    emailHint: 'Vnesite something@taken.com za prikaz asinhrone validacije',
    invalidEmail: 'Vnesite veljaven e-poštni naslov',
    emailTaken: 'Ta e-poštni naslov je že zaseden',
    age: 'Starost',
    role: 'Vloga',
    bio: 'Opis',
    submit: 'Pošlji',
    reset: 'Ponastavi',
    status: 'Stanje validacije obrazca',
    valid: 'Obrazec je veljaven',
    invalid: 'Obrazec ni veljaven',
  },
  de: {
    title: 'Validatoren-Demo',
    intro: 'Wechseln Sie die Sprache oder Markdown: Die Fehler an den Feldern folgen ohne erneute Validierung.',
    markdown: 'Markdown in Meldungen',
    username: 'Benutzername',
    email: 'E-Mail',
    emailHint: 'Geben Sie something@taken.com ein, um die asynchrone Validierung zu sehen',
    invalidEmail: 'Bitte geben Sie eine gültige E-Mail-Adresse ein',
    emailTaken: 'Diese E-Mail-Adresse ist bereits vergeben',
    age: 'Alter',
    role: 'Rolle',
    bio: 'Biografie',
    submit: 'Absenden',
    reset: 'Zurücksetzen',
    status: 'Validierungsstatus des Formulars',
    valid: 'Das Formular ist gültig',
    invalid: 'Das Formular ist ungültig',
  },
  es: {
    title: 'Demostración de validadores',
    intro: 'Cambie el idioma o el markdown: los errores ya mostrados en los campos cambian sin volver a validar.',
    markdown: 'Markdown en los mensajes',
    username: 'Nombre de usuario',
    email: 'Correo electrónico',
    emailHint: 'Introduzca something@taken.com para ver la validación asíncrona',
    invalidEmail: 'Introduzca una dirección de correo válida',
    emailTaken: 'Esta dirección de correo ya está en uso',
    age: 'Edad',
    role: 'Rol',
    bio: 'Biografía',
    submit: 'Enviar',
    reset: 'Restablecer',
    status: 'Estado de validación del formulario',
    valid: 'El formulario es válido',
    invalid: 'El formulario no es válido',
  },
  ja: {
    title: 'バリデーターのデモ',
    intro: '言語や Markdown を切り替えると、表示中のエラーも再検証なしで切り替わります。',
    markdown: 'メッセージ内の Markdown',
    username: 'ユーザー名',
    email: 'メールアドレス',
    emailHint: '非同期検証を見るには something@taken.com を入力してください',
    invalidEmail: '有効なメールアドレスを入力してください',
    emailTaken: 'このメールアドレスは既に使用されています',
    age: '年齢',
    role: '役割',
    bio: '自己紹介',
    submit: '送信',
    reset: 'リセット',
    status: 'フォームの検証状態',
    valid: 'フォームは有効です',
    invalid: 'フォームは無効です',
  },
  zh: {
    title: '验证器演示',
    intro: '切换语言或 Markdown：字段上已显示的错误无需重新验证即可随之更新。',
    markdown: '消息中的 Markdown',
    username: '用户名',
    email: '电子邮件',
    emailHint: '输入 something@taken.com 查看异步验证',
    invalidEmail: '请输入有效的电子邮件地址',
    emailTaken: '该电子邮件地址已被占用',
    age: '年龄',
    role: '角色',
    bio: '简介',
    submit: '提交',
    reset: '重置',
    status: '表单验证状态',
    valid: '表单有效',
    invalid: '表单无效',
  },
  fa: {
    rtl: true,
    title: 'نمایش اعتبارسنج‌ها',
    intro: 'زبان یا مارک‌داون را تغییر دهید: خطاهای نمایش‌داده‌شده بدون اعتبارسنجی دوباره به‌روز می‌شوند.',
    markdown: 'مارک‌داون در پیام‌ها',
    username: 'نام کاربری',
    email: 'ایمیل',
    emailHint: 'برای دیدن اعتبارسنجی ناهمگام something@taken.com را وارد کنید',
    invalidEmail: 'لطفاً یک نشانی ایمیل معتبر وارد کنید',
    emailTaken: 'این نشانی ایمیل قبلاً استفاده شده است',
    age: 'سن',
    role: 'نقش',
    bio: 'درباره من',
    submit: 'ارسال',
    reset: 'بازنشانی',
    status: 'وضعیت اعتبارسنجی فرم',
    valid: 'فرم معتبر است',
    invalid: 'فرم نامعتبر است',
  },
  bn: {
    title: 'ভ্যালিডেটর ডেমো',
    intro: 'ভাষা বা মার্কডাউন পরিবর্তন করুন: ফিল্ডে দেখানো ত্রুটিগুলি পুনরায় যাচাই ছাড়াই বদলে যায়।',
    markdown: 'বার্তায় মার্কডাউন',
    username: 'ব্যবহারকারীর নাম',
    email: 'ইমেল',
    emailHint: 'অ্যাসিঙ্ক্রোনাস যাচাই দেখতে something@taken.com লিখুন',
    invalidEmail: 'একটি বৈধ ইমেল ঠিকানা লিখুন',
    emailTaken: 'এই ইমেল ঠিকানাটি ইতিমধ্যে ব্যবহৃত হয়েছে',
    age: 'বয়স',
    role: 'ভূমিকা',
    bio: 'পরিচিতি',
    submit: 'জমা দিন',
    reset: 'রিসেট',
    status: 'ফর্ম যাচাইয়ের অবস্থা',
    valid: 'ফর্মটি বৈধ',
    invalid: 'ফর্মটি অবৈধ',
  },
};
const text = computed(() => ui[locale.value]);

// The translation function receives the placeholder values as they are, so it formats the numbers among them for the
// locale: Persian and Bengali write their own digits.
const formatNumbers = (named) => {
  const format = new Intl.NumberFormat(locale.value);
  return Object.fromEntries(
    Object.entries(named).map(([name, value]) => [name, typeof value === 'number' ? format.format(value) : value]),
  );
};

// A translation function shaped like vue-i18n's t: the translation of key with the placeholders substituted, or key
// unchanged where there is none. It reads locale, so every error on screen follows a switch without revalidating.
translateStrings((key, named) => {
  const template = messages[locale.value]?.[key];
  return template ? interpolate(template, formatNumbers(named)) : key;
});

// The configuration is reactive, so the errors on screen follow the switch. Each field's message slot renders its
// errors through the globally registered vue-markdown component, so a markdown message shows its emphasis.
const useMarkdown = ref(getConfig().useMarkdownInValidators);
const markdownInitially = useMarkdown.value;
watch(useMarkdown, (value) => setConfig({ useMarkdownInValidators: value }));

// translateStrings and the configuration are global; leave the rest of the documentation as it was
onUnmounted(() => {
  translateStrings((key) => key);
  setConfig({ useMarkdownInValidators: markdownInitially });
});

// Create a form group with validated fields
const validatedForm = new Group({
  // Required field - cannot be empty
  username: new Field({
    value: '',
    validators: [new Validators.Required()]
  }),

  // Email field with pattern validation
  email: new Field({
    value: '',
    validators: [
      new Validators.Pattern(
        /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
        computed(() => text.value.invalidEmail),
      ),
      // Async validator to simulate email availability check
      new Validators.Validator(async (newValue) => {
        // Only validate if email format is correct
        if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(newValue)) {
          return null; // Let pattern validator handle format errors
        }

        // Simulate API call delay
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Check if email is "taken"
        if (newValue.endsWith('@taken.com')) {
          return [new ValidationErrorRenderContent(computed(() => text.value.emailTaken))];
        }

        return null; // Email is available
      })
    ]
  }),

  // Number field with range validation
  age: new Field({
    value: null,
    validators: [
      new Validators.ValueInRange(18, 100)
    ]
  }),

  // Field with allowed values validation
  role: new Field({
    value: '',
    validators: [
      new Validators.InAllowedValues(['admin', 'user', 'guest'])
    ]
  }),

  // Text field with length validation
  bio: new Field({
    value: '',
    validators: [
      new Validators.LengthInRange(10, 200)
    ]
  })
});

// A group forms its verdict over its members, and busy answers for the whole tree: true while an asynchronous
// validation is in flight anywhere below the group. Both reads are tracked, so these recompute on their own.
const formValid = computed(() => validatedForm.valid);
const formBusy = computed(() => validatedForm.busy);

// Function to extract error messages as plain strings, as required by Vuetify's error-messages prop.
// componentBody carries the text of plain-text errors, componentBindings.source the source of markdown ones.
function getErrorMessages(field) {
  if (!field.errors || field.errors.length === 0) return [];
  return field.errors.map(error => error.componentBody || error.componentBindings.source || 'Validation error');
}

// Function to reset the form
function resetForm() {
  validatedForm.fields.username.value = '';
  validatedForm.fields.email.value = '';
  validatedForm.fields.age.value = null;
  validatedForm.fields.role.value = '';
  validatedForm.fields.bio.value = '';
}

// Optional: react to any value change in the form
validatedForm.registerAction(new ValueChangedAction((field, supr, newValue, oldValue) => {
  console.log('Form value has changed');
  return supr(field, newValue, oldValue);
}));
</script>

<style scoped>
.validators-form-demo {
  margin: 2rem 0;
}
.intro {
  white-space: normal;
}
.settings {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0 1rem;
}
.locale {
  flex: 0 1 14rem;
}
.demo-message :deep(p) {
  margin: 0;
}
.output {
  background-color: #f5f5f5;
  padding: 1rem;
  border-radius: 4px;
  white-space: pre-wrap;
}
</style>
