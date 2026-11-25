// js/support_links.js
//
// Everything the web edition's board game popup shows, in one place (design: SUPPORT_POPUP.md).
// To change a text, a button label or a link, edit this file only.
//
// - `buttonLabel` is the text on the party-menu button that opens the popup; `title` is the popup heading.
// - Each offer becomes one card in the popup, left to right in this order.
// - The offer with `main: true` is the main action: the larger card, with the only solid button.
// - `extraLink` is a plain text link under the card's button (not a button).
// - An offer whose `url` is missing or not a web address (http/https) is not shown at all,
//   so a half-finished offer can never produce a dead button.
// - `accent` is the card's color (border and button).
// - Tracking: `tracking` is added to every link (and `utm_campaign` is set to the offer's `id`),
//   so you can see in your web statistics how many visitors came from the web game.
//   Set `tracking` to {} to switch tracking off.
// - Used by the Web edition only. The Steam builds never open this popup.
//
// Copy rules: never write "click Notify me for 10 % off". Palm Beach = bidding, Boca Raton = push your luck.
// Palm Beach is not on Steam: the popup must never say "get the full Steam game".
// TEXTS: proposals from SUPPORT_POPUP.md until Lars has approved them.

export const SUPPORT_US = {
    buttonLabel: "THE BOARD GAME",
    title: "PLAY IT ON YOUR TABLE",
    // The quiet link on the final scoring screen that opens this popup (web edition only).
    gameOverLink: "Liked it? It's a real board game \u2192",

    offers: [
        {
            id: "board-game",
            main: true,
            accent: "#24b47e",
            heading: "COMING TO KICKSTARTER",
            text: "Palm Beach is one of two games in the box: Palm Beach (bidding) and Boca Raton (push your luck). 1\u20135 players, solo mode, 45\u201360 min.",
            badge: "",
            buttonLabel: "NOTIFY ME ON LAUNCH \u2192",
            url: "https://www.kickstarter.com/projects/backhansgames/boca-raton-and-palm-beach",
            extraLink: {
                label: "Join the VIP list for the 15% Early Bird \u2192",
                url: "https://backhansgames.com/go"
            }
        },
        {
            id: "steam",
            accent: "#F3C80D",
            heading: "PLAY BOCA RATON ON STEAM",
            text: "The other game in the box, as Gold Coast Gambits.",
            badge: "",
            buttonLabel: "VIEW ON STEAM \u2192",
            // This is the Boca Raton (Gold Coast Gambits) Steam page, on purpose: Palm Beach is not on Steam.
            url: "https://store.steampowered.com/app/4307400/"
        }
    ],

    tracking: {
        utm_source: "web_palm_beach",
        utm_medium: "support_popup"
    }
};

/** True only for real web addresses (blocks things like "javascript:..." or an empty value). */
export function isSafeSupportUrl(url) {
    try {
        const u = new URL(String(url));
        return u.protocol === "https:" || u.protocol === "http:";
    } catch {
        return false;
    }
}

/** Adds the tracking tags to a link. Tags already present in the link are kept. Returns "" for an unsafe link. */
export function buildSupportUrl(url, offerId, tracking = SUPPORT_US.tracking) {
    if (!isSafeSupportUrl(url)) return "";
    const u = new URL(url);
    for (const [key, value] of Object.entries(tracking || {})) {
        if (!u.searchParams.has(key)) u.searchParams.set(key, value);
    }
    if (tracking && Object.keys(tracking).length > 0 && offerId && !u.searchParams.has("utm_campaign")) {
        u.searchParams.set("utm_campaign", offerId);
    }
    return u.toString();
}

/** The offers that can be shown, each with its final link in `href`. */
export function getVisibleSupportOffers(config = SUPPORT_US) {
    return config.offers
        .map(offer => ({
            ...offer,
            href: buildSupportUrl(offer.url, offer.id, config.tracking),
            // The plain text link under the button gets the same tracking, with its own campaign name.
            extraHref: offer.extraLink ? buildSupportUrl(offer.extraLink.url, `${offer.id}-vip`, config.tracking) : ""
        }))
        .filter(offer => offer.href !== "");
}
