export const JEV_POLICY_VERSION = "oryx-sort-3-autonomous";
export function cleanBankText(text: string) {
  return text.replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi,"[email]")
    .replace(/\b(?:\+?61|0)[2-478](?:[\s-]?\d){8}\b/g,"[phone]")
    .replace(/\b\d{5,}\b/g,"[reference]")
    .replace(/\bxx\d+\b/gi,"[card]").slice(0,300);
}
export function automaticCategory(category:string,probability:number) {
  return !!category && category !== 'unsorted' && Number.isFinite(probability) && probability >= 0 && probability <= 1;
}
export function automaticChanges(category:string,kind:string) {
  return {category:category==='__transfer'?'unsorted':category==='__debt'?'loan':category,kind:category==='__transfer'?'transfer':category==='__debt'?'debt':kind};
}
