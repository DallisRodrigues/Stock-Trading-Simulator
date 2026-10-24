import React from "react";
import { SUPPORT_URL } from "./topics";

const QUICK_LINKS = ["Track account opening", "Track segment activation", "Intraday margins", "Kite user manual"];

function Hero({ query, onQueryChange }) {
  return (
    <section className="container-fluid" id="supportHero">
      <div className="p-4 p-md-5" id="supportWrapper">
        <h4>Support Portal</h4>
        <a href={SUPPORT_URL} target="_blank" rel="noreferrer">
          Track Tickets
        </a>
      </div>
      <div className="row p-3 p-md-5 m-md-3">
        <div className="col-12 col-lg-6 p-3">
          <h1 className="fs-3">Search for an answer or browse help topics to create a ticket</h1>
          <form
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              document.getElementById("help-topics")?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            <input
              placeholder="Eg. how do I activate F&O"
              aria-label="Search help topics"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
            />
          </form>
          <div className="support-quick-links">
            {QUICK_LINKS.map((label) => (
              <a key={label} href={SUPPORT_URL} target="_blank" rel="noreferrer">
                {label}
              </a>
            ))}
          </div>
        </div>
        <div className="col-12 col-lg-6 p-3">
          <h1 className="fs-3">Featured</h1>
          <ol>
            <li>
              <a href={SUPPORT_URL} target="_blank" rel="noreferrer">
                Current Takeovers and Delisting
              </a>
            </li>
            <li>
              <a href={SUPPORT_URL} target="_blank" rel="noreferrer">
                Latest Intraday leverages - MIS & CO
              </a>
            </li>
          </ol>
        </div>
      </div>
    </section>
  );
}

export default Hero;
