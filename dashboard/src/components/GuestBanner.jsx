import React from "react";
import { useAuth } from "../context/AuthContext";
import { LANDING_URL } from "../config";

const GuestBanner = () => {
  const { user } = useAuth();
  if (!user?.isGuest) return null;
  const hoursLeft = user.guestExpiresAt ? Math.max(0, Math.round((new Date(user.guestExpiresAt) - Date.now()) / 3_600_000)) : null;
  return (
    <div className="guest-banner" role="note">
      <span>
        You're exploring a <strong>temporary demo account</strong> with a sample portfolio
        {hoursLeft != null ? ` — it is deleted in about ${hoursLeft} hour${hoursLeft === 1 ? "" : "s"} or when you log out.` : "."}
      </span>
      <a href={`${LANDING_URL}/signup`}>Create a free account</a>
    </div>
  );
};

export default GuestBanner;
