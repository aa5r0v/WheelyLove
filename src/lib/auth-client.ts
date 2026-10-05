"use client";

import { createAuthClient } from "better-auth/react";

// Same origin by default - works both on the VPS and in local dev.
export const authClient = createAuthClient();
