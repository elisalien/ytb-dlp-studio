// Petit serveur local autonome (aucune dependance reseau).
// Sert index.html sur http://localhost:8000 afin que le bouton "Copier"
// fonctionne (l'API clipboard du navigateur exige un contexte localhost/securise).

const PORT = 8000;
const html = await Deno.readTextFile(new URL("./index.html", import.meta.url));

// Sécurité : on lie explicitement le serveur à 127.0.0.1 (et non 0.0.0.0)
// pour qu'il ne soit JAMAIS accessible depuis le réseau local, seulement
// depuis cette machine.
Deno.serve({ port: PORT, hostname: "127.0.0.1" }, () => {
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
});

console.log(`Serveur pret sur http://localhost:${PORT}`);
