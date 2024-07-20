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
    const rerender = useRerender();

    const sf = useContext(Context);
    const tableEntry = sf?.tables.get(tableName);

    useEffect(() => {
      if (sf === undefined) {
        throw new Error(
          "Solarflare context not found. Do you need to wrap your app in a Solarflare provider?"
        );
      }

      if (tableEntry === undefined || tableEntry.status === "loading") {
        sf.subscribe(tableName, rerender);
      }

      return () => {
        // TODO: unsubscribe
      };
    }, []);

    return tableEntry?.status === "ready"
      ? {
          loading: false,
          data: tableEntry.table as unknown as Table<DB[KInput]>,
        }
      : { loading: true };
  };

  return { Provider, useTable };
};
