import type { Theme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";
import { emptyBuckets } from "../../lib/session-tokens.js";
import { TokensComponent } from "./tokens-display.js";

const theme = {
  bold: (text: string) => `\x1b[1m${text}\x1b[22m`,
  fg: (_color: string, text: string) => `\x1b[36m${text}\x1b[39m`,
} as Theme;

describe("TokensComponent", () => {
  it("keeps loading and every loaded tab within the terminal width after resizing", () => {
    const component = new TokensComponent(
      theme,
      { requestRender: () => {} },
      () => {},
      () => {},
    );
    const checkWidths = () => {
      for (const width of [80, 48, 20, 1, 0, 48, 80]) {
        for (const line of component.render(width)) {
          expect(visibleWidth(line), `width ${width}: ${line}`).toBeLessThanOrEqual(width);
        }
      }
    };

    try {
      checkWidths();
      component.setState({
        type: "loaded",
        result: {
          totals: emptyBuckets(),
          byModel: [],
          byProvider: [],
          bySession: [],
          sessionCount: 0,
          messageCount: 0,
        },
      });
      for (const key of ["1", "2", "3"]) {
        component.handleInput(key);
        checkWidths();
      }
    } finally {
      component.destroy();
    }
  });
});
