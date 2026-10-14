import { describe, expect, it } from "vitest";
import { extractModelInfo } from "../letta/modelInfo";

describe("extractModelInfo", () => {
  it("returns null for missing conversation", () => {
    expect(extractModelInfo(null, [])).toBeNull();
    expect(extractModelInfo(undefined, [])).toBeNull();
  });

  it("computes percent from chars/4", () => {
    const conv = {
      model: "m/x",
      context_window_limit: 400,
      in_context_message_ids: ["a", "b"],
    };
    const messages = [
      { id: "a", content: "1234" }, // 4 chars → 1 token
      { id: "b", content: "12345678" }, // 8 chars → 2 tokens
    ];
    const info = extractModelInfo(conv, messages)!;
    expect(info.model).toBe("m/x");
    expect(info.usage.usedEstimate).toBe(3);
    expect(info.usage.percent).toBe(0.8);
    expect(info.usage.inContextMessages).toBe(2);
  });

  it("ignores messages outside in-context set", () => {
    const conv = {
      model: "m",
      context_window_limit: 100,
      in_context_message_ids: ["a"],
    };
    const messages = [
      { id: "a", content: "abcd" },
      { id: "zzz", content: "xxxx".repeat(100) },
    ];
    const info = extractModelInfo(conv, messages)!;
    expect(info.usage.usedEstimate).toBe(1);
    expect(info.usage.inContextMessages).toBe(1);
  });

  it("zero limit → percent 0, no NaN", () => {
    const conv = { model: "m", context_window_limit: 0, in_context_message_ids: [] };
    const info = extractModelInfo(conv, [])!;
    expect(info.usage.percent).toBe(0);
    expect(info.usage.usedEstimate).toBe(0);
  });

  it("null content messages count as 0 chars", () => {
    const conv = { model: "m", context_window_limit: 100, in_context_message_ids: ["a"] };
    const info = extractModelInfo(conv, [{ id: "a", content: null }])!;
    expect(info.usage.usedEstimate).toBe(0);
  });
});
