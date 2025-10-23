<template>
  <render />
</template>

<script setup lang="ts">
// This is a straight copy from vuetify-inputs, but I don't want all the baggage associated. df-table dowesn't need
// all those dependencies (but I did have to add vue-markdown-render for this widget)
import { h, resolveComponent } from 'vue';

import { ValidationError } from '../validators';

type ClassTypes = string | string[] | Record<string, boolean>;

interface Props {
  message: string | ValidationError[];
  classes?: ClassTypes | ClassTypes[];
}

const props = withDefaults(defineProps<Props>(), { classes: 'text-error' });
const md = resolveComponent('vue-markdown');
const htmlElements = new Set([
  'div',
  'span',
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'section',
  'article',
  'aside',
  'nav',
  'header',
  'footer',
  'main',
  'figure',
  'figcaption',
  'blockquote',
  'pre',
  'code',
  'em',
  'strong',
  'small',
  'mark',
  'del',
  'ins',
  'sub',
  'sup',
  'i',
  'b',
  'u',
  's',
  'a',
  'img',
  'button',
  'input',
  'textarea',
  'select',
  'option',
  'label',
  'form',
  'table',
  'tr',
  'td',
  'th',
  'thead',
  'tbody',
  'tfoot',
  'ul',
  'ol',
  'li',
  'dl',
  'dt',
  'dd',
]);

const render = () => {
  if (typeof props.message === 'string') return h('span', { class: props.classes }, props.message);
  const res: ReturnType<typeof h>[] = [];
  props.message.forEach((msg) => {
    switch (msg.componentName) {
      case 'template':
        res.push(h('div', { class: [props.classes, msg.extraClasses] }, msg.componentBody));
        break;
      case 'vue-markdown':
        if (typeof md === 'string') {
          console.warn(
            "You are using markdown for messages-widget, but you haven't registered a vue-markdown component",
          );
          res.push(h('div', { class: [props.classes, msg.extraClasses] }, (<any>msg.componentBindings).source));
        } else {
          const componentBindings = <any>msg.componentBindings;
          res.push(
            h(md, {
              class: [props.classes, msg.extraClasses, 'df-messages-widget-markdown'],
              source: componentBindings.source,
              options: componentBindings.options,
              plugins: componentBindings.plugins,
            }),
          );
        }
        break;
      default:
        res.push(
          h(
            htmlElements.has(msg.componentName.toLowerCase()) // only resolve if it's not a common html element
              ? msg.componentName
              : resolveComponent(msg.componentName),
            { class: [props.classes, msg.extraClasses], ...msg.componentBindings, innerHTML: msg.componentBody },
          ),
        );
        break;
    }
  });
  return res;
};
</script>

<style>
/* we would like there to be no margins for markdown at the very top and very bottom. the rest of it is fine */
.df-messages-widget-markdown > :first-child,
.df-messages-widget-markdown > :last-child {
  margin-top: 0 !important;
  padding-top: 0 !important;
  margin-bottom: 0 !important;
  padding-bottom: 0 !important;
  line-height: 1.35em !important; /* inspired by vitepress' aggressive settings */
}
</style>
