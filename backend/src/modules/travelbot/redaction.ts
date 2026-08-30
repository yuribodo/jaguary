const redactionPatterns: RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{8,}\b/g,
  /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}\b/gi,
  /-----BEGIN [^-]*(?:PRIVATE KEY|CERTIFICATE)-----[\s\S]*?-----END [^-]*(?:PRIVATE KEY|CERTIFICATE)-----/g,
  /\b(?:api[_-]?key|private[_-]?key|secret|token|password|cvv|pan)\s*[:=]\s*[^\s,;]+/gi,
  /\b(?:\d[ -]*?){13,19}\b/g,
];

export function redactSensitiveText(value: string): string {
  return redactionPatterns.reduce(
    (redacted, pattern) => redacted.replace(pattern, "[REDACTED]"),
    value,
  );
}

export function sanitizedErrorCode(error: unknown): string {
  if (error instanceof Error && /^[A-Za-z0-9._:-]{1,64}$/.test(error.name)) return error.name;
  return "internal_error";
}
