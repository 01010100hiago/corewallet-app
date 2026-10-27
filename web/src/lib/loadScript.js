const cache = new Map();

// Carrega um script externo uma única vez. Se falhar (rede, bloqueador), a
// próxima tentativa carrega de novo em vez de ficar presa no erro.
export function loadScript(src) {
  if (cache.has(src)) return cache.get(src);
  const promise = new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = src;
    el.async = true;
    el.defer = true;
    el.onload = () => resolve();
    el.onerror = () => {
      el.remove();
      cache.delete(src);
      reject(new Error(`Não foi possível carregar ${src}`));
    };
    document.head.appendChild(el);
  });
  cache.set(src, promise);
  return promise;
}
