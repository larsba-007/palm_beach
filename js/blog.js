

// Blog Data for Start Screen News Feed

export const NEWS_POSTS = [
    {
        id: 'post-1',
        title: "We launch soon! Be there for DAY 1",
        date: "",
        // Use 'new URL' to ensure Vite bundles the asset correctly
        image: new URL(/* @vite-ignore */ '../assets/post-1_image.webp', import.meta.url).href,
        // Using the same image for 2x fallback if you don't have a @2x version yet. 
        // If you add 'post-1_image@2x.webp', update this line to point to it.
        image2x: new URL(/* @vite-ignore */ '../assets/post-1_image.webp', import.meta.url).href,
        link: "https://www.kickstarter.com/projects/backhansgames/boca-raton-and-palm-beach",
        text: ""
    },
    {
        id: 'post-2',
        title: "WISHLIST NOW for the launch discount.",
        date: "",
        image: new URL(/* @vite-ignore */ '../assets/steam_logob.png', import.meta.url).href,
        image2x: new URL(/* @vite-ignore */ '../assets/steam_logob@2x.png', import.meta.url).href,
        link: "https://store.steampowered.com/app/4307400/Gold_Coast_Gambits_Boca_Raton__Palm_Beach/",
        text: ""
    },
];