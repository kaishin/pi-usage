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

      const tokens = {
        ...emptyBuckets(),
        input: 1000,
        output: 500,
        totalTokens: 1500,
        costTotal: 12.5,
      };
      component.setState({
        type: "loaded",
        result: {
          totals: tokens,
          byProvider: [{ provider: "provider-界", tokens, messageCount: 1 }],
          byModel: [{
            provider: "provider-界",
            model: "model-界".repeat(12),
            tokens,
            messageCount: 1,
          }],
          bySession: [{
            sessionId: "session-id",
            sessionPath: "/tmp/session.jsonl",
            cwd: "/tmp/project",
            name: "session-界".repeat(12),
            created: new Date("2026-10-24T00:00:00Z"),
            tokens,
            messageCount: 1,
          }],
          sessionCount: 1,
          messageCount: 1,
        },
      });
      for (const [key, label] of [
        ["1", "provider-界"],
        ["2", "model-界"],
        ["3", "session-界"],
      ]) {
        component.handleInput(key);
        const output = component.render(200).join("\n");
        expect(output).toContain(label);
        expect(output).toContain("█");
        expect(output).toContain("$12.50");
        checkWidths();
      }
    } finally {
      component.destroy();
    }
  });
});
