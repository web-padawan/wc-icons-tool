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

/**
 * Icons listed in `vaadin-font-icons.json` that have no SVG file of their own
 * are aliases: they share a codepoint with an existing icon, typically a
 * renamed one whose old name is kept as deprecated. Such icons are added to
 * the iconset as a `<use>` reference to the icon they share the codepoint with.
 */
function createAliases(names) {
  const json = `${process.cwd()}/packages/icons/assets/vaadin-font-icons.json`;
  const icons = JSON.parse(readFileSync(json, 'utf-8'));

  return icons
    .filter((icon) => !names.has(icon.name))
    .map((alias) => {
      const source = icons.find(
        (icon) => icon.code === alias.code && names.has(icon.name)
      );
      if (!source) {
        throw new Error(
          `No SVG file found for icon "${alias.name}" (code ${alias.code}).`
        );
      }
      return `<g id="vaadin:${alias.name}"><use href="#vaadin:${source.name}"></use></g>`;
    })
    .sort();
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

  const names = new Set(files.map((file) => basename(file, '.svg')));
  const aliases = createAliases(names).join('\n');

  const groups = [contents, aliases].filter(Boolean).join('\n');

  const iconset = `${createCopyright()}
import { Iconset } from '@vaadin/icon/vaadin-iconset.js';

const template = document.createElement('template');

template.innerHTML = \`<svg><defs>\n${groups}\n</defs></svg>\`;

Iconset.register('vaadin', 16, template);\n`;

  writeFileSync(
    `${process.cwd()}/packages/icons/vaadin-iconset.js`,
    iconset,
    'utf-8'
  );
}
