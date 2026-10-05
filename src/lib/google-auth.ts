// "Sign in with Google" exists only when BOTH variables are set. Without them
// the provider is not registered in Better Auth and the buttons are not rendered.
export function googleCredentials(env: Record<string, string | undefined> = process.env) {
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export function isGoogleEnabled(env: Record<string, string | undefined> = process.env) {
  return googleCredentials(env) !== null;
}
