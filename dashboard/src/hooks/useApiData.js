import { useEffect, useState } from "react";
import axios from "axios";
import api, { errorMessage } from "../api/client";

export function useApiData(path, version = 0) {
  const key = `${path}#${version}`;
  const [state, setState] = useState({ key: null, data: null, error: "" });

  useEffect(() => {
    const controller = new AbortController();
    api
      .get(path, { signal: controller.signal })
      .then((res) => setState({ key, data: res.data, error: "" }))
      .catch((err) => {
        if (axios.isCancel(err)) return;
        setState((s) => ({ key, data: s.data, error: errorMessage(err) }));
      });
    return () => controller.abort();
  }, [path, key]);

  return { data: state.data, error: state.error, loading: state.key !== key };
}
