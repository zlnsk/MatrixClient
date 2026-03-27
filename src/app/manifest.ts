import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "szept — Secure Messaging",
    short_name: "szept",
    description: "End-to-end encrypted messaging powered by the Matrix protocol",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#1f1f1f",
    theme_color: "#1f1f1f",
    categories: ["social", "communication"],
    icons: [
      { src: "/MatrixClient/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/MatrixClient/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/MatrixClient/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }
}
