"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Solarflare } from "./solarflare";

/**
 * Utility hook to trigger re-renders.
 */
export const useRerender = () => {
  const setTick = useState(0)[1];
  return () => setTick((t) => t + 1);
};

export type UseTable<Row> =
  | { readonly loading: true; readonly data: undefined }
  | { readonly loading: false; readonly data: Row[] };

export type UseTableOptions<Row> = {
  sort?: (a: Row, b: Row) => number;
};

export const createSolarflare = <DB extends Record<string, any>>() => {
  const Context = createContext<Solarflare | undefined>(undefined);

  const Provider = ({
    jwt,
    solarflare_url,
    children,
  }: {
    jwt: string;
    solarflare_url: string;
    children: React.ReactNode;
  }) => {
    const sf = useRef(new Solarflare(solarflare_url, jwt));

    useEffect(() => {
      // If a new JWT is passed in, we set it on the Solarflare client instance.
      sf.current.setJwt(jwt);
    }, [jwt]);

    return <Context.Provider value={sf.current}>{children}</Context.Provider>;
  };

  type K = Extract<keyof DB, string>;

  const useTable = <KInput extends K>(
    tableName: KInput,
    options?: UseTableOptions<DB[KInput]>
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
    }, [tableName, tableEntry, rerender, sf]);

    if (tableEntry === undefined || tableEntry?.status === "loading") {
      return { loading: true, data: undefined };
    }

    const data = Array.from(
      tableEntry.table.values()
    ) as unknown as DB[KInput][];

    // Perform an in-place sort of the array
    if (options?.sort !== undefined) {
      data.sort(options.sort);
    }

    return {
      loading: false,
      data,
    };
  };

  return { Provider, useTable };
};
