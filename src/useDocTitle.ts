import { useEffect } from "react";

export function useDocTitle(page: string) {
  useEffect(() => {
    document.title = `${page} — HireStepX`;
    return () => { document.title = "HireStepX"; };
  }, [page]);
}
