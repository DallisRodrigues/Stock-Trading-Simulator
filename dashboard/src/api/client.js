import axios from "axios";
import { API_URL } from "../config";

const api = axios.create({
  baseURL: `${API_URL}/api`,
  withCredentials: true,
  timeout: 15000,
});

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => {
  onUnauthorized = fn;
};

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && !err.config?.skipAuthRedirect) onUnauthorized();
    return Promise.reject(err);
  }
);

export function errorMessage(err, fallback = "Something went wrong. Please try again.") {
  if (axios.isCancel(err)) return null;
  if (!err?.response) return "Cannot reach the server. Check that the backend is running.";
  return err.response.data?.error?.message || fallback;
}

export const newClientOrderId = () =>
  globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;

export default api;
