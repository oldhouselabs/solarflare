"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Solarflare, notify } from "./solarflare";
import { OptimisticChange } from "./optimistic";
import { DBRow, InferPk, refFromQualifiedName } from "@repo/protocol-types";
import { SlotInserted, SlotNormal, SlotUpdated } from "./tables";

/**
 * Utility hook to trigger re-renders.
 */
export const useRerender = () => {
  const setTick = useState(0)[1];
  return () => setTick((t) => t + 1);
};

export type UseTable<Row extends DBRow> =
  | {
      readonly isLoading: true;
      readonly data: undefined;
      readonly optimistic: undefined;
    }
  | {
      readonly isLoading: false;
      readonly data: Row["$fields"][];
      optimistic: (change: OptimisticChange<Row>) => { rollback: () => void };
    };

export type UseTableOptions<Row extends DBRow> = {
  /**
   * Comparison function to define a sort ordering on the table rows.
   */
  sort?: (a: Row["$fields"], b: Row["$fields"]) => number;
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
  // eslint-disable-next-line @typescript-eslint/ban-types -- Required to allow passing the export of db.d.ts
  DB extends { [table: string]: DBRow } = {},
>() => {
  type K = Extract<keyof DB, string>;

  const useTable = <KInput extends K>(
    tableName: KInput,
    options?: UseTableOptions<DB[KInput]>
  ): UseTable<DB[KInput]> => {
    type V = DB[KInput]["$fields"];

    console.log("useTable", tableName);

    const rerender = useRerender();

    const sf = useContext(Context) as Solarflare<DB>;
    const tableRef = refFromQualifiedName(tableName);
    const tableEntry = sf?.tables.get(tableRef);

    useEffect(() => {
      if (sf === undefined) {
        throw new Error(
          "Solarflare context not found. Do you need to wrap your app in a Solarflare provider?"
        );
      }

      sf.subscribe(tableRef, rerender);

      return () => {
        // TODO: unsubscribe
      };
    }, [tableRef, rerender, sf]);

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
      const pk: InferPk<DB[KInput]> = tableEntry.info.pk;
      const pkValue = change[pk];
      sf.optimistic({ ...change, table: tableName });

      const rollback = () => {
        sf.clearOverride({ ref: tableEntry.info.ref, pk: pkValue });
        const table = sf.tables.get(tableEntry.info.ref);
        table && notify(table.subscribers);
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
