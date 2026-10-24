import React from "react";
import Hero from "./Hero";
import Awards from "./Awards";
import Stats from "./Stats";
import Pricing from "./Pricing";
import Education from "./Education";
import Features from "./Features";

import OpenAccount from "../OpenAccount";

function HomePage() {
  return (
    <>
      <Hero />
      <Features />
      <Awards />
      <Stats />
      <Pricing />
      <Education />
      <OpenAccount />
    </>
  );
}

export default HomePage;
