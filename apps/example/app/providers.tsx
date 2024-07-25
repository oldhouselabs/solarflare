"use client";

import { SolarflareProvider } from "@solarflare/client";
import { useEffect, useState } from "react";

export const Providers = ({ children }: { children: React.ReactNode }) => {
  const [JWT, setJWT] = useState<string>();
  const [userId, setUserId] = useState<number>();

  useEffect(() => {
    // This is the JWT token of the authorised user. It would usually come from
    // the backend or auth provider. It contains a single claim stating who the
    // user is. It can be verified with a secret key.
    // To demonstrate that the system correctly replicates only the subset of the
    // table visible to each user, we have a JWT for each user (`user_id: 1` and
    // `user_id: 2`) and we randomly select one on each refresh.
    const JWT1 =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwiaWF0IjoxNzIxMjYwODkxfQ.pF4DjT1R0PucdT6jDShLK1wM62nDu67OZR4Zmoz7F2E";

    const JWT2 =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOjIsImlhdCI6MTcyMTI3NzIwOX0.2WAG8ZQJMqFIdhj4MP-TIQCoFSTNmOg2BEFxrxg-aV0";

    const rand = Math.random();
    setJWT(rand > 0.5 ? JWT1 : JWT2);
    setUserId(rand > 0.5 ? 1 : 2);
  }, []);

  if (!JWT || !userId) return <></>;

  return (
    <SolarflareProvider
      jwt={JWT}
      // eslint-disable-next-line turbo/no-undeclared-env-vars -- Not declaring in Turbo as this is just an example repo -- Not declaring in Turbo as this is just an example repo
      solarflareUrl={process.env.NEXT_PUBLIC_SOLARFLARE_URL!}
    >
      <p>User: {userId}</p>
      {children}
    </SolarflareProvider>
  );
};
