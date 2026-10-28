// Centavos -> texto do campo de valor ("1234,5" vira "1234,50"), sem separador de milhar.
export function centsToInput(cents) {
  return (cents / 100).toFixed(2).replace(".", ",");
}
