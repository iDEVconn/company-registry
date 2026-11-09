import { useMutation } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';
import { resolveAdapter } from '../adapters/index';
import type { CompanyAdapter, CompanyCandidate } from '../types';

export interface CompanySearch {
  /** Searches the registry of the selected country. Blank names are ignored and send no request. */
  search(name: string): void;
  /** Aborts any in-flight request and clears the result. */
  reset(): void;
  data: CompanyCandidate[] | undefined;
  isPending: boolean;
  error: Error | null;
}

export interface CompanySearchOptions {
  /** Adapters to choose from, for example ones created with a custom `basePath`. Defaults to the built-in list. */
  adapters?: readonly CompanyAdapter[];
}

export function useCompanySearch(country: string, options: CompanySearchOptions = {}): CompanySearch {
  const controller = useRef<AbortController | null>(null);
  const mutation = useMutation({
    mutationFn: ({ name, signal }: { name: string; signal: AbortSignal }) =>
      resolveAdapter(country, options.adapters).adapter.search(name, signal, country),
  });
  const { mutate, reset: resetMutation } = mutation;

  const search = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      controller.current?.abort();
      controller.current = new AbortController();
      mutate({ name: trimmed, signal: controller.current.signal });
    },
    [mutate],
  );

  const reset = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    resetMutation();
  }, [resetMutation]);

  useEffect(() => () => controller.current?.abort(), []);

  return { search, reset, data: mutation.data, isPending: mutation.isPending, error: mutation.error };
}
