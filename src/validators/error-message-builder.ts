import { computed, ComputedRef, isRef, Ref } from 'vue';

import { getConfig } from '../config';

import { MdString } from './validation-error';

function stripOrWrap(mdErrorString: string): string | MdString {
  const useMarkdownInValidators = getConfig().useMarkdownInValidators;
  if (useMarkdownInValidators) return new MdString(mdErrorString);

  return mdErrorString
    .replace(/[*_~`]/g, '') // remove basic markdown (italic, bold, strike, code)
    .replace(/!\[(.*?)\]\(.*?\)/g, '$1') // remove images, keep alt only
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1') // remove links, keep name only
    .replace(/#+\s?/g, '') // Remove heading markers (#, ##, ###)
    .replace(/>\s?/g, '') // remove quotes
    .replace(/(\*|-|\d+\.)\s+/g, '') // remove lists (bullet points and numbered lists)
    .replace(/`{3}[\s\S]*?`{3}/g, '') // remove code blocks
    .replace(/`([^`]+)`/g, '$1') // remove inline code markers
    .replace(/\n{2,}/g, '\n'); // removes excessive empty lines
}

/**
 * Depending on the useMarkdownInValidators setting, return either markdown or a plain string error message. A
 * Ref is stripped/wrapped on read rather than once here, so a translated template re-applies the same choice
 * as its text changes.
 * @param mdErrorString markdown source to optionally be stripped
 * @return MdString or string, or a ComputedRef of either where `mdErrorString` is itself a Ref
 */
export function buildErrorMessage<T extends string | Ref<string>>(
  mdErrorString: T,
): T extends Ref<string> ? ComputedRef<string | MdString> : string | MdString {
  type Result = T extends Ref<string> ? ComputedRef<string | MdString> : string | MdString;

  if (isRef(mdErrorString)) return computed(() => stripOrWrap(mdErrorString.value)) as Result;
  return stripOrWrap(mdErrorString as string) as Result;
}
