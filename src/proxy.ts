import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "./i18n/routing";

export default function proxy(request: NextRequest) {
  const { pathname } = new URL(request.url);
  // /en/api/* (и /en/uploads/*) никога не бива да се резолвират до
  // непрефикснатите си цели: nginx политиките (rate limits, auth_request,
  // статичните файлове) важат за точно тези пътища. Явно 404, не „случайно
  // нямаме такъв маршрут“.
  if (/^\/(bg|en)\/(api|uploads)(\/|$)/.test(pathname)) {
    return new NextResponse(null, { status: 404 });
  }
  return createMiddleware(routing)(request);
}

export const config = {
  // Изключени: API маршрутите, /uploads (статичните качвания), вътрешните
  // Next активи и всичко с точка (sw.js, manifest.webmanifest, *.png, икони).
  matcher: ["/((?!api|uploads|_next|_vercel|.*\\..*).*)"],
};
