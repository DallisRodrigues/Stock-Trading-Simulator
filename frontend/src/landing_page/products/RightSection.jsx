import React from "react";
import { ProductLinks } from "./ProductLinks";

function RightSection({ imageURL, productName, productDesription, learnMore }) {
  return (
    <div className="container mt-5">
      <div className="row align-items-center">
        <div className="col-12 col-lg-6 p-5 mt-lg-5 order-2 order-lg-1">
          <h1>{productName}</h1>
          <p>{productDesription}</p>
          <ProductLinks learnMore={learnMore} />
        </div>
        <div className="col-12 col-lg-6 order-1 order-lg-2">
          <img src={imageURL} alt={`${productName} screenshot`} className="img-fluid" />
        </div>
      </div>
    </div>
  );
}

export default RightSection;
