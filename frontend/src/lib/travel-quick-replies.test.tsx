import assert from "node:assert/strict";
import test from "node:test";

import { travelQuickReplyGroup } from "@/lib/travel-quick-replies";

test("returns choices for the first missing trip detail", () => {
  const group = travelQuickReplyGroup(["origin_iata", "departure_date"]);

  assert.equal(group?.field, "origin_iata");
  assert.equal(group?.question, "Where are you leaving from?");
  assert.deepEqual(group?.options.map(({ description }) => description), ["GRU", "GIG", "BSB"]);
});

test("creates upcoming month choices from the current date", () => {
  const group = travelQuickReplyGroup(["departure_date"], new Date(2026, 7, 30));

  assert.deepEqual(
    group?.options.map(({ description, label, value }) => ({ description, label, value })),
    [
      { description: "2026", label: "September", value: "I want to travel in September 2026." },
      { description: "2026", label: "October", value: "I want to travel in October 2026." },
      { description: "2026", label: "November", value: "I want to travel in November 2026." },
    ],
  );
});

test("does not offer replies when the trip request is complete", () => {
  assert.equal(travelQuickReplyGroup([]), undefined);
});

test("never suggests the selected origin again as the destination", () => {
  const group = travelQuickReplyGroup(
    ["destination_iata"],
    new Date("2026-08-30T12:00:00.000Z"),
    { origin_iata: "GIG", destination_iata: null },
  );

  assert.equal(group?.options.some(({ description }) => description === "GIG"), false);
  assert.deepEqual(group?.options.map(({ description }) => description), ["GRU", "COR", "BSB"]);
});

test("never suggests the selected destination again as the origin", () => {
  const group = travelQuickReplyGroup(
    ["origin_iata"],
    new Date("2026-08-30T12:00:00.000Z"),
    { origin_iata: null, destination_iata: "GIG" },
  );

  assert.equal(group?.options.some(({ description }) => description === "GIG"), false);
});
