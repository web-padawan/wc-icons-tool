import { globSync } from 'glob';
import * as cheerio from 'cheerio';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';

function createCopyright() {
  return `/**
 * @license
 * Copyright (c) 2015 - ${new Date().getFullYear()} Vaadin Ltd.
 * This program is available under Apache License Version 2.0, available at https://vaadin.com/license/
 */`;
}

export function generateIcons() {
  const files = globSync(`${process.cwd()}/packages/icons/assets/svg/*.svg`).sort();

  const contents = files
    .map((file) => {
      const id = basename(file, '.svg');
      const content = readFileSync(file, 'utf-8');
      const svg = cheerio.load(content, { xmlMode: true })('svg');
      // Remove fill attributes.
      svg.children('[fill]').removeAttr('fill');
      // Add closing tags instead of self-closing.
      const output = svg.children().toString().replace(/"\/>/gu, '"></path>');
      // Output the "meat" of the SVG as group element.
      return `<g id="vaadin:${id}">${output}</g>`;
    })
    .join('\n');

  const iconset = `${createCopyright()}
import { Iconset } from '@vaadin/icon/vaadin-iconset.js';

const template = document.createElement('template');

template.innerHTML = \`<svg><defs>\n${contents}\n</defs></svg>\`;

Iconset.register('vaadin', 16, template);\n`;

  writeFileSync(
    `${process.cwd()}/packages/icons/vaadin-iconset.js`,
    iconset,
    'utf-8'
  );
}
