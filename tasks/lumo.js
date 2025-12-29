import { execSync } from 'node:child_process';
import path from 'node:path';
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';

const __dirname = dirname(fileURLToPath(import.meta.url));

function createCopyright() {
  return `/**
 * @license
 * Copyright (c) 2017 - 2025 Vaadin Ltd.
 * This program is available under Apache License Version 2.0, available at https://vaadin.com/license/
 */`;
}

export function generateLumoFont() {
  const FONT = `${process.cwd()}/packages/vaadin-lumo-styles/lumo-icons`;

  // Create SVG font
  const svgIcons2Font = path.normalize(
    `${__dirname}/../node_modules/.bin/svgicons2svgfont`
  );
  execSync(
    `${svgIcons2Font} --fontname=lumo-icons --height=1000 --ascent=850 --descent=150 --normalize --fixedWidth --verbose -o ${FONT}.svg ${process.cwd()}/packages/vaadin-lumo-styles/icons/svg/*.svg`
  );

  // Convert SVG to TTF
  const svg2TTF = path.normalize(`${__dirname}/../node_modules/.bin/svg2ttf`);
  execSync(`${svg2TTF} --ts=1 ${FONT}.svg ${FONT}.ttf`);

  // Convert TTF to WOFF
  const ttf2WOFF = path.normalize(`${__dirname}/../node_modules/.bin/ttf2woff`);
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
