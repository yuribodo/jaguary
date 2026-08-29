import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

interface PostmanItem {
  name?: string;
  item?: PostmanItem[];
  request?: {
    method?: string;
    url?: { raw?: string };
  };
  event?: Array<{ listen?: string; script?: { exec?: string[] } }>;
}

interface PostmanCollection {
  info?: { name?: string; schema?: string };
  variable?: Array<{ key?: string; value?: string }>;
  event?: Array<{ listen?: string; script?: { exec?: string[] } }>;
  item?: PostmanItem[];
}

const collectionUrl = new URL("../postman/Bound API.postman_collection.json", import.meta.url);

function flattenItems(items: PostmanItem[]): PostmanItem[] {
  return items.flatMap((item) => item.item === undefined ? [item] : flattenItems(item.item));
}

test("Postman collection is valid JSON with executable current routes", async () => {
  const source = await readFile(collectionUrl, "utf8");
  const collection = JSON.parse(source) as PostmanCollection;

  assert.equal(collection.info?.name, "Bound API");
  assert.equal(
    collection.info?.schema,
    "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
  );

  const variables = Object.fromEntries(
    (collection.variable ?? []).map((variable) => [variable.key, variable.value]),
  );
  assert.equal(variables.baseUrl, "http://localhost:3001");
  assert.ok(variables.correlationId);
  assert.ok(variables.idempotencyKey);
  assert.equal(variables.checkoutId, "checkout_vy_471_gru_cor");
  assert.equal(variables.checkoutHash, "d2f3856b7bac0531b71ac6ff9e2e2fd7f970d38d3fcef79afde052b77b0f071d");
  assert.ok(variables.orderId);

  const requests = flattenItems(collection.item ?? []);
  assert.deepEqual(
    requests.map((item) => item.name),
    [
      "Root",
      "Health",
      "Register TravelBot identity",
      "Read TravelBot identity",
      "Reject invalid agent request proof",
      "Create mandate rejects unknown fields",
      "Read missing mandate",
      "Activate missing mandate",
      "Revoke missing mandate",
      "VuelaYa UCP profile",
      "List VuelaYa flights",
      "Create signed checkout",
      "Read signed checkout",
      "Complete authorized checkout",
      "Read VuelaYa order",
      "Checkout rejects client total",
      "Bound Verify rejects invalid proof",
      "Unknown route returns error envelope",
      "Mutable request rejects missing Idempotency-Key",
      "Mutable request rejects invalid Idempotency-Key",
      "Mutable request accepts valid Idempotency-Key",
    ],
  );
  assert.ok(requests.every((item) => item.request?.method !== undefined));
  assert.ok(requests.every((item) => item.request?.url?.raw?.startsWith("{{baseUrl}}/")));
  assert.ok(requests.every((item) => item.event?.some((event) => event.listen === "test")));
  assert.ok(collection.event?.some((event) => event.listen === "test"));
});

test("Postman collection contains no payment secrets or reusable credential material", async () => {
  const source = (await readFile(collectionUrl, "utf8")).toLowerCase();
  const forbiddenKeys = [
    "card_number",
    "security_code",
    "private_secret",
    "reusable_token",
  ];
  for (const forbiddenKey of forbiddenKeys) {
    assert.equal(source.includes(forbiddenKey), false, `${forbiddenKey} must not be present`);
  }
});
