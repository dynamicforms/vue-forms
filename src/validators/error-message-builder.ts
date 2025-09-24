import { getConfig } from '../config';

import { MdString } from './validation-error';

/**
 * Depending on the useMarkdownInValidators setting, return either markdown or a plain string error message
 * @param mdErrorString markdown source to optionally be stripped
 * @return MdString or string
 */

export function buildErrorMessage(mdErrorString: string): string | MdString {
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
