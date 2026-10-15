export function element<T extends HTMLElement = HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Required interface element #${id} is missing.`);
  return found as T;
}
