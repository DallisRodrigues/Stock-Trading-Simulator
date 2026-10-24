const NY = "America/New_York";

function nyParts(date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: NY,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((p) => [p.type, Number(p.value)])
  );
  return parts;
}

function nyWallTime(year, month, day, hour, minute = 0) {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const p = nyParts(guess);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return new Date(guess.getTime() - (asUtc - guess.getTime()));
}

function nextMarketClose(now = new Date()) {
  const p = nyParts(now);
  let close = nyWallTime(p.year, p.month, p.day, 16);
  if (close <= now) {
    const tomorrow = new Date(Date.UTC(p.year, p.month - 1, p.day + 1, 12));
    close = nyWallTime(tomorrow.getUTCFullYear(), tomorrow.getUTCMonth() + 1, tomorrow.getUTCDate(), 16);
  }
  return close;
}

module.exports = { nyParts, nyWallTime, nextMarketClose };
