import React, { useState } from "react";

import Hero from "./Hero";
import CreateTicket from "./CreateTicket";

function SupportPage() {
  const [query, setQuery] = useState("");
  return (
    <>
      <Hero query={query} onQueryChange={setQuery} />
      <CreateTicket query={query} />
    </>
  );
}

export default SupportPage;
