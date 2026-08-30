import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { PendingVerificationControls } from "./PendingVerificationControls";

const noop = () => undefined;

test("a pending operator can check status or restart a verification that never began", () => {
  const markup = renderToStaticMarkup(
    <PendingVerificationControls
      busy={false}
      consent={false}
      restarting={false}
      onCancel={noop}
      onConsentChange={noop}
      onRefresh={noop}
      onRestart={noop}
      onStart={noop}
    />,
  );

  assert.match(markup, /Check status/);
  assert.match(markup, /Restart verification/);
});

test("restarting a pending verification requires fresh explicit consent", () => {
  const markup = renderToStaticMarkup(
    <PendingVerificationControls
      busy={false}
      consent={false}
      restarting
      onCancel={noop}
      onConsentChange={noop}
      onRefresh={noop}
      onRestart={noop}
      onStart={noop}
    />,
  );

  assert.match(markup, /I consent to opening Didit for a new identity verification session/);
  assert.match(markup, /<button[^>]*disabled=""[^>]*>Start new check<\/button>/);
});
