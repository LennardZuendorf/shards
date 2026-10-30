// Node 24 implements the JSON source-text proposal. TypeScript's standard
// library does not declare these APIs yet. Integration tests pin wire behavior.
interface JSON {
  rawJSON(text: string): object;
}
