"use client";

import { createAuthClient } from "better-auth/react";

// Same origin by default - works both on the VPS and in local dev.
export const authClient = createAuthClient();

// Password login uses its callback for verification emails; the form handles
// successful login navigation. Keep the default redirect plugin for OAuth.
export const emailAuthClient = createAuthClient({
  disableDefaultFetchPlugins: true,
});
