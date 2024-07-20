"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Solarflare, Table } from "./solarflare";

/**
 * Utility hook to trigger re-renders.
 */
export const useRerender = () => {
  const setTick = useState(0)[1];
  return () => setTick((t) => t + 1);
};

export type UseTable<Row> =
  | { readonly loading: true }
  | { readonly loading: false; readonly data: Table<Row> };

export const createSolarflare = <DB extends Record<string, any>>() => {
  const Context = createContext<Solarflare<DB> | undefined>(undefined);

  const Provider = ({
    jwt,
    solarflare_url,
    children,
  }: {
    jwt: string;
    solarflare_url: string;
    children: React.ReactNode;
  }) => {
    const sf = useRef(new Solarflare<DB>(solarflare_url, jwt));

    useEffect(() => {
      // If a new JWT is passed in, we set it on the Solarflare client instance.
      sf.current.setJwt(jwt);
    }, [jwt]);

    return <Context.Provider value={sf.current}>{children}</Context.Provider>;
  };

  type K = Extract<keyof DB, string>;

  const useTable = <KInput extends K>(
    tableName: KInput
  ): UseTable<DB[KInput]> => {
    const sf = useContext(Context);

    const rerender = useRerender();

    if (sf === undefined) {
      throw new Error(
        "Solarflare client not instantiated. Do you need to wrap your app in a Solarflare provider?"
      );
    }

    const tableEntry = sf.tables.get(tableName);

    if (tableEntry === undefined || tableEntry.status === "loading") {
      sf.subscribe(tableName, rerender);
      return { loading: true } as const;
    }

    return {
      loading: false,
      data: tableEntry.table as unknown as Table<DB[KInput]>,
    } as const;
  };

  return { Provider, useTable };
};
