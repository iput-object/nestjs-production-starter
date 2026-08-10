/** Stored / domain values (match former Prisma enum labels). */
export const DevicePlatform = Object.freeze({
  IOS: 'IOS',
  ANDROID: 'ANDROID',
  WEB: 'WEB',
} as const);

export type DevicePlatformValue =
  (typeof DevicePlatform)[keyof typeof DevicePlatform];

export const DEVICE_PLATFORMS = Object.values(DevicePlatform);

/** Wire format accepted by the register-token API. */
export const DevicePlatformApi = Object.freeze({
  IOS: 'ios',
  ANDROID: 'android',
  WEB: 'web',
} as const);

export type DevicePlatformApiValue =
  (typeof DevicePlatformApi)[keyof typeof DevicePlatformApi];

export const DEVICE_PLATFORM_API_VALUES = Object.values(DevicePlatformApi);

export const DEVICE_PLATFORM_FROM_API: Record<
  DevicePlatformApiValue,
  DevicePlatformValue
> = {
  [DevicePlatformApi.IOS]: DevicePlatform.IOS,
  [DevicePlatformApi.ANDROID]: DevicePlatform.ANDROID,
  [DevicePlatformApi.WEB]: DevicePlatform.WEB,
};

export const DEVICE_PLATFORM_TO_API: Record<
  DevicePlatformValue,
  DevicePlatformApiValue
> = {
  [DevicePlatform.IOS]: DevicePlatformApi.IOS,
  [DevicePlatform.ANDROID]: DevicePlatformApi.ANDROID,
  [DevicePlatform.WEB]: DevicePlatformApi.WEB,
};
