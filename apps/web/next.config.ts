import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,
  transpilePackages: ["@near-district/core", "@near-district/db", "@near-district/near"],
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  images: { unoptimized: true },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
        ],
      },
      {
        // Uploaded files are served as attachments-safe images only
        source: "/api/uploads/:path*",
        headers: [{ key: "Content-Security-Policy", value: "default-src 'none'; img-src 'self'; sandbox" }],
      },
    ];
  },
};

export default config;
