/**
 * The sliver of Node the harness touches.
 *
 * `@types/node` is not a dependency of this project and adding one for two
 * globals in one script would be a strange trade. `console` comes from the DOM
 * lib; this declares the rest.
 */
declare const process: {
  readonly argv: readonly string[];
  exitCode: number | undefined;
};
