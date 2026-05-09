import pagination from './pagination.json';
import response from './response.json';
import error from './error.json';
import logging from './logging.json';
import auth from './auth.json';
//
//
//
function withFallback<T extends Record<string, any>>(obj: T): T {
  return new Proxy(obj, {
    get(target, prop: string) {
      if (prop in target) {
        const value = target[prop];
        // If nested object, apply fallback recursively
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
});
