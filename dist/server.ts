// Petit serveur local autonome (aucune dependance reseau).
// Sert index.html sur http://localhost:8000 afin que le bouton "Copier"
// fonctionne (l'API clipboard du navigateur exige un contexte localhost/securise).

const PORT = 8000;
const html = await Deno.readTextFile(new URL("./index.html", import.meta.url));

Deno.serve({ port: PORT }, () => {
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
});

console.log(`Serveur pret sur http://localhost:${PORT}`);
