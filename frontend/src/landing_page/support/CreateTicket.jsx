import React from "react";
import { SUPPORT_URL, TOPICS } from "./topics";

function CreateTicket({ query = "" }) {
  const q = query.trim().toLowerCase();
  const topics = TOPICS.map((t) => ({
    ...t,
    items: !q || t.title.toLowerCase().includes(q) ? t.items : t.items.filter((i) => i.toLowerCase().includes(q)),
  })).filter((t) => t.items.length);

  return (
    <div className="container" id="help-topics">
      <div className="row p-3 p-md-5 mt-5 mb-5">
        <h1 className="fs-2">To create a ticket, select a relevant topic</h1>
        {!topics.length && <p className="text-muted mt-3">No help topics match “{query.trim()}”.</p>}
        {topics.map((t) => (
          <div className="col-12 col-md-6 col-lg-4 p-4 p-lg-5 mt-2 mb-2" key={t.title}>
            <h4>
              <i className={`fa ${t.icon}`} aria-hidden="true"></i> {t.title}
            </h4>
            {t.items.map((item) => (
              <React.Fragment key={item}>
                <a href={SUPPORT_URL} target="_blank" rel="noreferrer" style={{ textDecoration: "none", lineHeight: "2.5" }}>
                  {item}
                </a>
                <br />
              </React.Fragment>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default CreateTicket;
