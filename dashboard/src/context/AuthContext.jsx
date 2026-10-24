import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import api, { setUnauthorizedHandler } from "../api/client";
import { LANDING_URL } from "../config";

const AuthContext = createContext(null);

const redirectToLogin = () => window.location.assign(`${LANDING_URL}/login?expired=1`);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: "loading", user: null });

  const refreshUser = useCallback(async () => {
    const res = await api.get("/auth/me", { skipAuthRedirect: true });
    setState({ status: "ready", user: res.data.user });
    return res.data.user;
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(redirectToLogin);
    refreshUser().catch((err) => {
      if (err.response?.status === 401) redirectToLogin();
      else setState({ status: "error", user: null });
    });
  }, [refreshUser]);

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout", null, { skipAuthRedirect: true });
    } finally {
      window.location.assign(`${LANDING_URL}/login?loggedOut=1`);
    }
  }, []);

  if (state.status === "loading") {
    return <div className="app-status">Loading your account…</div>;
  }
  if (state.status === "error") {
    return (
      <div className="app-status">
        <p>Cannot reach the server. Check that the backend is running.</p>
        <button className="btn btn-blue" onClick={() => window.location.reload()}>
          Retry
        </button>
      </div>
    );
  }

  return <AuthContext.Provider value={{ user: state.user, refreshUser, logout }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
