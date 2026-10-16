/* Which site a link is from ("https://www.eventbrite.ca/e/…" -> "Eventbrite"). The server and the add-event form share it. */
(function () {
  const SITES = [[/eventbrite\./, "Eventbrite"], [/dice\.fm/, "DICE"], [/meetup\.com/, "Meetup"], [/lu\.ma|luma\.com/, "Luma"], [/ticketmaster\./, "Ticketmaster"], [/instagram\.com/, "Instagram"], [/facebook\.com|fb\.me/, "Facebook"], [/partiful\.com/, "Partiful"], [/ra\.co/, "Resident Advisor"], [/posh\.vip/, "Posh"], [/universe\.com/, "Universe"], [/showclix|showpass/, "Showpass"]];
  const siteName = (url) => {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return (SITES.find(([re]) => re.test(host)) || [, host])[1];
  };
  if (typeof module === "object") module.exports = siteName;
  else window.SQ.siteName = siteName;
})();
