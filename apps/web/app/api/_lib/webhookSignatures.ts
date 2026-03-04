import { createHmac, timingSafeEqual } from "node:crypto";

function normalizeSignature(signature: string) {
  return signature.trim().replace(/^sha256=/i, "");
}

function secureEquals(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function buildHmacVariants(secret: string, payload: string) {
  const hex = createHmac("sha256", secret).update(payload).digest("hex");
  const base64 = createHmac("sha256", secret).update(payload).digest("base64");

  return [hex, base64, `sha256=${hex}`, `sha256=${base64}`];
}

export function verifyInstagramWebhookSignature(args: {
  rawBody: string;
  signatureHeader: string | null;
  appSecret: string | undefined;
}) {
  if (!args.appSecret) {
    return {
      ok: false as const,
      status: 500,
      error: "Missing Instagram webhook secret"
    };
  }

  if (!args.signatureHeader) {
    return {
      ok: false as const,
      status: 400,
      error: "Missing Instagram signature header"
    };
  }

  const expectedSignature = createHmac("sha256", args.appSecret)
    .update(args.rawBody)
    .digest("hex");
  const receivedSignature = normalizeSignature(args.signatureHeader);

  if (!secureEquals(receivedSignature, expectedSignature)) {
    return {
      ok: false as const,
      status: 401,
      error: "Invalid Instagram signature"
    };
  }

  return { ok: true as const };
}

export function verifyTiktokWebhookSignature(args: {
  rawBody: string;
  signatureHeader: string | null;
  signingSecret: string | undefined;
  requestTimestampHeader: string | null;
}) {
  if (!args.signingSecret) {
    return {
      ok: false as const,
      status: 500,
      error: "Missing TikTok webhook secret"
    };
  }

  if (!args.signatureHeader) {
    return {
      ok: false as const,
      status: 400,
      error: "Missing TikTok signature header"
    };
  }

  const payloadVariants: string[] = [args.rawBody];
  const timestamp = args.requestTimestampHeader?.trim();
  if (timestamp) {
    payloadVariants.unshift(`${timestamp}.${args.rawBody}`, `${timestamp}${args.rawBody}`);
  }

  const expectedSignatures = payloadVariants.flatMap((payload) =>
    buildHmacVariants(args.signingSecret!, payload)
  );

  const receivedSignature = normalizeSignature(args.signatureHeader);
  const isValid = expectedSignatures.some((candidate) => {
    const normalizedCandidate = normalizeSignature(candidate);
    return secureEquals(receivedSignature, normalizedCandidate);
  });

  if (!isValid) {
    return {
      ok: false as const,
      status: 401,
      error: "Invalid TikTok signature"
    };
  }

  return { ok: true as const };
}
