import React from "react";

import Hero from "./Hero";
import LeftSection from "./LeftSection";
import RightSection from "./RightSection";
import Universe from "./Universe";

function ProductsPage() {
  return (
    <>
      <Hero />
      <LeftSection
        imageURL="/media/images/kite.png"
        productName="Kite"
        productDesription="Our ultra-fast flagship trading platform with streaming market data, advanced charts, an elegant UI, and more. Enjoy the Kite experience seamlessly on your Android and iOS devices."
        tryDemo="/signup"
        learnMore="https://kite.zerodha.com/"
        googlePlay="https://play.google.com/store/apps/details?id=com.zerodha.kite3"
      />
      <RightSection
        imageURL="/media/images/console.png"
        productName="Console"
        productDesription="The central dashboard for your Zerodha account. Gain insights into your trades and investments with in-depth reports and visualisations."
        learnMore="https://console.zerodha.com/"
      />
      <LeftSection
        imageURL="/media/images/coin.png"
        productName="Coin"
        productDesription="Buy direct mutual funds online, commission-free, delivered directly to your Demat account. Enjoy the investment experience on your Android and iOS devices."
        learnMore="https://coin.zerodha.com/"
        googlePlay="https://play.google.com/store/apps/details?id=com.zerodha.coin"
      />
      <RightSection
        imageURL="/media/images/kiteconnect.png"
        productName="Kite Connect API"
        productDesription="Build powerful trading platforms and experiences with our super simple HTTP/JSON APIs. If you are a startup, build your investment app and showcase it to our clientbase."
        learnMore="https://kite.trade/"
      />
      <LeftSection
        imageURL="/media/images/varsity.png"
        productName="Varsity mobile"
        productDesription="An easy to grasp, collection of stock market lessons with in-depth coverage and illustrations. Content is broken down into bite-size cards to help you learn on the go."
        learnMore="https://zerodha.com/varsity/"
        googlePlay="https://play.google.com/store/apps/details?id=com.zerodha.varsity"
      />
      <p className="text-center mt-5 mb-5">
        Want to know more about our technology stack? Check out the{" "}
        <a href="https://zerodha.tech/" target="_blank" rel="noreferrer">
          Zerodha.tech
        </a>{" "}
        blog.
      </p>
      <Universe />
    </>
  );
}

export default ProductsPage;