import pagination from './pagination.json';
import response from './response.json';
import error from './error.json';
import logging from './logging.json';
import auth from './auth.json';
import fcm from './fcm.json';
import files from './files.json';

type LocaleNode = { readonly [key: string]: string | LocaleNode };

function withFallback<T extends LocaleNode>(obj: T): T {
  return new Proxy(obj, {
    get(target, prop: string | symbol): unknown {
      if (typeof prop !== 'string') {
        return Reflect.get(target, prop);
      }
      if (Object.prototype.hasOwnProperty.call(target, prop)) {
        const value = target[prop];
        if (typeof value === 'object' && value !== null) {
          return withFallback(value);
        }
        return value;
      }
      return prop;
    },
  });
}

export default withFallback({
  pagination,
  response,
  error,
  logging,
  auth,
  fcm,
  files,
});
