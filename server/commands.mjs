// SPDX-License-Identifier: GPL-3.0-or-later
// One parser for both the OneBot bridge and the task service.
const startCommand = /^(?:(?:生成|制作)\s*(?:(?:kigurumi|kig)\s*)?(?:头壳\s*)?参考图|kig\s*开始)(?=$|[\s，,：:。.!！])/i;
export function parseStart(text) {
  const value = String(text || '').trim();
  const match = startCommand.exec(value);
  return match ? {prompt: value.slice(match[0].length).replace(/^[\s，,：:。.!！]+/, '')} : null;
}
export const isStart = text => parseStart(text) !== null;
