/**
 * Sequential SQL placeholder binder. `bind(value)` appends the value and returns
 * its `$N` placeholder, so numbering is GLOBAL across a composed statement —
 * impossible to mis-number or SQL-inject. Port of the theo-rag pattern (Rule 9).
 */
export class ParamBuilder {
  private readonly _params: unknown[] = [];

  bind(value: unknown): string {
    this._params.push(value);
    return `$${this._params.length}`;
  }

  getParams(): unknown[] {
    return [...this._params];
  }

  getCount(): number {
    return this._params.length;
  }
}
