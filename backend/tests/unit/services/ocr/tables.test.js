import { describe, it, expect } from "vitest";
import {
  extractTablesFromBlocks,
  collectWordsFromBlocks,
  matrixToMarkdown,
} from "../../../../services/ocr/tables.js";

function word(text, x0, y0, x1, y1) {
  return { text, confidence: 90, bbox: { x0, y0, x1, y1 } };
}

describe("ocr tables", () => {
  it("collects words from blocks", () => {
    const blocks = [
      {
        paragraphs: [
          {
            lines: [
              {
                words: [word("A", 0, 0, 10, 10), word("B", 40, 0, 50, 10)],
              },
            ],
          },
        ],
      },
    ];
    expect(collectWordsFromBlocks(blocks)).toHaveLength(2);
  });

  it("builds a markdown table from a grid of words", () => {
    const blocks = [
      {
        paragraphs: [
          {
            lines: [
              {
                words: [
                  word("Item", 0, 0, 40, 12),
                  word("Qty", 120, 0, 150, 12),
                  word("Price", 220, 0, 270, 12),
                ],
              },
              {
                words: [
                  word("Tea", 0, 20, 30, 32),
                  word("2", 120, 20, 135, 32),
                  word("40", 220, 20, 245, 32),
                ],
              },
              {
                words: [
                  word("Bun", 0, 40, 30, 52),
                  word("1", 120, 40, 135, 52),
                  word("20", 220, 40, 245, 52),
                ],
              },
            ],
          },
        ],
      },
    ];

    const { tables, markdown } = extractTablesFromBlocks(blocks);
    expect(tables.length).toBe(1);
    expect(tables[0].columnCount).toBe(3);
    expect(markdown).toContain("| Item | Qty | Price |");
    expect(markdown).toContain("| Tea | 2 | 40 |");
  });

  it("returns empty when layout is not tabular", () => {
    const blocks = [
      {
        paragraphs: [
          {
            lines: [
              { words: [word("Hello", 0, 0, 40, 12), word("world", 45, 0, 90, 12)] },
              { words: [word("Just", 0, 20, 30, 32), word("prose", 35, 20, 80, 32)] },
            ],
          },
        ],
      },
    ];
    const { tables, markdown } = extractTablesFromBlocks(blocks);
    expect(tables).toEqual([]);
    expect(markdown).toBe("");
  });

  it("formats a matrix as markdown", () => {
    const md = matrixToMarkdown([
      ["A", "B"],
      ["1", "2"],
    ]);
    expect(md).toBe("| A | B |\n| --- | --- |\n| 1 | 2 |");
  });
});
