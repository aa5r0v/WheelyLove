import { describe, it, expect } from "vitest";
import { detectImageType } from "./storage";

describe("detectImageType", () => {
  it("detects JPEG, PNG and WebP by magic bytes", () => {
    expect(detectImageType(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0]))).toBe("image/jpeg");
    expect(
      detectImageType(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))
    ).toBe("image/png");
    const webp = new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ");
    expect(detectImageType(webp)).toBe("image/webp");
  });
  it("rejects everything else (html, svg, gif, empty)", () => {
    const enc = (s: string) => new TextEncoder().encode(s);
    expect(detectImageType(enc("<html><script>alert(1)</script>"))).toBeNull();
    expect(detectImageType(enc("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeNull();
    expect(detectImageType(enc("GIF89a...."))).toBeNull();
    expect(detectImageType(new Uint8Array())).toBeNull();
  });
});
