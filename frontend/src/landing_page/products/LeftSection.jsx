import React from "react";
import { ProductLinks } from "./ProductLinks";

function LeftSection({ imageURL, productName, productDesription, tryDemo, learnMore, googlePlay, appStore }) {
  return (
    <div className="container mt-5">
      <div className="row align-items-center">
        <div className="col-12 col-lg-6">
          <img src={imageURL} alt={`${productName} screenshot`} className="img-fluid" />
        </div>
        <div className="col-12 col-lg-6 p-5 mt-lg-5">
          <h1>{productName}</h1>
          <p>{productDesription}</p>
          <ProductLinks tryDemo={tryDemo} learnMore={learnMore} googlePlay={googlePlay} appStore={appStore} />
        </div>
      </div>
    </div>
  );
}

export default LeftSection;
