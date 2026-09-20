import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  ImageRun,
  LevelFormat,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  WidthType,
  type FileChild,
} from 'docx'
import { fitInside, loadImageBytes } from './imageSearch.ts'
import type { DocModel } from './exportModels.ts'

const FOREST = '1B2E28'
const GOLD = 'E4B84A'
const INK = '26312D'
const FONT = 'Calibri'
// Accent + a light tint of it for callout fills, rotated so a long document
// doesn't read as one flat color.
const ACCENTS = [
  { color: 'C96A45', tint: 'FBEAE2' },
  { color: '2F7F76', tint: 'E2F1EE' },
  { color: '7A4E8C', tint: 'EEE6F3' },
  { color: 'C99A1E', tint: 'FFF3D1' },
]
const CONTENT_WIDTH = 9648 // letter width minus 0.9" margins, in twips

const NONE = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
const NO_BORDERS = { top: NONE, bottom: NONE, left: NONE, right: NONE }

function lines(text: string, run: { size: number; color: string; bold?: boolean; italics?: boolean }): TextRun[] {
  return text.split('\n').map((line, i) => new TextRun({ text: line, font: FONT, break: i > 0 ? 1 : undefined, ...run }))
}

function titleBand(title: string, subtitle: string | null): Table {
  const children = [
    new Paragraph({ children: lines(title, { size: 56, color: 'FFFFFF', bold: true }), spacing: { before: 160, after: subtitle ? 60 : 160 } }),
  ]
  if (subtitle) {
    children.push(new Paragraph({ children: lines(subtitle, { size: 24, color: GOLD, bold: true }), spacing: { after: 160 } }))
  }
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: [CONTENT_WIDTH],
    layout: TableLayoutType.FIXED,
    borders: { ...NO_BORDERS, insideHorizontal: NONE, insideVertical: NONE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: CONTENT_WIDTH, type: WidthType.DXA },
            shading: { type: ShadingType.CLEAR, fill: FOREST, color: 'auto' },
            margins: { top: 200, bottom: 200, left: 320, right: 320 },
            borders: { ...NO_BORDERS, bottom: { style: BorderStyle.SINGLE, size: 36, color: ACCENTS[0].color } },
            children,
          }),
        ],
      }),
    ],
  })
}

function callout(label: string, text: string, accent: (typeof ACCENTS)[number]): Table {
  const children: Paragraph[] = []
  if (label) {
    children.push(new Paragraph({ children: lines(label.toUpperCase(), { size: 18, color: accent.color, bold: true }), spacing: { after: 60 } }))
  }
  children.push(new Paragraph({ children: lines(text, { size: 23, color: INK }), spacing: { line: 300 } }))
  const STRIP = 140
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: [STRIP, CONTENT_WIDTH - STRIP],
    layout: TableLayoutType.FIXED,
    borders: { ...NO_BORDERS, insideHorizontal: NONE, insideVertical: NONE },
    rows: [
      new TableRow({
        children: [
          // A solid strip cell instead of a cell border: shading renders the
          // same in Word, Google Docs, and Pages, borders don't.
          new TableCell({
            width: { size: STRIP, type: WidthType.DXA },
            shading: { type: ShadingType.CLEAR, fill: accent.color, color: 'auto' },
            borders: NO_BORDERS,
            children: [new Paragraph({ children: [] })],
          }),
          new TableCell({
            width: { size: CONTENT_WIDTH - STRIP, type: WidthType.DXA },
            shading: { type: ShadingType.CLEAR, fill: accent.tint, color: 'auto' },
            margins: { top: 140, bottom: 140, left: 260, right: 240 },
            borders: NO_BORDERS,
            children,
          }),
        ],
      }),
    ],
  })
}

const spacer = (after = 160) => new Paragraph({ children: [], spacing: { after } })

export async function buildDocx(model: DocModel): Promise<Buffer> {
  const children: FileChild[] = [titleBand(model.title, model.subtitle), spacer(200)]
  const numberedRefs: string[] = []
  let headingIndex = 0
  let calloutIndex = 0

  for (const block of model.blocks) {
    if (block.type === 'heading') {
      const accent = ACCENTS[headingIndex++ % ACCENTS.length]
      children.push(
        new Paragraph({
          children: lines(block.text, { size: 32, color: FOREST, bold: true }),
          keepNext: true,
          spacing: { before: 320, after: 120 },
          border: { left: { style: BorderStyle.SINGLE, size: 36, color: accent.color, space: 10 } },
          indent: { left: 200 },
        }),
      )
    } else if (block.type === 'paragraph') {
      children.push(new Paragraph({ children: lines(block.text, { size: 23, color: INK }), spacing: { after: 140, line: 300 } }))
    } else if (block.type === 'bullets') {
      for (const item of block.items) {
        children.push(
          new Paragraph({
            children: lines(item, { size: 23, color: INK }),
            numbering: { reference: 'bullets', level: 0 },
            spacing: { after: 80, line: 290 },
          }),
        )
      }
      children.push(spacer(80))
    } else if (block.type === 'numbered') {
      const reference = `numbers-${numberedRefs.length}`
      numberedRefs.push(reference)
      for (const item of block.items) {
        children.push(
          new Paragraph({
            children: lines(item, { size: 23, color: INK }),
            numbering: { reference, level: 0 },
            spacing: { after: 80, line: 290 },
          }),
        )
      }
      children.push(spacer(80))
    } else if (block.type === 'image') {
      const loaded = await loadImageBytes(block.image.url)
      if (!loaded) continue
      // Word sizes pictures in pixels at 96 per inch; 6 x 4 inches at most.
      const size = fitInside(block.image.width, block.image.height, 576, 384)
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 120, after: 60 },
          keepNext: true,
          children: [new ImageRun({ type: loaded.type, data: loaded.bytes, transformation: size, altText: { title: 'Picture', description: block.image.credit, name: 'picture' } })],
        }),
      )
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 160 },
          children: [new TextRun({ text: block.image.credit, font: FONT, size: 17, italics: true, color: '8A8A80' })],
        }),
      )
    } else {
      children.push(callout(block.label, block.text, ACCENTS[calloutIndex++ % ACCENTS.length]), spacer(160))
    }
  }

  const bulletLevel = {
    level: 0,
    format: LevelFormat.BULLET,
    text: '●',
    alignment: AlignmentType.LEFT,
    style: { run: { color: ACCENTS[0].color, size: 18 }, paragraph: { indent: { left: 540, hanging: 300 } } },
  }
  const doc = new Document({
    title: model.title,
    creator: 'Wivoza',
    styles: { default: { document: { run: { font: FONT, size: 23, color: INK } } } },
    numbering: {
      config: [
        { reference: 'bullets', levels: [bulletLevel] },
        ...numberedRefs.map((reference) => ({
          reference,
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: '%1.',
              alignment: AlignmentType.LEFT,
              style: { run: { color: ACCENTS[0].color, bold: true }, paragraph: { indent: { left: 540, hanging: 360 } } },
            },
          ],
        })),
      ],
    },
    sections: [
      {
        properties: { page: { margin: { top: 1000, bottom: 1000, left: 1296, right: 1296 } } },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({ text: 'Wivoza  ·  ', font: FONT, size: 18, color: ACCENTS[0].color, bold: true }),
                  new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 18, color: '8A8A80' }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  })
  return Packer.toBuffer(doc)
}
