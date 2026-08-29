import { createHash } from "node:crypto";

function assertValidUnicode(value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        throw new TypeError("JCS input contains an unpaired high surrogate");
      }
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new TypeError("JCS input contains an unpaired low surrogate");
    }
  }
}

/**
 * Serializes JSON data according to RFC 8785 (JSON Canonicalization Scheme).
 * Callers must validate signed content with its strict Zod schema first.
 */
export function canonicalizeJson(value: unknown): string {
  if (value === null) return "null";

  if (typeof value === "string") {
    assertValidUnicode(value);
    return JSON.stringify(value);
  }

  if (typeof value === "boolean") return value ? "true" : "false";

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("JCS only supports finite JSON numbers");
    }
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${Array.from(value, (item, index) => {
      if (!(index in value) || item === undefined) {
        throw new TypeError("JCS does not support sparse arrays or undefined values");
      }
      return canonicalizeJson(item);
    }).join(",")}]`;
  }

  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("JCS input must contain only plain JSON objects");
    }

    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys.map((key) => {
      assertValidUnicode(key);
      if (record[key] === undefined) {
        throw new TypeError("JCS does not support undefined object values");
      }
      return `${JSON.stringify(key)}:${canonicalizeJson(record[key])}`;
    }).join(",")}}`;
  }

  throw new TypeError(`JCS does not support values of type ${typeof value}`);
}

export function sha256CanonicalJson(value: unknown): string {
  return createHash("sha256").update(canonicalizeJson(value), "utf8").digest("hex");
}
