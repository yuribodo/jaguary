import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { LandingSessionNavView } from "./LandingSessionNav";

test("an authenticated visitor sees their saved session in the landing navigation", () => {
  const markup = renderToStaticMarkup(
    <LandingSessionNavView
      session={{
        authenticated: true,
        principal: { principal_id: "principal_marta", display_name: "Marta Ribeiro" },
        assurance: "OIDC",
        demo: false,
        csrf_token: "csrf_test",
        expires_at: "2026-08-31T12:00:00.000Z",
      }}
      status="ready"
    />,
  );

  assert.match(markup, /href="\/dashboard"/);
  assert.match(markup, />Marta Ribeiro</);
  assert.doesNotMatch(markup, />Open demo</);
});

test("a signed-out visitor keeps the demo entry point", () => {
  const markup = renderToStaticMarkup(
    <LandingSessionNavView session={{ authenticated: false }} status="ready" />,
  );

  assert.match(markup, /href="\/demo"/);
  assert.match(markup, />Open demo</);
});

test("the landing navigation does not flash a signed-out action while checking the session", () => {
  const markup = renderToStaticMarkup(
    <LandingSessionNavView status="checking" />,
  );

  assert.match(markup, /aria-label="Checking session"/);
  assert.doesNotMatch(markup, />Open demo</);
});
