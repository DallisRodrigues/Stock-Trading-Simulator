import React from "react";
import { Link } from "react-router-dom";

function OpenAccount() {
  return (
    <div className="container p-5 mb-5">
      <div className="row text-center">
        <h1 className="mt-5">Open a free demo account</h1>
        <p>Practice trading US stocks with $100,000 of virtual cash and real-time prices — no bank account or KYC needed.</p>
        <Link to="/signup" className="p-2 btn btn-primary fs-5 mb-5 cta-button">
          Sign up for free
        </Link>
      </div>
    </div>
  );
}

export default OpenAccount;
