export {};

declare global {
  namespace Express {
    interface Locals {
      message?: string;
    }
  }
}
