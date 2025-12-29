import { execSync } from 'node:child_process';
import { basename, normalize } from 'node:path';
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { globSync } from 'glob';
import * as cheerio from 'cheerio';
import svgpath from 'svgpath';

const __dirname = dirname(fileURLToPath(import.meta.url));

function createCopyright() {
  return `/**
 * @license
 * Copyright (c) 2017 - 2025 Vaadin Ltd.
 * This program is available under Apache License Version 2.0, available at https://vaadin.com/license/
 */`;
}

/**
 * Normalize file sort order across platforms (OS X vs Linux, maybe others).
 *
 * Before: `[..., 'eye-disabled', 'eye', ...]`
 * After:  `[..., 'eye', 'eye-disabled', ...]`
 *
 * Order of appearance impacts assigned Unicode codepoints, and sometimes build diffs.
 *
 * @see https://github.com/nfroidure/svgicons2svgfont/pull/82
 * @see https://github.com/nfroidure/svgicons2svgfont/blob/master/src/filesorter.js
 * @see http://support.ecisolutions.com/doc-ddms/help/reportsmenu/ascii_sort_order_chart.htm
 */
function sortIconFilesNormalized(file1, file2) {
  return file1
    .replace(/-/gu, '~')
    .localeCompare(file2.replace(/-/gu, '~'), 'en-US');
}

function createIconset() {
  const filenames = globSync(
    `${process.cwd()}/packages/vaadin-lumo-styles/icons/svg/*.svg`
  );

  filenames.sort(sortIconFilesNormalized);

  let output = `<svg xmlns="http://www.w3.org/2000/svg"><defs>\n`;
  filenames.forEach((file) => {
    const content = readFileSync(file, 'utf-8');
    const path = content.match(
      /<path( fill-rule="evenodd" clip-rule="evenodd")* d="([^"]*)"/u
    );
    const filename = basename(file);
    if (path) {
      const newPath = new svgpath(path[2])
        .scale(1000 / 24, 1000 / 24)
        .round(0)
        .toString();
      const name = filename
        .replace('.svg', '')
        .replace(/\s/gu, '-')
        .toLowerCase();
      const attrs = path[1] !== undefined ? path[1] : '';
      output += `<g id="lumo:${name}"><path d="${newPath}"${attrs}></path></g>\n`;
    } else {
      throw new Error(`Unexpected SVG content: ${filename}`);
    }
  });

  output += `</defs></svg>`;
  return output;
}

export function generateLumoIconset() {
  const iconset = `${createCopyright()}
import './version.js';
import { Iconset } from '@vaadin/icon/vaadin-iconset.js';

const template = document.createElement('template');

template.innerHTML = \`${createIconset()}\`;

Iconset.register('lumo', 1000, template);\n`;

  writeFileSync(
    `${process.cwd()}/packages/vaadin-lumo-styles/vaadin-iconset.js`,
    iconset,
    'utf-8'
  );
}

export function generateLumoFont() {
  const FONT = `${process.cwd()}/packages/vaadin-lumo-styles/lumo-icons`;

  // Create SVG font
  const svgIcons2Font = normalize(
    `${__dirname}/../node_modules/.bin/svgicons2svgfont`
  );
  execSync(
    `${svgIcons2Font} --fontname=lumo-icons --height=1000 --ascent=850 --descent=150 --normalize --fixedWidth --verbose -o ${FONT}.svg ${process.cwd()}/packages/vaadin-lumo-styles/icons/svg/*.svg`
  );

  // Convert SVG to TTF
  const svg2TTF = normalize(`${__dirname}/../node_modules/.bin/svg2ttf`);
  execSync(`${svg2TTF} --ts=1 ${FONT}.svg ${FONT}.ttf`);

  // Convert TTF to WOFF
  const ttf2WOFF = normalize(`${__dirname}/../node_modules/.bin/ttf2woff`);
  execSync(`${ttf2WOFF} ${FONT}.ttf ${FONT}.woff`);

  const content = readFileSync(`${FONT}.svg`, 'utf-8');
  const svg = cheerio.load(content, { xmlMode: true })('font');
  const glyphs = svg
    .children('glyph')
    .toArray()
    .map((el) => {
      return {
        name: el.attribs['glyph-name'],
        unicode: el.attribs.unicode,
      };
    });

  const lumoIconsWoff = readFileSync(`${FONT}.woff`);

  const glyphCSSProperties = glyphs.map((g) => {
    const name = g.name.replace(/\s/gu, '-').toLowerCase();
    const unicode = `\\${g.unicode[0].charCodeAt(0).toString(16)}`;
    return `--lumo-icons-${name}: '${unicode}';`;
  });

  const outputCSS = `
@font-face {
  font-family: 'lumo-icons';
  src: url(data:application/font-woff;charset=utf-8;base64,${lumoIconsWoff.toString(
    'base64'
  )})
    format('woff');
  font-weight: normal;
  font-style: normal;
}

:where(:root),
:where(:host) {
  ${glyphCSSProperties.join('\n  ')}
}
`;

  // Write the output to src/props/icons.css
  writeFileSync(
    `${process.cwd()}/packages/vaadin-lumo-styles/src/props/icons.css`,
    [createCopyright(), outputCSS.trimStart()].join('\n')
  );

  // Write the list of glyphs for visual tests
  const list = glyphs.map((g) => g.name);
  writeFileSync(
    `${process.cwd()}/packages/vaadin-lumo-styles/test/glyphs.json`,
    JSON.stringify(list, null, 2)
  );

  // Cleanup temporary font files
  unlinkSync(`${FONT}.svg`);
  unlinkSync(`${FONT}.ttf`);
  unlinkSync(`${FONT}.woff`);
}
