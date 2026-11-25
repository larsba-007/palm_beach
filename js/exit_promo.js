// js/exit_promo.js

export const EXIT_PROMO = {
    title: "ENJOYING THE DEMO?",
    text: "Before you go... we are a small indie developer team. If you had fun playing today, the absolute best way to support us is completely free! Hitting \"Wishlist on Steam\" or \"Notify on Launch\" tells store algorithms to show our game to more players. Even if you don't plan to buy it right now, your click makes a massive difference for our upcoming launch.",
    kickstarter: {
        image: new URL(/* @vite-ignore */ '../assets/kickstarter-logo-green700.png', import.meta.url).href,
        link: "https://www.kickstarter.com/projects/backhansgames/boca-raton-and-palm-beach"
    },
    steam: {
        image: new URL(/* @vite-ignore */ '../assets/steam_logob@2x.webp', import.meta.url).href,
        link: "https://store.steampowered.com/app/4307400/Gold_Coast_Gambits_Boca_Raton__Palm_Beach/"
    }
};
