// El hash de la URL es la ruta (#/semana…): un enlace "#main-content" común
// la cambiaría y mandaría a Semana. Este mueve el foco sin tocar el hash.
export function skipToContent(event) {
  event.preventDefault();
  const main = document.getElementById('main-content');
  if (!main) return;
  if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
  main.focus();
  main.scrollIntoView?.({ block: 'start' });
}
