import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { API_URL, DASHBOARD_URL } from "../../config";
import { useGuestDemo } from "../../hooks/useGuestDemo";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(mode, form) {
  const errors = {};
  if (mode === "signup" && form.name.trim().length < 2) errors.name = "Name must be at least 2 characters.";
  if (!EMAIL_RE.test(form.email.trim())) errors.email = "Enter a valid email address.";
  if (mode === "signup" && form.password.length < 8) errors.password = "Password must be at least 8 characters.";
  if (mode === "login" && !form.password) errors.password = "Password is required.";
  return errors;
}

async function postJson(path, body) {
  let res;
  try {
    res = await fetch(`${API_URL}/api${path}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Cannot reach the server. Check that the backend is running.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error?.message || "Something went wrong. Please try again.");
    err.details = data?.error?.details;
    throw err;
  }
  return data;
}

function Signup({ mode = "signup" }) {
  const isSignup = mode === "signup";
  const [params] = useSearchParams();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [session, setSession] = useState(null);
  const demo = useGuestDemo();

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${API_URL}/api/auth/session`, { credentials: "include", signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.user && setSession(d.user))
      .catch(() => {});
    return () => controller.abort();
  }, []);

  const onChange = (e) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
    setErrors((er) => ({ ...er, [e.target.name]: undefined }));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    const found = validate(mode, form);
    setErrors(found);
    setServerError("");
    if (Object.keys(found).length) return;

    setSubmitting(true);
    try {
      const body = isSignup ? { name: form.name.trim(), email: form.email.trim(), password: form.password } : { email: form.email.trim(), password: form.password };
      await postJson(isSignup ? "/auth/signup" : "/auth/login", body);
      window.location.assign(DASHBOARD_URL);
    } catch (err) {
      const fieldErrors = Object.fromEntries((err.details || []).map((d) => [d.field, d.message]));
      setErrors(fieldErrors);
      setServerError(err.message);
      setSubmitting(false);
    }
  };

  const notice = params.get("expired") ? "Your session has ended. Please log in again." : params.get("loggedOut") ? "You have been logged out." : "";

  return (
    <div className="container p-4 p-md-5 mb-5">
      <div className="row align-items-center">
        <div className="col-12 col-lg-6 text-center mb-4 mb-lg-0">
          <img src="/media/images/signup.png" alt="" className="img-fluid" />
        </div>
        <div className="col-12 col-lg-5 offset-lg-1">
          <h1 className="fs-2 mb-2">{isSignup ? "Open a demo account" : "Login to Kite"}</h1>
          <p className="text-muted mb-4">
            {isSignup
              ? "Start paper trading US stocks with $100,000 of virtual cash."
              : "Welcome back. Log in to your paper-trading dashboard."}
          </p>

          {notice && (
            <div className="alert alert-info py-2" role="status">
              {notice}
            </div>
          )}
          {session && (
            <div className="alert alert-success py-2 d-flex justify-content-between align-items-center" role="status">
              <span>Logged in as {session.email}</span>
              <a className="btn btn-sm btn-success" href={DASHBOARD_URL}>
                Go to dashboard
              </a>
            </div>
          )}
          {serverError && (
            <div className="alert alert-danger py-2" role="alert">
              {serverError}
            </div>
          )}

          <form onSubmit={onSubmit} noValidate>
            {isSignup && (
              <div className="mb-3">
                <label htmlFor="name" className="form-label">
                  Full name
                </label>
                <input
                  id="name"
                  name="name"
                  autoComplete="name"
                  className={`form-control${errors.name ? " is-invalid" : ""}`}
                  value={form.name}
                  onChange={onChange}
                  aria-describedby="name-error"
                />
                <div id="name-error" className="invalid-feedback">
                  {errors.name}
                </div>
              </div>
            )}
            <div className="mb-3">
              <label htmlFor="email" className="form-label">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                className={`form-control${errors.email ? " is-invalid" : ""}`}
                value={form.email}
                onChange={onChange}
                aria-describedby="email-error"
              />
              <div id="email-error" className="invalid-feedback">
                {errors.email}
              </div>
            </div>
            <div className="mb-4">
              <label htmlFor="password" className="form-label">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete={isSignup ? "new-password" : "current-password"}
                className={`form-control${errors.password ? " is-invalid" : ""}`}
                value={form.password}
                onChange={onChange}
                aria-describedby="password-error"
              />
              <div id="password-error" className="invalid-feedback">
                {errors.password}
              </div>
              {isSignup && !errors.password && <div className="form-text">At least 8 characters.</div>}
            </div>
            <button type="submit" className="btn btn-primary w-100 p-2 fs-5" disabled={submitting}>
              {submitting ? (isSignup ? "Creating account…" : "Logging in…") : isSignup ? "Sign up" : "Login"}
            </button>
          </form>

          <div className="divider-text my-4">
            <span>or</span>
          </div>
          <button type="button" className="btn btn-outline-primary w-100 p-2" onClick={demo.start} disabled={demo.loading}>
            {demo.loading ? "Preparing demo…" : "Try the demo without an account"}
          </button>
          {demo.error && (
            <p className="text-danger small mt-2" role="alert">
              {demo.error}
            </p>
          )}

          <p className="mt-4 text-muted">
            {isSignup ? (
              <>
                Already have an account? <Link to="/login">Login</Link>
              </>
            ) : (
              <>
                New here? <Link to="/signup">Open a demo account</Link>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

export default Signup;
