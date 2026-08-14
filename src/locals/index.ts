import pagination from './pagination.json';
import response from './response.json';
import error from './error.json';
import logging from './logging.json';
import auth from './auth.json';
import fcm from './fcm.json';
import files from './files.json';

/** Nested catalog: sections contain message strings (or nested sections). */
type MessageTree = {
  readonly [key: string]: string | MessageTree;
};

const locales = {
  pagination,
  response,
  error,
  logging,
  auth,
  fcm,
  files,
} as const satisfies MessageTree;

export type Locals = typeof locales;

/** When true, leaf access returns dotted keys instead of message text. */
const LOCALS_RETURN_KEYS = false;

/**
 * When LOCALS_RETURN_KEYS is true, leaf access returns the dotted key path
 * (e.g. `student.student_removed`) instead of the message value.
 */
function withKeysMode<T extends object>(obj: T, prefix = ''): T {
  return new Proxy(obj, {
    get(target, prop, receiver) {
      if (typeof prop !== 'string') {
        return Reflect.get(target, prop, receiver);
      }

      const path = prefix ? `${prefix}.${prop}` : prop;

      if (!Object.prototype.hasOwnProperty.call(target, prop)) {
        return path;
      }

      const value = Reflect.get(target, prop, receiver);
      if (typeof value === 'string') {
        return LOCALS_RETURN_KEYS ? path : value;
      }
      if (typeof value === 'object' && value !== null) {
        return withKeysMode(value, path);
      }

      return path;
    },
  });
}

const locals: Locals = withKeysMode(locales);

export default locals;
