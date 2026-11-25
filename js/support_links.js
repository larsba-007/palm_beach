// js/support_links.js
//
// Everything the Web Party Edition's "SUPPORT US" popup shows, in one place.
// To change a text, a button label or a link, edit this file only.
//
// - Each offer becomes one card in the popup. Offers are shown left to right in this order.
// - An offer whose `url` is missing or not a web address (http/https) is not shown at all,
//   so a half-finished offer can never produce a dead button.
// - `accent` is the card's color (border, badge and button).
// - Tracking: `tracking` is added to every link (and `utm_campaign` is set to the offer's `id`),
//   so you can see in your web statistics how many visitors came from the web game.
//   Set `tracking` to {} to switch tracking off.
// - Used by the Web edition only. The Steam builds never open this popup.

export const SUPPORT_US = {
    title: "SUPPORT US",

    offers: [
        {
            id: "steam-key",
            accent: "#F3C80D",
            heading: "GET THE FULL STEAM GAME",
            text: "at backhansgames.com",
            badge: "EXCLUSIVE WEB OFFER — 50% OFF",
            buttonLabel: "GET MY STEAM KEY →",
            // TODO: replace with the webshop page for the Steam key once it exists
            url: "https://www.backhansgames.com"
        },
        {
            id: "board-game",
            accent: "#24b47e",
            heading: "FOLLOW OUR BOARD GAME",
            text: "Boca Raton is coming as a real board game on Kickstarter.",
            badge: "",
            buttonLabel: "VIEW ON KICKSTARTER →",
            url: "https://www.kickstarter.com/projects/backhansgames/boca-raton-and-palm-beach"
        }
    ],

    tracking: {
        utm_source: "web_party",
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
        .map(offer => ({ ...offer, href: buildSupportUrl(offer.url, offer.id, config.tracking) }))
        .filter(offer => offer.href !== "");
}
