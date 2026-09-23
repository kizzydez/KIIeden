"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { RainbowKitProvider, darkTheme, lightTheme } from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import { wagmiConfig } from "@/lib/wagmi";
import { ToastProvider } from "@/components/Toast";
import { useTheme } from "@/components/ThemeProvider";

const darkPurple = darkTheme({ accentColor: "#9b5cff", accentColorForeground: "white", borderRadius: "large", overlayBlur: "small" });
const lightPurple = lightTheme({ accentColor: "#6a1fe0", accentColorForeground: "white", borderRadius: "large", overlayBlur: "small" });

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
      })
  );
  const { theme } = useTheme(); // the wallet modal follows the site's own light/dark choice

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={theme === "light" ? lightPurple : darkPurple}>
          <ToastProvider>{children}</ToastProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
