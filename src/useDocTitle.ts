import { useEffect } from "react";

export function useDocTitle(page: string) {
  useEffect(() => {
    document.title = `${page} — HireReady`;
    return () => { document.title = "HireReady"; };
  }, [page]);
}
