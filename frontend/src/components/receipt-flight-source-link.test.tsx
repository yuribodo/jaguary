import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { ReceiptFlightSourceLink } from "./receipt-flight-source-link";

test("the purchase receipt links to the persisted official flight source", () => {
  const markup = renderToStaticMarkup(
    <ReceiptFlightSourceLink sourceUrl="https://www.google.com/travel/flights/search?tfs=demo" />,
  );

  assert.match(markup, /href="https:\/\/www\.google\.com\/travel\/flights\/search\?tfs=demo"/);
  assert.match(markup, /target="_blank"/);
  assert.match(markup, /rel="noreferrer"/);
  assert.match(markup, /Open in Google Flights/);
});

test("the purchase receipt omits the source action for legacy receipts", () => {
  assert.equal(renderToStaticMarkup(<ReceiptFlightSourceLink />), "");
});
