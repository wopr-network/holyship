import { createPrivateKey, createSign } from "node:crypto";

/**
 * Generate a GitHub App JWT for authenticating as the app.
 * Valid for 10 minutes (GitHub maximum).
 */
function generateAppJwt(appId: string, privateKey: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iat: now - 60, // 1 minute in the past for clock drift
      exp: now + 600, // 10 minutes
      iss: appId,
    }),
  ).toString("base64url");

  const signingInput = `${header}.${payload}`;
  const key = createPrivateKey(privateKey);
  const signature = createSign("RSA-SHA256").update(signingInput).sign(key, "base64url");

  return `${signingInput}.${signature}`;
}

export interface InstallationToken {
  token: string;
  expiresAt: Date;
}

/**
 * Generate a short-lived installation access token for a GitHub App installation.
 * The token is valid for 1 hour and can be used for both REST API and git push.
 */
export async function generateInstallationToken(
  installationId: number,
  appId: string,
  privateKey: string,
): Promise<InstallationToken> {
  const jwt = generateAppJwt(appId, privateKey);

  const res = await fetch(`https://api.github.com/app/installations/${installationId}/access_tokens`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub installation token request failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as { token: string; expires_at: string };
  return {
    token: data.token,
    expiresAt: new Date(data.expires_at),
  };
}
