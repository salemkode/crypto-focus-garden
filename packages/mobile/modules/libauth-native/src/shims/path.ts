/**
 * `path` / `node:path` for React Native (POSIX semantics via path-browserify).
 * `resolve()` treats `/` as the working directory, since apps have no cwd.
 */
import pathBrowserify from 'path-browserify';

const resolve = (...segments: string[]) => pathBrowserify.resolve('/', ...segments);

const path = { ...pathBrowserify, resolve, posix: { ...pathBrowserify, resolve } };

export const { basename, delimiter, dirname, extname, format, isAbsolute, join, normalize, parse, relative, sep } =
  pathBrowserify;
export { resolve };
export const posix = path.posix;
export default path;
