"use client";

import { SolarflareProvider } from "@solarflare/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import React, { useState } from "react";
import { trpc } from "./trpc";

export const Providers = ({ children }: { children: React.ReactNode }) => {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: process.env.NEXT_PUBLIC_BACKEND_URL!,
        }),
      ],
    })
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <SolarflareProvider
          // TODO: remove JWT requirement
          jwt="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.c_nTJVPMK8eWF_-ILeasFG64Nlz_oan3qlRi-nPC3fo"
          // eslint-disable-next-line turbo/no-undeclared-env-vars, @typescript-eslint/no-non-null-assertion -- Not declaring in Turbo as this is just an example repo
          solarflareUrl={process.env.NEXT_PUBLIC_SOLARFLARE_URL!}
        >
          {children}
        </SolarflareProvider>
      </QueryClientProvider>
    </trpc.Provider>
  );
};
