/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Static security headers for every response. (The Content-Security-Policy is added per
  // request by middleware.ts because it carries a nonce.)
  productionBrowserSourceMaps: false, // never ship source maps to visitors
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" }, // popups: wallet sign-in windows keep working
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
          { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
        ],
      },
    ];
  },
  webpack: (config, { webpack }) => {
    // RainbowKit's default wallet list includes Coinbase's "Base Account"
    // connector, which pulls in @coinbase/cdp-sdk purely for an optional
    // "Base Pay" (x402) crypto-payments feature we never use. Several of its
    // @x402/* submodules aren't resolvable packages in recent releases,
    // which fails the whole build even though nothing in our app calls this
    // code path. Ignoring the whole @x402/* namespace covers every variant.
    config.plugins.push(new webpack.IgnorePlugin({ resourceRegExp: /^@x402\// }));

    // A few other optional wallet-SDK deps commonly trip the same class of
    // error; harmless to no-op them since none are used here.
    config.resolve.fallback = {
      ...config.resolve.fallback,
      "pino-pretty": false,
      lokijs: false,
      encoding: false,
      "@react-native-async-storage/async-storage": false,
    };
    return config;
  },
};
module.exports = nextConfig;
