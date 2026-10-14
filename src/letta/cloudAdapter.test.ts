import { describe, expect, it } from "vitest";
// stripRemindersFromText / contentToParts are not exported individually —
// test through the public surface by importing the module's helpers.
// They are small pure functions; re-implementing the import via the module
// keeps the test honest (no mocking).
import { contentToParts, stripRemindersFromText } from "../letta/cloudAdapter";

describe("stripRemindersFromText", () => {
  it("strips full system-reminder blocks", () => {
    const input =
      "<system-reminder>\nThis is an automated message\n</system-reminder>тест";
    expect(stripRemindersFromText(input)).toBe("тест");
  });

  it("strips multiple blocks and keeps inner text", () => {
    const input = [
      "<system-reminder>one</system-reminder>",
      "<system-reminder>two</system-reminder>",
      "привет",
    ].join("\n");
    expect(stripRemindersFromText(input)).toBe("привет");
  });

  it("strips stray single tags", () => {
    expect(stripRemindersFromText("</system-reminder>ок")).toBe("ок");
  });

  it("returns empty for pure reminder messages", () => {
    const input =
      "<system-reminder>only context</system-reminder>";
    expect(stripRemindersFromText(input)).toBe("");
  });
});

describe("contentToParts", () => {
  it("parses stringified parts array (text + image)", () => {
    const content = JSON.stringify([
      { type: "text", text: "<system-reminder>ctx</system-reminder>" },
      { type: "text", text: "вот скрин" },
      { type: "image", source: { type: "base64", data: "xx" } },
    ]);
    expect(contentToParts(content)).toEqual([
      { type: "text", text: "вот скрин" },
      { type: "image" },
    ]);
  });

  it("parses already-array content preserving order", () => {
    const content = [
      { type: "text", text: "кнопка [1] тут" },
      { type: "image" },
    ];
    expect(contentToParts(content)).toEqual(content);
  });

  it("plain string passes through reminder-stripped", () => {
    expect(contentToParts("мир")).toEqual([{ type: "text", text: "мир" }]);
  });

  it("empty after strip → no parts", () => {
    expect(
      contentToParts("<system-reminder>x</system-reminder>"),
    ).toEqual([]);
  });
});
