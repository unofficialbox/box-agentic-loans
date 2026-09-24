import { describe, expect, it } from "vitest";
import { greeting } from "../src/greeting";

const at = (hour: number) => new Date(2026, 8, 24, hour, 30);

describe("greeting", () => {
  it("follows the officer's local clock", () => {
    expect([4, 5, 11, 12, 17, 18, 23].map(hour => greeting(at(hour)))).toEqual([
      "Good evening",
      "Good morning",
      "Good morning",
      "Good afternoon",
      "Good afternoon",
      "Good evening",
      "Good evening",
    ]);
  });
});
