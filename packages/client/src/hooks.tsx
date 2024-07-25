"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import {
  SlotInserted,
  SlotNormal,
  SlotUpdated,
  Solarflare,
} from "./solarflare";
import { OptimisticChange } from "./optimistic";

/**
 * Utility hook to trigger re-renders.
 */
export const useRerender = () => {
  const setTick = useState(0)[1];
  return () => setTick((t) => t + 1);
};

export type UseTable<Row extends object> =
  | {
      readonly isLoading: true;
      readonly data: undefined;
      readonly optimistic: undefined;
    }
  | {
      readonly isLoading: false;
      readonly data: Row[];
      optimistic: (change: OptimisticChange<Row>) => { rollback: () => void };
    };

export type UseTableOptions<Row> = {
  /**
   * Comparison function to define a sort ordering on the table rows.
   */
  sort?: (a: Row, b: Row) => number;
};

const Context = createContext<Solarflare | undefined>(undefined);

export const SolarflareProvider = ({
  jwt,
  solarflareUrl,
  children,
}: {
  jwt: string;
  solarflareUrl: string;
  children: React.ReactNode;
}) => {
  const sf = useRef(new Solarflare(solarflareUrl, jwt));

  useEffect(() => {
    // If a new JWT is passed in, we set it on the Solarflare client instance.
    sf.current.setJwt(jwt);
  }, [jwt]);

  return <Context.Provider value={sf.current}>{children}</Context.Provider>;
};

export const createSolarflare = <
  DB extends Record<string, object> = Record<string, object>,
>() => {
  type K = Extract<keyof DB, string>;

  const useTable = <KInput extends K>(
    tableName: KInput,
    options?: UseTableOptions<DB[KInput]>
  ): UseTable<DB[KInput]> => {
    type V = DB[KInput];

    const rerender = useRerender();

    const sf = useContext(Context) as Solarflare<DB>;
    const tableEntry = sf?.table(tableName);

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
      return { isLoading: true, data: undefined, optimistic: undefined };
    }

    const data = Array.from(tableEntry.data.values())
      .filter(
        (row): row is SlotNormal<V> | SlotInserted<V> | SlotUpdated<V> =>
          row.status !== "deleted"
      )
      .map((row) => {
        if (row.status === "normal") {
          return row.value;
        }
        if (row.status === "updated") {
          return row.override;
        }
        if (row.status === "inserted") {
          return row.override;
        }
        // Exhaustiveness check.
        const _: never = row;
        throw new Error("Unreachable");
      });

    // Perform an in-place sort of the array
    if (options?.sort !== undefined) {
      data.sort(options.sort);
    }

    const optimistic = (change: OptimisticChange<DB[KInput]>) => {
      sf.optimistic({ ...change, table: tableName });

      const rollback = () => {
        sf.clearOverride({ table: tableName, id: change.id });
        sf.table(tableName)?.notify();
      };

      return { rollback };
    };

    return {
      isLoading: false,
      data,
      optimistic,
    };
  };

  return { useTable };
};
