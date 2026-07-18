import type { MetadataRoute } from "next";

// Web App Manifest -- enables "Add to Home Screen" / install as a PWA in
// real Safari and Chrome (name, icon, standalone chrome-less display, brand
// theming). Note: this does NOT help inside in-app browsers (Gmail/Google
// app webviews), which don't offer install at all regardless of manifest --
// see InAppBrowserBanner for the nudge that handles that case.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Hansen Health",
    short_name: "Hansen Health",
    description: "Track exercise goals together as a family.",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f4f5",
    theme_color: "#1d2d3d",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
