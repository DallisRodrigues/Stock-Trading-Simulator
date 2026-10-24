import React from "react";
import { Link } from "react-router-dom";

export function SmartLink({ href, children, style }) {
  if (!href) return null;
  if (href.startsWith("/")) {
    return (
      <Link to={href} style={style}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} target="_blank" rel="noreferrer" style={style}>
      {children}
    </a>
  );
}

export function ProductLinks({ tryDemo, learnMore, googlePlay, appStore }) {
  return (
    <>
      <div>
        <SmartLink href={tryDemo} style={{ marginRight: "50px" }}>
          Try Demo <i className="fa fa-long-arrow-right" aria-hidden="true"></i>
        </SmartLink>
        <SmartLink href={learnMore}>
          Learn More <i className="fa fa-long-arrow-right" aria-hidden="true"></i>
        </SmartLink>
      </div>
      {(googlePlay || appStore) && (
        <div className="mt-3">
          <SmartLink href={googlePlay} style={{ marginRight: "50px" }}>
            <img src="/media/images/googlePlayBadge.svg" alt="Get it on Google Play" />
          </SmartLink>
          <SmartLink href={appStore}>
            <img src="/media/images/appstoreBadge.svg" alt="Download on the App Store" />
          </SmartLink>
        </div>
      )}
    </>
  );
}
