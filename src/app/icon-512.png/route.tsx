import { ImageResponse } from "next/og";
import { readFileSync } from "fs";
import { join } from "path";

export function GET() {
  const logoData = readFileSync(join(process.cwd(), "public", "logo.png"));
  const logoBase64 = `data:image/png;base64,${logoData.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#ffffff",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoBase64} width={448} height={448} alt="" />
      </div>
    ),
    { width: 512, height: 512 }
  );
}
