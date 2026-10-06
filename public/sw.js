self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener("fetch", (event) => {
  if (
    event.request.method === "POST" &&
    event.request.url.endsWith("/share-target")
  ) {
    event.respondWith(
      (async () => {
        const formData = await event.request.formData();
        const files = formData.getAll("files");
        const text = formData.get("text") || formData.get("url");

        const client =
          (await clients.get(event.clientId)) ||
          (await clients.matchAll({ type: "window" }).then((c) => c[0]));
        if (client) {
          client.postMessage({ action: "share", files, text });
        }

        return Response.redirect("/", 303);
      })(),
    );
  }
});
