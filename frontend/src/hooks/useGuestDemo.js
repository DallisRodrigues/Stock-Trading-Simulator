import { useState } from "react";
import { API_URL, DASHBOARD_URL } from "../config";

export function useGuestDemo() {
  const [state, setState] = useState({ loading: false, error: "" });

  const start = async () => {
    if (state.loading) return;
    setState({ loading: true, error: "" });
    try {
      const res = await fetch(`${API_URL}/api/auth/guest`, { method: "POST", credentials: "include" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message || "The demo could not be started. Please try again.");
      }
      window.location.assign(DASHBOARD_URL);
    } catch (err) {
      setState({
        loading: false,
        error: err instanceof TypeError ? "Cannot reach the server. Check that the backend is running." : err.message,
      });
    }
  };

  return { ...state, start };
}
