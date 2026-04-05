import { useEffect } from "react";

export function useDocTitle(page: string) {
  useEffect(() => {
    document.title = `${page} — Hirloop`;
    return () => { document.title = "Hirloop"; };
  }, [page]);
}
